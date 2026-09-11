import { InscricaoForm } from "./InscricaoForm";

export default function InscricaoPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
        Inscrição
      </h1>
      <p className="mt-2 text-gray-600">
        Preencha seus dados abaixo. A inscrição é gratuita e seu número de
        peito é gerado assim que você confirmar.
      </p>
      <div className="mt-8">
        <InscricaoForm />
      </div>
    </div>
  );
}
