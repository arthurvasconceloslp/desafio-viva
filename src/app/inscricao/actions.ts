"use server";

import { redirect } from "next/navigation";
import { inscricaoSchema } from "@/lib/validation";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { createPixCharge } from "@/lib/mercadopago";
import { getWebhookUrl } from "@/lib/site-url";
import { EVENT, PAYMENT } from "@/lib/config";

export type InscricaoFormState = {
  errors: Record<string, string[]>;
  message: string | null;
};

export async function createInscricao(
  _prevState: InscricaoFormState,
  formData: FormData
): Promise<InscricaoFormState> {
  // Honeypot: campo invisível que só um bot preencheria. Se vier com valor,
  // finge sucesso sem tocar no banco, para não revelar a defesa ao bot.
  if (String(formData.get("empresa") ?? "").trim() !== "") {
    return { errors: {}, message: null };
  }

  const validated = inscricaoSchema.safeParse({
    nome: formData.get("nome"),
    cpf: formData.get("cpf"),
    dataNascimento: formData.get("dataNascimento"),
    sexo: formData.get("sexo"),
    email: formData.get("email"),
    telefone: formData.get("telefone"),
  });

  if (!validated.success) {
    return {
      errors: validated.error.flatten().fieldErrors as Record<string, string[]>,
      message: "Corrija os campos destacados.",
    };
  }

  const { nome, cpf, dataNascimento, sexo, email, telefone } = validated.data;

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch {
    return {
      errors: {},
      message:
        "O sistema ainda não está conectado ao banco de dados. Tente novamente mais tarde.",
    };
  }

  // Só uma inscrição JÁ PAGA bloqueia o CPF. Tentativas pendentes ou
  // expiradas não impedem a pessoa de gerar um Pix novo.
  const { data: jaInscrito } = await supabase
    .from("inscricoes")
    .select("id")
    .eq("cpf", cpf)
    .eq("payment_status", "pago")
    .maybeSingle();

  if (jaInscrito) {
    return {
      errors: { cpf: ["Este CPF já está inscrito."] },
      message: "Corrija os campos destacados.",
    };
  }

  // A linha entra como 'pendente' e sem número de peito: ela guarda os dados
  // do participante enquanto o Pix não é pago. O peito só é atribuído quando
  // o webhook do Mercado Pago confirmar que o dinheiro entrou.
  const { data: inscricao, error } = await supabase
    .from("inscricoes")
    .insert({
      nome,
      cpf,
      data_nascimento: dataNascimento,
      sexo,
      email,
      telefone,
      payment_status: "pendente",
      valor_centavos: PAYMENT.feeAmountCents,
    })
    .select("id, public_token")
    .single();

  if (error || !inscricao) {
    if (error?.code === "23505") {
      return {
        errors: { cpf: ["Este CPF já está inscrito."] },
        message: "Corrija os campos destacados.",
      };
    }
    console.error("Falha ao criar inscrição:", error);
    return {
      errors: {},
      message: "Não foi possível concluir a inscrição. Tente novamente.",
    };
  }

  try {
    const charge = await createPixCharge({
      externalReference: String(inscricao.id),
      amountCents: PAYMENT.feeAmountCents,
      nome,
      email,
      cpf,
      description: `Inscrição — ${EVENT.name}`,
      notificationUrl: getWebhookUrl(),
    });

    await supabase
      .from("inscricoes")
      .update({
        mp_order_id: charge.orderId,
        mp_qr_code: charge.qrCode,
        mp_qr_code_base64: charge.qrCodeBase64,
        mp_ticket_url: charge.ticketUrl,
        pix_expira_em:
          charge.expiresAt ??
          new Date(
            Date.now() + PAYMENT.pixExpirationMinutes * 60_000
          ).toISOString(),
      })
      .eq("id", inscricao.id);
  } catch (chargeError) {
    console.error("Falha ao gerar cobrança Pix:", chargeError);
    await supabase
      .from("inscricoes")
      .update({ payment_status: "falhou" })
      .eq("id", inscricao.id);
    return {
      errors: {},
      message:
        "Não foi possível gerar o Pix agora. Tente novamente em alguns instantes.",
    };
  }

  // Fora do try: redirect() funciona lançando uma exceção interna do Next.js,
  // que seria engolida por um catch acima.
  redirect(`/inscricao/pagamento/${inscricao.public_token}`);
}
