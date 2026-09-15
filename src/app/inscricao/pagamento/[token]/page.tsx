import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { formatBRL } from "@/lib/config";
import { PagamentoStatus } from "./PagamentoStatus";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Pagamento da inscrição",
  robots: { index: false, follow: false },
};

export default async function PagamentoPage(
  props: PageProps<"/inscricao/pagamento/[token]">
) {
  const { token } = await props.params;

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch {
    notFound();
  }

  const { data: inscricao } = await supabase
    .from("inscricoes")
    .select(
      "nome, payment_status, valor_centavos, mp_qr_code, mp_qr_code_base64, pix_expira_em"
    )
    .eq("public_token", token)
    .maybeSingle();

  if (!inscricao) {
    notFound();
  }

  if (inscricao.payment_status === "pago") {
    redirect(`/inscricao/confirmacao?token=${token}`);
  }

  if (inscricao.payment_status !== "pendente") {
    const titulo =
      inscricao.payment_status === "expirado"
        ? "O código Pix venceu"
        : "O pagamento não foi concluído";

    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6">
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">{titulo}</h1>
        <p className="mt-4 text-gray-600">
          Sua vaga não foi reservada, mas nada foi cobrado. É só refazer a
          inscrição para gerar um novo código — seu CPF continua liberado.
        </p>
        <Link
          href="/inscricao"
          className="mt-8 inline-block rounded-full bg-brand px-6 py-2.5 font-semibold text-white transition-colors hover:bg-brand-dark"
        >
          Fazer a inscrição de novo
        </Link>
      </div>
    );
  }

  if (!inscricao.mp_qr_code || !inscricao.mp_qr_code_base64) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Não conseguimos gerar o código Pix
        </h1>
        <p className="mt-4 text-gray-600">
          Nada foi cobrado. Tente fazer a inscrição novamente em alguns
          instantes.
        </p>
        <Link
          href="/inscricao"
          className="mt-8 inline-block rounded-full bg-brand px-6 py-2.5 font-semibold text-white transition-colors hover:bg-brand-dark"
        >
          Voltar para a inscrição
        </Link>
      </div>
    );
  }

  const primeiroNome = inscricao.nome.trim().split(/\s+/)[0];

  return (
    <div className="mx-auto max-w-xl px-4 py-12 sm:px-6">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand">
        Falta só o pagamento
      </p>
      <h1 className="mt-2 text-2xl font-bold text-gray-900 sm:text-3xl">
        {primeiroNome}, pague o Pix para confirmar
      </h1>
      <p className="mt-3 text-gray-600">
        Abra o app do seu banco, escolha Pix, e escaneie o código abaixo ou
        cole o código copia e cola. Seu número de peito é gerado assim que o
        pagamento cair.
      </p>

      <div className="mt-8 rounded-2xl border border-brand-light bg-brand-light/40 p-6 text-center">
        <p className="text-sm text-gray-600">Valor da inscrição</p>
        <p className="text-3xl font-extrabold text-brand">
          {formatBRL(inscricao.valor_centavos)}
        </p>
        {/* Imagem vinda do Mercado Pago já em base64: não passa pelo
            otimizador do next/image, que só trabalha com URLs. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`data:image/png;base64,${inscricao.mp_qr_code_base64}`}
          alt="QR code do Pix para pagamento da inscrição"
          width={280}
          height={280}
          className="mx-auto mt-5 h-auto w-full max-w-[280px] rounded-xl border border-gray-200 bg-white p-3"
        />
      </div>

      <PagamentoStatus
        token={token}
        qrCode={inscricao.mp_qr_code}
        expiraEm={inscricao.pix_expira_em}
      />

      <p className="mt-8 text-center text-sm text-gray-500">
        Pode deixar esta página aberta. Se fechar, a confirmação chega do mesmo
        jeito por email assim que o pagamento for processado.
      </p>
    </div>
  );
}
