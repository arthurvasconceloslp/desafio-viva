"use server";

import { z } from "zod";
import { isValidCPF, onlyDigits } from "@/lib/cpf";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { PaymentStatus } from "@/lib/supabase-admin";

/**
 * Consulta de inscrição pelo participante.
 *
 * Pede CPF **e** data de nascimento de propósito. Só com o CPF, qualquer
 * pessoa poderia descobrir quem está inscrito testando números — e CPFs
 * circulam com facilidade. Exigir a data de nascimento junto transforma isso
 * num palpite improvável e confirma que quem consulta é mesmo o inscrito.
 *
 * A resposta é deliberadamente magra: primeiro nome, número de peito e
 * situação do pagamento. Nada de email, telefone ou CPF completo, para que a
 * consulta não vire uma forma de extrair dados pessoais.
 */

const consultaSchema = z.object({
  cpf: z
    .string()
    .trim()
    .transform(onlyDigits)
    .refine((value) => isValidCPF(value), "CPF inválido."),
  dataNascimento: z
    .string()
    .trim()
    .refine(
      (value) => !Number.isNaN(Date.parse(value)),
      "Data de nascimento inválida."
    ),
});

export type ConsultaState = {
  erro: string | null;
  resultado: {
    primeiroNome: string;
    numero: number | null;
    status: PaymentStatus;
    /** Link para retomar o pagamento, quando ainda estiver pendente. */
    linkPagamento: string | null;
  } | null;
};

export async function consultarInscricao(
  _prevState: ConsultaState,
  formData: FormData
): Promise<ConsultaState> {
  const validado = consultaSchema.safeParse({
    cpf: formData.get("cpf"),
    dataNascimento: formData.get("dataNascimento"),
  });

  if (!validado.success) {
    return {
      erro: validado.error.issues[0]?.message ?? "Dados inválidos.",
      resultado: null,
    };
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch {
    return {
      erro: "O sistema está temporariamente indisponível. Tente mais tarde.",
      resultado: null,
    };
  }

  const { data, error } = await supabase
    .from("inscricoes")
    .select("nome, numero_peito, payment_status, public_token")
    .eq("cpf", validado.data.cpf)
    .eq("data_nascimento", validado.data.dataNascimento)
    // A inscrição paga é a que interessa; entre as demais, a mais recente.
    .order("numero_peito", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return {
      erro: "Não foi possível consultar agora. Tente novamente.",
      resultado: null,
    };
  }

  if (!data) {
    // Mensagem igual para "não existe" e "data não confere": revelar a
    // diferença entregaria que aquele CPF está inscrito.
    return {
      erro: "Não encontramos nenhuma inscrição com esses dados.",
      resultado: null,
    };
  }

  const status = data.payment_status as PaymentStatus;

  return {
    erro: null,
    resultado: {
      primeiroNome: data.nome.trim().split(/\s+/)[0] || data.nome,
      numero: data.numero_peito,
      status,
      linkPagamento:
        status === "pendente"
          ? `/inscricao/pagamento/${data.public_token}`
          : null,
    },
  };
}
