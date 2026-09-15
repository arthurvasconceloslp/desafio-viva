import {
  getSupabaseAdmin,
  PAYMENT_STATUS_LABEL,
  type Inscricao,
  type PaymentStatus,
} from "@/lib/supabase-admin";
import { formatCPF } from "@/lib/cpf";
import { formatBRL } from "@/lib/config";
import { logoutAdmin, verificarPagamentosPendentes } from "../actions";

export const dynamic = "force-dynamic";

type Linha = Pick<
  Inscricao,
  | "id"
  | "nome"
  | "cpf"
  | "sexo"
  | "email"
  | "telefone"
  | "created_at"
  | "payment_status"
  | "numero_peito"
  | "valor_centavos"
>;

const STATUS_CLASSE: Record<PaymentStatus, string> = {
  pago: "bg-green-100 text-green-800",
  pendente: "bg-amber-100 text-amber-800",
  expirado: "bg-gray-100 text-gray-600",
  falhou: "bg-brand-light text-brand-dark",
  cancelado: "bg-gray-100 text-gray-600",
};

async function loadInscricoes(): Promise<{
  data: Linha[];
  error: string | null;
}> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("inscricoes")
      .select(
        "id, nome, cpf, sexo, email, telefone, created_at, payment_status, numero_peito, valor_centavos"
      )
      // Quem pagou primeiro aparece primeiro; tentativas sem pagamento vão
      // para o fim da lista, sem se misturar com os inscritos de verdade.
      .order("numero_peito", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    if (error) {
      return { data: [], error: "Não foi possível carregar as inscrições." };
    }
    return { data: (data as Linha[]) ?? [], error: null };
  } catch {
    return {
      data: [],
      error:
        "Supabase ainda não está configurado. Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.",
    };
  }
}

export default async function AdminDashboardPage() {
  const { data, error } = await loadInscricoes();

  const pagos = data.filter((row) => row.payment_status === "pago");
  const arrecadadoCentavos = pagos.reduce(
    (total, row) => total + row.valor_centavos,
    0
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inscritos</h1>
          <p className="text-gray-600">
            {pagos.length} inscrição(ões) paga(s) · {formatBRL(arrecadadoCentavos)}{" "}
            arrecadado
            {data.length > pagos.length && (
              <span className="text-gray-400">
                {" "}
                · {data.length - pagos.length} tentativa(s) sem pagamento
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <form action={verificarPagamentosPendentes}>
            <button
              type="submit"
              title="Pergunta ao Mercado Pago o que aconteceu com as inscrições ainda pendentes"
              className="rounded-full border border-brand px-5 py-2 text-sm font-semibold text-brand transition-colors hover:bg-brand-light"
            >
              Verificar pagamentos
            </button>
          </form>
          <a
            href="/api/admin/export"
            className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-dark"
          >
            Exportar CSV
          </a>
          <form action={logoutAdmin}>
            <button
              type="submit"
              className="rounded-full border border-gray-300 px-5 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
            >
              Sair
            </button>
          </form>
        </div>
      </div>

      {error && (
        <p className="mt-6 rounded-lg bg-brand-light px-4 py-3 text-sm text-brand-dark">
          {error}
        </p>
      )}

      {!error && (
        <div className="mt-6 overflow-x-auto rounded-xl border border-gray-100">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Peito</th>
                <th className="px-4 py-3">Situação</th>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">CPF</th>
                <th className="px-4 py-3">Sexo</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Telefone</th>
                <th className="px-4 py-3">Inscrito em</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 font-semibold text-brand">
                    {row.numero_peito ?? (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_CLASSE[row.payment_status]}`}
                    >
                      {PAYMENT_STATUS_LABEL[row.payment_status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">{row.nome}</td>
                  <td className="px-4 py-3">{formatCPF(row.cpf)}</td>
                  <td className="px-4 py-3 capitalize">{row.sexo}</td>
                  <td className="px-4 py-3">{row.email}</td>
                  <td className="px-4 py-3">{row.telefone}</td>
                  <td className="px-4 py-3">
                    {new Date(row.created_at).toLocaleString("pt-BR")}
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                    Nenhuma inscrição ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
