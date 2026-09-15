import { ConsultaForm } from "./ConsultaForm";

export const metadata = {
  title: "Consultar inscrição",
};

export default function ConsultaPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
        Consultar inscrição
      </h1>
      <p className="mt-2 text-gray-600">
        Já se inscreveu e quer ver seu número de peito? Informe seu CPF e sua
        data de nascimento.
      </p>
      <div className="mt-8">
        <ConsultaForm />
      </div>
    </div>
  );
}
