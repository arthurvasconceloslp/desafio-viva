"use server";

import { redirect } from "next/navigation";
import { inscricaoSchema } from "@/lib/validation";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendConfirmationEmail } from "@/lib/email";

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

  const { data, error } = await supabase
    .from("inscricoes")
    .insert({
      nome,
      cpf,
      data_nascimento: dataNascimento,
      sexo,
      email,
      telefone,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return {
        errors: { cpf: ["Este CPF já está inscrito."] },
        message: "Corrija os campos destacados.",
      };
    }
    return {
      errors: {},
      message: "Não foi possível concluir a inscrição. Tente novamente.",
    };
  }

  // Melhor-esforço: a inscrição já está salva, então um problema no envio do
  // email não deve impedir a confirmação. Erro fica só no log do servidor.
  const emailResult = await sendConfirmationEmail({
    to: email,
    nome,
    numero: data.id,
  });
  if (!emailResult.sent) {
    console.error("Falha ao enviar email de confirmação:", emailResult.error);
  }

  redirect(`/inscricao/confirmacao?numero=${data.id}`);
}
