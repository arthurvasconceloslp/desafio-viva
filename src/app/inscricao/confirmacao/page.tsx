import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { formatBRL } from "@/lib/config";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Inscrição confirmada",
  robots: { index: false, follow: false },
};

export default async function ConfirmacaoPage(
  props: PageProps<"/inscricao/confirmacao">
) {
  const searchParams = await props.searchParams;
  const token = Array.isArray(searchParams.token)
    ? searchParams.token[0]
    : searchParams.token;

  if (!token) {
    notFound();
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch {
    notFound();
  }

  // O número de peito vem do banco, nunca da URL: ele só existe depois que o
  // pagamento foi confirmado, e ninguém pode inventar um trocando a query.
  const { data: inscricao } = await supabase
    .from("inscricoes")
    .select("payment_status, numero_peito, valor_centavos, email")
    .eq("public_token", token)
    .maybeSingle();

  if (!inscricao) {
    notFound();
  }

  // Ainda não pagou (ou o Pix venceu): a tela de pagamento sabe tratar cada
  // caso e fica verificando sozinha até o dinheiro entrar.
  if (inscricao.payment_status !== "pago" || inscricao.numero_peito === null) {
    redirect(`/inscricao/pagamento/${token}`);
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand">
        Pagamento confirmado
      </p>
      <h1 className="mt-2 text-3xl font-bold text-gray-900 sm:text-4xl">
        Você está dentro!
      </h1>
      <div className="mt-8 rounded-2xl border border-brand-light bg-brand-light/50 p-10">
        <p className="text-sm text-gray-600">Seu número de peito é</p>
        <p className="mt-2 text-6xl font-extrabold text-brand">
          {inscricao.numero_peito}
        </p>
      </div>
      <p className="mt-6 text-gray-600">
        Guarde esse número — ele identifica sua inscrição na corrida. Pagamento
        de {formatBRL(inscricao.valor_centavos)} recebido via Pix.
      </p>
      <p className="mt-2 text-sm text-gray-500">
        Enviamos a confirmação para {inscricao.email}.
      </p>
      <Link
        href="/"
        className="mt-8 inline-block rounded-full bg-brand px-6 py-2.5 font-semibold text-white transition-colors hover:bg-brand-dark"
      >
        Voltar para o evento
      </Link>
    </div>
  );
}
