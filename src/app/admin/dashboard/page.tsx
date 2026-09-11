import { getSupabaseAdmin, type Inscricao } from "@/lib/supabase-admin";
import { formatCPF } from "@/lib/cpf";
import { logoutAdmin } from "../actions";

export const dynamic = "force-dynamic";

async function loadInscricoes(): Promise<{
  data: Inscricao[];
  error: string | null;
}> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("inscricoes")
      .select("id, nome, cpf, sexo, email, telefone, created_at")
      .order("id", { ascending: true });

    if (error) {
      return { data: [], error: "Não foi possível carregar as inscrições." };
    }
    return { data: (data as Inscricao[]) ?? [], error: null };
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

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inscritos</h1>
          <p className="text-gray-600">
            {data.length} inscrição(ões) confirmada(s).
          </p>
        </div>
        <div className="flex gap-3">
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
                <th className="px-4 py-3">Nº</th>
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
                  <td className="px-4 py-3 font-semibold text-brand">{row.id}</td>
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
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
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
