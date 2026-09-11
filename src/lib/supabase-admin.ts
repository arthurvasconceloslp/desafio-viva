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

export type Inscricao = {
  id: number;
  nome: string;
  cpf: string;
  data_nascimento: string;
  sexo: string;
  email: string;
  telefone: string;
  created_at: string;
};
