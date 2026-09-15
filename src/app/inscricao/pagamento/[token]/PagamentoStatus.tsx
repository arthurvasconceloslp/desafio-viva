"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type StatusResposta = {
  status: "pendente" | "pago" | "expirado" | "falhou" | "cancelado";
  numero: number | null;
};

const INTERVALO_MS = 6000;

function formatarRestante(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutos = Math.floor(total / 60);
  const segundos = total % 60;
  return `${minutos}:${String(segundos).padStart(2, "0")}`;
}

export function PagamentoStatus({
  token,
  qrCode,
  expiraEm,
}: {
  token: string;
  qrCode: string;
  expiraEm: string | null;
}) {
  const router = useRouter();
  const [copiado, setCopiado] = useState(false);
  const [restante, setRestante] = useState<number | null>(null);

  // Contagem regressiva até o código Pix vencer.
  useEffect(() => {
    if (!expiraEm) return;
    const alvo = new Date(expiraEm).getTime();
    const tick = () => setRestante(alvo - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiraEm]);

  // Verificação periódica: o pagamento por Pix é assíncrono, então a página
  // pergunta ao servidor de tempos em tempos se o dinheiro já entrou.
  useEffect(() => {
    let cancelado = false;

    async function verificar() {
      try {
        const resposta = await fetch(
          `/api/inscricao/status?token=${encodeURIComponent(token)}`,
          { cache: "no-store" }
        );
        if (!resposta.ok || cancelado) return;
        const dados = (await resposta.json()) as StatusResposta;
        if (cancelado) return;

        if (dados.status === "pago") {
          router.replace(`/inscricao/confirmacao?token=${token}`);
        } else if (dados.status !== "pendente") {
          // Expirou, foi recusado ou cancelado: o próprio servidor já sabe
          // disso, então basta rerenderizar a página para mostrar o aviso.
          router.refresh();
        }
      } catch {
        // Falha de rede é transitória: tenta de novo no próximo intervalo.
      }
    }

    const id = setInterval(verificar, INTERVALO_MS);
    return () => {
      cancelado = true;
      clearInterval(id);
    };
  }, [token, router]);

  const copiar = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(qrCode);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Navegador sem permissão de área de transferência: o código continua
      // visível na tela para seleção manual.
    }
  }, [qrCode]);

  const vencido = restante !== null && restante <= 0;

  return (
    <div className="mt-6 space-y-4">
      <button
        type="button"
        onClick={copiar}
        className="w-full rounded-full bg-brand px-6 py-3 font-semibold text-white transition-colors hover:bg-brand-dark"
      >
        {copiado ? "Código copiado!" : "Copiar código Pix"}
      </button>

      <details className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-gray-700">
          Ver o código para copiar manualmente
        </summary>
        <p className="mt-2 break-all font-mono text-xs text-gray-600">
          {qrCode}
        </p>
      </details>

      <div
        className="flex items-center justify-center gap-2 text-sm text-gray-600"
        aria-live="polite"
      >
        <span
          className="h-2 w-2 animate-pulse rounded-full bg-brand"
          aria-hidden="true"
        />
        {vencido
          ? "Verificando..."
          : "Aguardando o pagamento. Esta página se atualiza sozinha."}
      </div>

      {restante !== null && !vencido && (
        <p className="text-center text-sm text-gray-500">
          O código vence em{" "}
          <strong className="font-semibold text-gray-700">
            {formatarRestante(restante)}
          </strong>
          .
        </p>
      )}
    </div>
  );
}
