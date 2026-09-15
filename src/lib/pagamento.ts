import { getSupabaseAdmin, type PaymentStatus } from "./supabase-admin";
import { getOrder, mapOrderToStatus } from "./mercadopago";
import { sendConfirmationEmail } from "./email";

/**
 * Confirmação de pagamento — o único lugar do sistema que marca uma inscrição
 * como paga e atribui número de peito.
 *
 * Dois caminhos chegam aqui e ambos precisam ser idempotentes:
 *   1. o webhook do Mercado Pago (que pode reenviar o mesmo evento várias
 *      vezes, e é o que garante a confirmação de quem fechou a aba);
 *   2. a própria tela de espera do participante, que consulta o status
 *      enquanto ele olha o QR code — isso faz a confirmação aparecer na hora
 *      e também serve de rede de segurança caso o webhook esteja mal
 *      configurado.
 *
 * A atomicidade real (travar a linha, não queimar dois números de peito) está
 * na função `confirmar_pagamento` no Postgres, não aqui.
 */

type ConfirmacaoRow = {
  inscricao_id: number;
  peito: number | null;
  nome_participante: string;
  email_participante: string;
  ja_estava_pago: boolean;
};

/**
 * Varre as inscrições ainda pendentes e pergunta ao Mercado Pago o que
 * aconteceu com cada uma.
 *
 * Existe porque o webhook é a única peça do sistema fora do nosso controle:
 * ele depende de configuração no painel do Mercado Pago, de um segredo que
 * pode ser regenerado e de o serviço deles conseguir alcançar nosso servidor.
 * Esta varredura não depende de nada disso — é o nosso servidor perguntando,
 * com o nosso token. Se o webhook falhar em silêncio, quem fechou a aba ainda
 * assim é confirmado aqui.
 *
 * Reaproveita `reconcileOrder`, então continua valendo a mesma idempotência:
 * uma inscrição já paga não ganha outro número de peito nem outro email.
 */
export async function reconciliarPendentes(
  limite = 50
): Promise<{ verificadas: number; confirmadas: number; expiradas: number }> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("inscricoes")
    .select("id, mp_order_id, pix_expira_em")
    .eq("payment_status", "pendente")
    .not("mp_order_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(limite);

  if (error) {
    throw new Error(`Falha ao listar inscrições pendentes: ${error.message}`);
  }

  let confirmadas = 0;
  let expiradas = 0;

  for (const linha of data ?? []) {
    try {
      const status = await reconcileOrder(linha.mp_order_id as string);
      if (status === "pago") confirmadas++;
      else if (status === "expirado") expiradas++;
      else if (
        status === "pendente" &&
        linha.pix_expira_em &&
        new Date(linha.pix_expira_em as string).getTime() < Date.now()
      ) {
        // O Mercado Pago às vezes demora a marcar a ordem como expirada.
        await supabase
          .from("inscricoes")
          .update({ payment_status: "expirado" })
          .eq("id", linha.id)
          .eq("payment_status", "pendente");
        expiradas++;
      }
    } catch (erro) {
      // Uma ordem problemática não pode interromper a varredura das outras.
      console.error(`Falha ao reconciliar a ordem ${linha.mp_order_id}:`, erro);
    }
  }

  return { verificadas: data?.length ?? 0, confirmadas, expiradas };
}

/**
 * Consulta o Mercado Pago sobre uma ordem e aplica o resultado no banco.
 * Devolve o status final da inscrição.
 */
export async function reconcileOrder(orderId: string): Promise<PaymentStatus> {
  const order = await getOrder(orderId);
  const status = mapOrderToStatus(order);
  const paymentId = order.transactions?.payments?.[0]?.id ?? null;

  if (status === "pago") {
    await confirmarPagamento(orderId, paymentId);
    return "pago";
  }

  if (status !== "pendente") {
    const supabase = getSupabaseAdmin();
    // `eq('payment_status', 'pendente')` evita que uma notificação atrasada
    // de expiração reverta uma inscrição que já foi paga.
    await supabase
      .from("inscricoes")
      .update({ payment_status: status })
      .eq("mp_order_id", orderId)
      .eq("payment_status", "pendente");
  }

  return status;
}

/**
 * Marca a inscrição como paga, atribui o número de peito e envia o email de
 * confirmação — exatamente uma vez, mesmo que chamada várias vezes.
 */
export async function confirmarPagamento(
  orderId: string,
  paymentId: string | null
): Promise<{ numero: number | null }> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase.rpc("confirmar_pagamento", {
    p_order_id: orderId,
    p_payment_id: paymentId,
  });

  if (error) {
    // Propaga: o webhook responde 500 e o Mercado Pago reenvia o evento.
    throw new Error(`Falha ao confirmar pagamento ${orderId}: ${error.message}`);
  }

  const row = (data as ConfirmacaoRow[] | null)?.[0];
  if (!row) {
    // Ordem que não corresponde a nenhuma inscrição nossa.
    return { numero: null };
  }

  if (row.ja_estava_pago) {
    return { numero: row.peito };
  }

  // Melhor-esforço: a inscrição já está confirmada no banco, então uma falha
  // no envio do email não pode derrubar a confirmação nem fazer o Mercado
  // Pago reenviar o evento (o que arriscaria um segundo email).
  const emailResult = await sendConfirmationEmail({
    to: row.email_participante,
    nome: row.nome_participante,
    numero: row.peito ?? 0,
  });

  if (emailResult.sent) {
    await supabase
      .from("inscricoes")
      .update({ email_enviado_em: new Date().toISOString() })
      .eq("id", row.inscricao_id);
  } else {
    console.error(
      "Falha ao enviar email de confirmação:",
      emailResult.error
    );
  }

  return { numero: row.peito };
}
