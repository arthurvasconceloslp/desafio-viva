import { createClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase com a service role key — só pode ser usado em código
 * que roda no servidor (Server Actions, Route Handlers). Nunca importar
 * este módulo em um Client Component.
 */
export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase não configurado. Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local."
    );
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type PaymentStatus =
  | "pendente"
  | "pago"
  | "expirado"
  | "falhou"
  | "cancelado";

export type Inscricao = {
  id: number;
  public_token: string;
  nome: string;
  cpf: string;
  data_nascimento: string;
  sexo: string;
  email: string;
  telefone: string;
  payment_status: PaymentStatus;
  numero_peito: number | null;
  valor_centavos: number;
  mp_order_id: string | null;
  mp_payment_id: string | null;
  mp_qr_code: string | null;
  mp_qr_code_base64: string | null;
  mp_ticket_url: string | null;
  pix_expira_em: string | null;
  pago_em: string | null;
  email_enviado_em: string | null;
  created_at: string;
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pendente: "Aguardando pagamento",
  pago: "Pago",
  expirado: "Pix expirado",
  falhou: "Pagamento recusado",
  cancelado: "Cancelado",
};
