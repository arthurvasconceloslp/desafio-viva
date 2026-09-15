-- Execute este script no SQL Editor do seu projeto Supabase.
-- Para um banco que JÁ existe (criado antes do pagamento via Pix), rode
-- supabase/migrations/001_pagamento_pix.sql em vez deste arquivo.

-- Número de peito tem sequência própria: o `id` da tabela passa a ter
-- "buracos" (tentativas de pagamento que expiraram e nunca viraram inscrição),
-- então ele não serve mais como número de peito.
create sequence if not exists public.numero_peito_seq;

create table if not exists public.inscricoes (
  id bigint generated always as identity primary key,
  -- Identificador público e não sequencial, usado nas URLs de pagamento e
  -- confirmação. Evita que alguém troque o número na URL e veja a inscrição
  -- de outra pessoa, o que aconteceria com o `id` sequencial.
  public_token uuid not null unique default gen_random_uuid(),

  nome text not null,
  cpf text not null,
  data_nascimento date not null,
  sexo text not null,
  email text not null,
  telefone text not null,

  payment_status text not null default 'pendente'
    check (payment_status in ('pendente', 'pago', 'expirado', 'falhou', 'cancelado')),
  numero_peito bigint unique,
  valor_centavos integer not null default 0,

  mp_order_id text unique,
  mp_payment_id text,
  mp_qr_code text,
  mp_qr_code_base64 text,
  mp_ticket_url text,
  pix_expira_em timestamptz,

  pago_em timestamptz,
  email_enviado_em timestamptz,
  created_at timestamptz not null default now()
);

-- CPF só é bloqueado entre inscrições JÁ PAGAS. Quem gerou um Pix e não pagou
-- (expirou ou desistiu) pode tentar de novo com o mesmo CPF, sem precisar de
-- nenhuma rotina de limpeza.
create unique index if not exists inscricoes_cpf_pago_key
  on public.inscricoes (cpf)
  where payment_status = 'pago';

create index if not exists inscricoes_mp_order_id_idx on public.inscricoes (mp_order_id);

-- RLS habilitado e sem policies: todo acesso passa exclusivamente pela
-- service role key usada no servidor (Server Actions / Route Handlers).
alter table public.inscricoes enable row level security;

-- Confirma o pagamento de forma atômica e idempotente.
--
-- O webhook do Mercado Pago pode chegar mais de uma vez para o mesmo
-- pagamento (é reenviado a cada 15 min até receber 200, e eventos duplicados
-- são normais). Fazer "consulta + update" em duas etapas no servidor abriria
-- uma janela de corrida que poderia queimar dois números de peito para a
-- mesma pessoa. Aqui o SELECT ... FOR UPDATE trava a linha até o fim da
-- transação, e `ja_estava_pago` avisa o chamador para não reenviar o email.
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

  -- Pedido desconhecido (ex.: notificação de outra aplicação): nada a fazer.
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
