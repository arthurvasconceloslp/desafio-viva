-- Migração: corrige o `confirmar_pagamento` para não deixar uma inscrição
-- "pendente" para sempre quando o mesmo CPF gerou duas cobranças Pix
-- pendentes e as duas foram pagas.
--
-- Rode este script UMA VEZ no SQL Editor do Supabase, no banco de produção
-- que já tem a versão antiga da função (criada por 001_pagamento_pix.sql).
-- Para um banco novo, use supabase/schema.sql, que já vem com esta correção.
--
-- Contexto do bug (achado em auditoria, 15/09/2026):
-- nada impede o mesmo CPF gerar um segundo Pix enquanto o primeiro ainda
-- está pendente — só é bloqueado CPF já PAGO, na criação da inscrição
-- (`src/app/inscricao/actions.ts`). Se as duas cobranças forem pagas, a
-- confirmação da primeira funciona; a confirmação da segunda esbarra no
-- índice único parcial `inscricoes_cpf_pago_key` (o CPF já tem uma linha
-- "pago") e a função antiga deixava essa exceção subir crua: o webhook
-- respondia 500 (o Mercado Pago reenvia por 15 em 15 minutos, para sempre,
-- sem nunca resolver — reenviar não muda o fato de que o CPF já está pago em
-- outra linha) e a inscrição ficava "pendente" para sempre, com o dinheiro já
-- recebido, sem nada avisar o admin.
--
-- Esta versão envolve o UPDATE num bloco `exception when unique_violation`
-- e devolve uma nova coluna de saída (`conflito boolean`) para o chamador
-- (`src/lib/pagamento.ts`) distinguir esse caso e marcar a linha como
-- "cancelado" em vez de deixá-la "pendente" para sempre. A coluna
-- `ja_estava_pago`, já consumida pelo código, não muda de posição nem de
-- significado — só foi acrescentada uma coluna nova no fim.
--
-- Não altera nenhum dado: só substitui a definição da função. Mas precisa do
-- `drop function` antes do `create`, porque o Postgres recusa um
-- `create or replace` que mude o tipo de retorno (erro 42P13) — e esta versão
-- acrescenta a coluna de saída `conflito`. O drop e o create abaixo rodam na
-- mesma transação, então nunca existe um instante em que a função esteja
-- ausente para o código em produção.
--
-- A troca é compatível com o código ANTIGO ainda no ar: ele chama a função com
-- os mesmos argumentos e simplesmente ignora a coluna nova. Por isso rodar este
-- script ANTES do deploy é seguro — e é a ordem correta, já que o código novo
-- depende de `conflito` existir.

begin;

drop function if exists public.confirmar_pagamento(text, text);

create function public.confirmar_pagamento(
  p_order_id text,
  p_payment_id text
)
returns table (
  inscricao_id bigint,
  peito bigint,
  nome_participante text,
  email_participante text,
  ja_estava_pago boolean,
  conflito boolean
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
      select v_row.id, v_row.numero_peito, v_row.nome, v_row.email, true, false;
    return;
  end if;

  begin
    update public.inscricoes
    set payment_status = 'pago',
        numero_peito = coalesce(numero_peito, nextval('public.numero_peito_seq')),
        mp_payment_id = coalesce(p_payment_id, mp_payment_id),
        pago_em = now()
    where id = v_row.id
    returning * into v_row;
  exception
    when unique_violation then
      -- CPF já tem outra inscrição "pago" (a outra cobrança Pix do mesmo CPF
      -- foi confirmada primeiro). Esta inscrição não pode virar "pago" — quem
      -- chamou esta função decide o que fazer (hoje: marcar como "cancelado"
      -- e registrar para o admin olhar manualmente).
      return query
        select v_row.id, null::bigint, v_row.nome, v_row.email, false, true;
      return;
  end;

  return query
    select v_row.id, v_row.numero_peito, v_row.nome, v_row.email, false, false;
end;
$$;

commit;
