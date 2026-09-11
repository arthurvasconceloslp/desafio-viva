-- Execute este script no SQL Editor do seu projeto Supabase.

create table if not exists public.inscricoes (
  id bigint generated always as identity primary key,
  nome text not null,
  cpf text not null unique,
  data_nascimento date not null,
  sexo text not null,
  email text not null,
  telefone text not null,
  created_at timestamptz not null default now()
);

-- RLS habilitado e sem policies: todo acesso passa exclusivamente pela
-- service role key usada no servidor (Server Actions / Route Handlers).
alter table public.inscricoes enable row level security;
