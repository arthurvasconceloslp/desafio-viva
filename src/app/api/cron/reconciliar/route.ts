import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/admin-session";
import { reconciliarPendentes } from "@/lib/pagamento";

/**
 * Varredura de inscrições pendentes — a rede de segurança do pagamento.
 *
 * Roda por dois gatilhos:
 *  1. o cron da Vercel (ver `vercel.json`), que manda
 *     `Authorization: Bearer <CRON_SECRET>` automaticamente quando a variável
 *     `CRON_SECRET` existe no projeto;
 *  2. o botão "Verificar pagamentos" no painel admin, autenticado pelo mesmo
 *     cookie de sessão do resto do admin.
 *
 * Sem nenhuma dessas provas a rota responde 401. Ela não é perigosa por si só
 * (no máximo consulta o Mercado Pago sobre pedidos nossos), mas é cara: cada
 * chamada faz uma consulta externa por inscrição pendente, então deixá-la
 * aberta seria um convite a esgotar nossa cota à toa.
 */

async function autorizado(request: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const header = request.headers.get("authorization");
    if (header === `Bearer ${cronSecret}`) return true;
  }

  const cookieStore = await cookies();
  return verifyAdminSessionToken(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
}

export async function GET(request: NextRequest) {
  if (!(await autorizado(request))) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const resultado = await reconciliarPendentes();
    console.log(
      `Varredura de pendentes: ${resultado.verificadas} verificada(s), ${resultado.confirmadas} confirmada(s), ${resultado.expiradas} expirada(s).`
    );
    return NextResponse.json({ ok: true, ...resultado });
  } catch (error) {
    console.error("Falha na varredura de pendentes:", error);
    return NextResponse.json(
      { error: "Falha ao verificar pagamentos pendentes." },
      { status: 500 }
    );
  }
}
