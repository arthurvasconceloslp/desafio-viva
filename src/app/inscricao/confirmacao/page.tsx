import Link from "next/link";
import { notFound } from "next/navigation";

export default async function ConfirmacaoPage(
  props: PageProps<"/inscricao/confirmacao">
) {
  const searchParams = await props.searchParams;
  const numeroRaw = Array.isArray(searchParams.numero)
    ? searchParams.numero[0]
    : searchParams.numero;
  const numero = Number(numeroRaw);

  if (!numeroRaw || Number.isNaN(numero)) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand">
        Inscrição confirmada
      </p>
      <h1 className="mt-2 text-3xl font-bold text-gray-900 sm:text-4xl">
        Você está dentro!
      </h1>
      <div className="mt-8 rounded-2xl border border-brand-light bg-brand-light/50 p-10">
        <p className="text-sm text-gray-600">Seu número de peito é</p>
        <p className="mt-2 text-6xl font-extrabold text-brand">{numero}</p>
      </div>
      <p className="mt-6 text-gray-600">
        Guarde esse número — ele identifica sua inscrição na corrida.
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
