import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin, type PaymentStatus } from "@/lib/supabase-admin";
import { reconcileOrder } from "@/lib/pagamento";

/**
 * Status de uma inscrição, consultado pela tela de espera enquanto o
 * participante olha o QR code.
 *
 * Só responde a quem tem o `public_token` (UUID aleatório, entregue apenas a
 * quem fez a inscrição) e devolve exclusivamente status e número de peito —
 * nenhum dado pessoal, para que o token não vire uma forma de vazar dados.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Token ausente." }, { status: 400 });
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch {
    return NextResponse.json(
      { error: "Banco não configurado." },
      { status: 500 }
    );
  }

  const { data: inscricao, error } = await supabase
    .from("inscricoes")
    .select("id, payment_status, numero_peito, mp_order_id, pix_expira_em")
    .eq("public_token", token)
    .maybeSingle();

  if (error || !inscricao) {
    return NextResponse.json(
      { error: "Inscrição não encontrada." },
      { status: 404 }
    );
  }

  let status = inscricao.payment_status as PaymentStatus;
  let numero = inscricao.numero_peito as number | null;

  if (status === "pendente" && inscricao.mp_order_id) {
    // Consulta o Mercado Pago a cada verificação. Isso faz a confirmação
    // aparecer na hora para quem está com a página aberta e funciona como
    // rede de segurança se o webhook estiver mal configurado — o webhook
    // continua sendo o que confirma quem fechou a aba.
    try {
      status = await reconcileOrder(inscricao.mp_order_id);
      if (status === "pago") {
        const { data: atualizada } = await supabase
          .from("inscricoes")
          .select("numero_peito")
          .eq("id", inscricao.id)
          .single();
        numero = atualizada?.numero_peito ?? null;
      }
    } catch (reconcileError) {
      // Indisponibilidade do Mercado Pago não pode quebrar a tela de espera:
      // seguimos com o que o banco já sabe e tentamos de novo no próximo poll.
      console.error("Falha ao consultar o Mercado Pago:", reconcileError);
    }
  }

  // Vencido e ainda pendente: o Mercado Pago às vezes demora para marcar a
  // ordem como expirada, mas para o participante já acabou.
  if (
    status === "pendente" &&
    inscricao.pix_expira_em &&
    new Date(inscricao.pix_expira_em).getTime() < Date.now()
  ) {
    status = "expirado";
    await supabase
      .from("inscricoes")
      .update({ payment_status: "expirado" })
      .eq("id", inscricao.id)
      .eq("payment_status", "pendente");
  }

  return NextResponse.json({
    status,
    numero,
    expiraEm: inscricao.pix_expira_em,
  });
}
