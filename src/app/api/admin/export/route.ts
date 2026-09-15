import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/admin-session";
import {
  getSupabaseAdmin,
  PAYMENT_STATUS_LABEL,
  type PaymentStatus,
} from "@/lib/supabase-admin";
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
    .select(
      "nome, cpf, data_nascimento, sexo, email, telefone, created_at, payment_status, numero_peito, valor_centavos, pago_em"
    )
    .order("numero_peito", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: "Erro ao buscar inscrições." },
      { status: 500 }
    );
  }

  const header = [
    "Numero de peito",
    "Situacao do pagamento",
    "Nome",
    "CPF",
    "Data de nascimento",
    "Sexo",
    "Email",
    "Telefone",
    "Valor (R$)",
    "Inscrito em",
    "Pago em",
  ];

  const rows = (data ?? []).map((row) => [
    row.numero_peito ?? "",
    PAYMENT_STATUS_LABEL[row.payment_status as PaymentStatus] ??
      row.payment_status,
    row.nome,
    formatCPF(row.cpf),
    row.data_nascimento,
    row.sexo,
    row.email,
    row.telefone,
    // Vírgula decimal: é assim que o Excel em português lê o número.
    (row.valor_centavos / 100).toFixed(2).replace(".", ","),
    new Date(row.created_at).toLocaleString("pt-BR"),
    row.pago_em ? new Date(row.pago_em).toLocaleString("pt-BR") : "",
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
