"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { SEXO_OPTIONS } from "@/lib/validation";
import { createInscricao, type InscricaoFormState } from "./actions";

const initialInscricaoState: InscricaoFormState = { errors: {}, message: null };

type FieldValues = {
  nome: string;
  cpf: string;
  dataNascimento: string;
  sexo: string;
  email: string;
  telefone: string;
};

const initialValues: FieldValues = {
  nome: "",
  cpf: "",
  dataNascimento: "",
  sexo: "",
  email: "",
  telefone: "",
};

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return <p className="mt-1 text-sm text-brand-dark">{messages[0]}</p>;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-full bg-brand px-6 py-3 font-semibold text-white transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Gerando o Pix..." : "Ir para o pagamento"}
    </button>
  );
}

export function InscricaoForm() {
  const [state, formAction] = useActionState(
    createInscricao,
    initialInscricaoState
  );
  // Campos controlados: o React 19 limpa formulários não-controlados após
  // toda submissão de Server Action, mesmo quando ela retorna um erro. Sem
  // isso o usuário perderia tudo que digitou a cada erro de validação.
  const [values, setValues] = useState<FieldValues>(initialValues);
  const formRef = useRef<HTMLFormElement>(null);

  // O reset nativo do <form> que o React 19 dispara após toda submissão de
  // Server Action mexe direto no DOM (chama form.reset()) depois que a nova
  // resposta já foi renderizada — então nem manter os campos controlados nem
  // forçar remontagem consegue "vencer" essa gravação por último. A saída é
  // reimpor os valores certos direto no DOM depois: um efeito roda depois da
  // pintura da tela, ou seja, depois desse reset nativo, e tem a palavra final.
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    for (const [name, value] of Object.entries(values)) {
      const field = form.elements.namedItem(name);
      if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) {
        field.value = value;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const handleChange = <K extends keyof FieldValues>(field: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setValues((prev) => ({ ...prev, [field]: e.target.value }));
    };

  return (
    <form ref={formRef} action={formAction} className="space-y-5" noValidate>
      {state.message && (
        <p className="rounded-lg bg-brand-light px-4 py-3 text-sm text-brand-dark">
          {state.message}
        </p>
      )}

      <div className="space-y-5">
        <div>
          <label htmlFor="nome" className="block text-sm font-medium text-gray-700">
            Nome completo
          </label>
          <input
            id="nome"
            name="nome"
            type="text"
            required
            autoComplete="name"
            value={values.nome}
            onChange={handleChange("nome")}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
          <FieldError messages={state.errors.nome} />
        </div>

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
            value={values.cpf}
            onChange={handleChange("cpf")}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
          <FieldError messages={state.errors.cpf} />
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
            value={values.dataNascimento}
            onChange={handleChange("dataNascimento")}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
          <FieldError messages={state.errors.dataNascimento} />
        </div>

        <div>
          <label htmlFor="sexo" className="block text-sm font-medium text-gray-700">
            Sexo
          </label>
          <select
            id="sexo"
            name="sexo"
            required
            defaultValue={values.sexo}
            onChange={handleChange("sexo")}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          >
            <option value="" disabled>
              Selecione
            </option>
            {SEXO_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <FieldError messages={state.errors.sexo} />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            value={values.email}
            onChange={handleChange("email")}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
          <FieldError messages={state.errors.email} />
        </div>

        <div>
          <label htmlFor="telefone" className="block text-sm font-medium text-gray-700">
            Telefone
          </label>
          <input
            id="telefone"
            name="telefone"
            type="tel"
            inputMode="numeric"
            placeholder="(00) 00000-0000"
            required
            autoComplete="tel"
            value={values.telefone}
            onChange={handleChange("telefone")}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
          <FieldError messages={state.errors.telefone} />
        </div>
      </div>

      {/* Honeypot: campo invisível para humanos, mas que bots simples costumam
          preencher. Qualquer valor aqui faz a action descartar o envio. */}
      <div aria-hidden="true" className="absolute left-[-9999px] top-auto h-0 w-0 overflow-hidden">
        <label htmlFor="empresa">Empresa</label>
        <input
          id="empresa"
          name="empresa"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <SubmitButton />
    </form>
  );
}
