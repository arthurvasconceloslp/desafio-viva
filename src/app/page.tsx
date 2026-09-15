import Image from "next/image";
import Link from "next/link";
import { EVENT, PAYMENT, formatBRL } from "@/lib/config";

export default function HomePage() {
  return (
    <div>
      <section className="border-b border-gray-100 bg-gradient-to-b from-brand-light to-white">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 px-4 py-16 text-center sm:px-6">
          <Image
            src="/logo.png"
            alt={EVENT.name}
            width={96}
            height={96}
            className="h-24 w-24 object-contain"
            priority
          />
          <h1 className="text-3xl font-bold text-gray-900 sm:text-5xl">
            {EVENT.name}
          </h1>
          <p className="max-w-2xl text-lg text-gray-600">{EVENT.subtitle}</p>
          <Link
            href="/inscricao"
            className="rounded-full bg-brand px-8 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-dark"
          >
            Inscreva-se agora
          </Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-6 px-4 py-12 sm:grid-cols-3 sm:px-6">
        <InfoCard label="Data" value={EVENT.dateLabel} />
        <InfoCard label="Local" value={EVENT.locationLabel} />
        <InfoCard
          label="Inscrição"
          value={`${formatBRL(PAYMENT.feeAmountCents)} via Pix, vagas ilimitadas`}
        />
      </section>

      <section className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h2 className="text-xl font-semibold text-gray-900">Sobre a corrida</h2>
        <p className="mt-3 text-gray-600">{EVENT.description}</p>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h2 className="text-xl font-semibold text-gray-900">Premiação</h2>
        <p className="mt-3 text-gray-600">{EVENT.awardsText}</p>
      </section>

      <section className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-6 text-center">
          <p className="text-gray-700">
            Pronto para participar? A inscrição leva menos de um minuto e seu
            número de peito é gerado na hora.
          </p>
          <Link
            href="/inscricao"
            className="mt-4 inline-block rounded-full bg-brand px-6 py-2.5 font-semibold text-white transition-colors hover:bg-brand-dark"
          >
            Fazer inscrição
          </Link>
        </div>
      </section>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5 text-center shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand">
        {label}
      </p>
      <p className="mt-2 text-gray-800">{value}</p>
    </div>
  );
}
