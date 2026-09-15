-- Migração: inscrição gratuita -> inscrição paga via Pix (Mercado Pago).
--
-- Rode este script UMA VEZ no SQL Editor do Supabase, no banco que já existe.
-- Para um banco novo, use supabase/schema.sql, que já vem com tudo pronto.
--
-- É seguro rodar com a tabela vazia (que é o caso hoje: todos os registros de
-- teste foram apagados). Se houver inscritos de verdade, leia o aviso no fim.

-- 1. Sequência dedicada para o número de peito ------------------------------
create sequence if not exists public.numero_peito_seq;

-- 2. Colunas novas ----------------------------------------------------------
alter table public.inscricoes
  add column if not exists public_token uuid not null default gen_random_uuid(),
  add column if not exists payment_status text not null default 'pendente',
  add column if not exists numero_peito bigint,
  add column if not exists valor_centavos integer not null default 0,
  add column if not exists mp_order_id text,
  add column if not exists mp_payment_id text,
  add column if not exists mp_qr_code text,
  add column if not exists mp_qr_code_base64 text,
  add column if not exists mp_ticket_url text,
  add column if not exists pix_expira_em timestamptz,
  add column if not exists pago_em timestamptz,
  add column if not exists email_enviado_em timestamptz;

alter table public.inscricoes
  drop constraint if exists inscricoes_payment_status_check;
alter table public.inscricoes
  add constraint inscricoes_payment_status_check
  check (payment_status in ('pendente', 'pago', 'expirado', 'falhou', 'cancelado'));

-- 3. Índices / unicidade ----------------------------------------------------
create unique index if not exists inscricoes_public_token_key
  on public.inscricoes (public_token);
create unique index if not exists inscricoes_numero_peito_key
  on public.inscricoes (numero_peito);
create unique index if not exists inscricoes_mp_order_id_key
  on public.inscricoes (mp_order_id);
create index if not exists inscricoes_mp_order_id_idx
  on public.inscricoes (mp_order_id);

-- CPF deixa de ser único em qualquer situação e passa a ser único apenas
-- entre inscrições PAGAS — assim um Pix expirado libera o CPF para nova
-- tentativa, sem nenhuma rotina de limpeza.
alter table public.inscricoes drop constraint if exists inscricoes_cpf_key;
create unique index if not exists inscricoes_cpf_pago_key
  on public.inscricoes (cpf)
  where payment_status = 'pago';

-- 4. Função de confirmação atômica e idempotente ----------------------------
create or replace function public.confirmar_pagamento(
  p_order_id text,
  p_payment_id text
)
returns table (
  inscricao_id bigint,
  peito bigint,
  nome_participante text,
  email_participante text,
  ja_estava_pago boolean
)
language plpgsql
as $$
declare
  v_row public.inscricoes;
begin
  select * into v_row
  from public.inscricoes
  where mp_order_id = p_order_id
  for update;

  if not found then
    return;
  end if;

  if v_row.payment_status = 'pago' then
    return query
      select v_row.id, v_row.numero_peito, v_row.nome, v_row.email, true;
    return;
  end if;

  update public.inscricoes
  set payment_status = 'pago',
      numero_peito = coalesce(numero_peito, nextval('public.numero_peito_seq')),
      mp_payment_id = coalesce(p_payment_id, mp_payment_id),
      pago_em = now()
  where id = v_row.id
  returning * into v_row;

  return query
    select v_row.id, v_row.numero_peito, v_row.nome, v_row.email, false;
end;
$$;

-- ---------------------------------------------------------------------------
-- ATENÇÃO, só se já existirem inscritos de verdade na tabela:
-- as linhas antigas entram como 'pendente' e sem número de peito. Para
-- considerá-las pagas (inscrições feitas quando a corrida era gratuita),
-- rode também:
--
--   update public.inscricoes
--   set payment_status = 'pago',
--       numero_peito = id,
--       pago_em = created_at
--   where numero_peito is null;
--
--   select setval('public.numero_peito_seq', (select max(numero_peito) from public.inscricoes));
--
-- Se a tabela está vazia, NÃO rode o bloco acima — a sequência já começa em 1.
-- ---------------------------------------------------------------------------
