import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/admin-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { formatCPF } from "@/lib/cpf";

// Neutraliza CSV/Formula Injection: um campo começando com =, +, -, @ (ou tab/CR)
// é interpretado como fórmula por Excel/Sheets ao abrir o arquivo exportado.
// Prefixar com apóstrofo faz o programa tratá-lo como texto literal.
function csvEscape(value: unknown): string {
  let str = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[;"\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (!verifyAdminSessionToken(token)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch {
    return NextResponse.json(
      { error: "Supabase não configurado." },
      { status: 500 }
    );
  }

  const { data, error } = await supabase
    .from("inscricoes")
    .select("id, nome, cpf, data_nascimento, sexo, email, telefone, created_at")
    .order("id", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: "Erro ao buscar inscrições." },
      { status: 500 }
    );
  }

  const header = [
    "Numero",
    "Nome",
    "CPF",
    "Data de nascimento",
    "Sexo",
    "Email",
    "Telefone",
    "Inscrito em",
  ];

  const rows = (data ?? []).map((row) => [
    row.id,
    row.nome,
    formatCPF(row.cpf),
    row.data_nascimento,
    row.sexo,
    row.email,
    row.telefone,
    new Date(row.created_at).toLocaleString("pt-BR"),
  ]);

  const csv = [header, ...rows]
    .map((line) => line.map(csvEscape).join(";"))
    .join("\r\n");

  const bom = "﻿";

  return new NextResponse(bom + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="inscricoes.csv"',
    },
  });
}
