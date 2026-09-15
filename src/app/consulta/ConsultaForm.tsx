"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { PAYMENT_STATUS_LABEL } from "@/lib/supabase-admin";
import { consultarInscricao, type ConsultaState } from "./actions";

// Definido aqui, e não no módulo da action: um arquivo com "use server" só
// pode exportar funções async, e exportar uma constante dali quebra em tempo
// de execução sem falhar no build.
const consultaInicial: ConsultaState = { erro: null, resultado: null };

function BotaoConsultar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-full bg-brand px-6 py-3 font-semibold text-white transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Consultando..." : "Consultar"}
    </button>
  );
}

function Resultado({ resultado }: { resultado: NonNullable<ConsultaState["resultado"]> }) {
  if (resultado.status === "pago" && resultado.numero !== null) {
    return (
      <div className="mt-8 rounded-2xl border border-brand-light bg-brand-light/50 p-8 text-center">
        <p className="text-sm text-gray-600">
          {resultado.primeiroNome}, seu número de peito é
        </p>
        <p className="mt-2 text-6xl font-extrabold text-brand">
          {resultado.numero}
        </p>
        <p className="mt-4 text-sm text-gray-600">Inscrição confirmada.</p>
      </div>
    );
  }

  if (resultado.status === "pendente") {
    return (
      <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
        <p className="font-semibold text-amber-900">Pagamento ainda não confirmado</p>
        <p className="mt-2 text-sm text-amber-800">
          {resultado.primeiroNome}, sua inscrição está reservada, mas o Pix
          ainda não foi pago. O número de peito é gerado quando o pagamento cair.
        </p>
        {resultado.linkPagamento && (
          <Link
            href={resultado.linkPagamento}
            className="mt-4 inline-block rounded-full bg-brand px-6 py-2.5 font-semibold text-white transition-colors hover:bg-brand-dark"
          >
            Voltar para o pagamento
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="mt-8 rounded-2xl border border-gray-200 bg-gray-50 p-6 text-center">
      <p className="font-semibold text-gray-800">
        {PAYMENT_STATUS_LABEL[resultado.status]}
      </p>
      <p className="mt-2 text-sm text-gray-600">
        {resultado.primeiroNome}, esta inscrição não foi concluída e nada foi
        cobrado. Você pode se inscrever novamente com o mesmo CPF.
      </p>
      <Link
        href="/inscricao"
        className="mt-4 inline-block rounded-full bg-brand px-6 py-2.5 font-semibold text-white transition-colors hover:bg-brand-dark"
      >
        Fazer a inscrição
      </Link>
    </div>
  );
}

export function ConsultaForm() {
  const [state, formAction] = useActionState(
    consultarInscricao,
    consultaInicial
  );
  // Mesmo motivo do formulário de inscrição: o React 19 limpa o formulário
  // depois de toda submissão de Server Action, então os campos precisam ser
  // reimpostos no DOM depois da resposta (ver comentário em InscricaoForm).
  const [valores, setValores] = useState({ cpf: "", dataNascimento: "" });
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    for (const [nome, valor] of Object.entries(valores)) {
      const campo = form.elements.namedItem(nome);
      if (campo instanceof HTMLInputElement) campo.value = valor;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <>
      <form ref={formRef} action={formAction} className="space-y-5" noValidate>
        {state.erro && (
          <p className="rounded-lg bg-brand-light px-4 py-3 text-sm text-brand-dark">
            {state.erro}
          </p>
        )}

        <div>
          <label htmlFor="cpf" className="block text-sm font-medium text-gray-700">
            CPF
          </label>
          <input
            id="cpf"
            name="cpf"
            type="text"
            inputMode="numeric"
            placeholder="000.000.000-00"
            required
            value={valores.cpf}
            onChange={(e) =>
              setValores((v) => ({ ...v, cpf: e.target.value }))
            }
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>

        <div>
          <label
            htmlFor="dataNascimento"
            className="block text-sm font-medium text-gray-700"
          >
            Data de nascimento
          </label>
          <input
            id="dataNascimento"
            name="dataNascimento"
            type="date"
            required
            value={valores.dataNascimento}
            onChange={(e) =>
              setValores((v) => ({ ...v, dataNascimento: e.target.value }))
            }
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>

        <BotaoConsultar />
      </form>

      {state.resultado && <Resultado resultado={state.resultado} />}
    </>
  );
}
