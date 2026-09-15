"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  ADMIN_SESSION_COOKIE,
  checkAdminPassword,
  createAdminSessionToken,
  verifyAdminSessionToken,
} from "@/lib/admin-session";
import { reconciliarPendentes } from "@/lib/pagamento";

export type AdminLoginState = { error: string | null };

export async function loginAdmin(
  _prevState: AdminLoginState,
  formData: FormData
): Promise<AdminLoginState> {
  const password = String(formData.get("password") ?? "");

  let valid: boolean;
  try {
    valid = checkAdminPassword(password);
  } catch {
    return {
      error:
        "Painel ainda não configurado: defina ADMIN_PASSWORD nas variáveis de ambiente.",
    };
  }

  if (!valid) {
    return { error: "Senha incorreta." };
  }

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, createAdminSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });

  redirect("/admin/dashboard");
}

export async function logoutAdmin() {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_SESSION_COOKIE);
  redirect("/admin");
}

/**
 * Pergunta ao Mercado Pago o que aconteceu com as inscrições ainda pendentes.
 *
 * É a mesma varredura que o cron diário faz, disponível sob demanda para o
 * administrador não precisar esperar: se alguém pagou e fechou a aba, um
 * clique aqui confirma a inscrição, atribui o peito e dispara o email.
 */
export async function verificarPagamentosPendentes() {
  const cookieStore = await cookies();
  if (!verifyAdminSessionToken(cookieStore.get(ADMIN_SESSION_COOKIE)?.value)) {
    redirect("/admin");
  }

  try {
    await reconciliarPendentes();
  } catch (error) {
    // A página recarrega mostrando os dados que já existem; o erro fica no log.
    console.error("Falha ao verificar pagamentos pendentes:", error);
  }

  revalidatePath("/admin/dashboard");
}
