import { InscricaoForm } from "./InscricaoForm";
import { PAYMENT, formatBRL } from "@/lib/config";

export default function InscricaoPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
        Inscrição
      </h1>
      <p className="mt-2 text-gray-600">
        Preencha seus dados abaixo. A taxa de inscrição é de{" "}
        <strong className="font-semibold text-gray-900">
          {formatBRL(PAYMENT.feeAmountCents)}
        </strong>
        , paga por Pix na próxima tela. Seu número de peito é gerado assim que
        o pagamento cair.
      </p>
      <div className="mt-8">
        <InscricaoForm />
      </div>
    </div>
  );
}
