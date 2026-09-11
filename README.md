# Desafio Farmácia Viva — Inscrição

Sistema de inscrição para a corrida de aniversário da Farmácia Viva. Next.js (App Router) + Supabase.

## Rodando localmente

```bash
npm install
npm run dev
```

Antes de inscrições e o painel admin funcionarem de ponta a ponta, copie `.env.example` para `.env.local` e preencha:

- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — em Project Settings > API no painel do Supabase.
- `ADMIN_PASSWORD` — a senha de acesso ao painel `/admin`.

O schema do banco está em `supabase/schema.sql` — rode esse script no SQL Editor do Supabase antes de usar.

## Estrutura

- `/` — página do evento
- `/inscricao` — formulário de inscrição
- `/inscricao/confirmacao` — mostra o número de peito gerado
- `/percurso` — informações do percurso (placeholder até serem definidas)
- `/admin` — login do painel administrativo (senha única)
- `/admin/dashboard` — lista de inscritos + exportação CSV

Configurações editáveis do evento (nome, data, local) ficam em `src/lib/config.ts`.

## Deploy

Hospedagem prevista na Vercel. Configure as mesmas variáveis de ambiente do `.env.local` nas Environment Variables do projeto na Vercel.
