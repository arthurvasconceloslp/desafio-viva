# Desafio Farmácia Viva — Inscrição

Sistema de inscrição para a corrida de aniversário da Farmácia Viva. Next.js (App Router) +
Supabase + Mercado Pago (Pix).

## Rodando localmente

```bash
npm install
npm run dev
```

Preencha `.env.local` (esse arquivo é ignorado pelo git — **nunca** coloque chaves reais em
arquivo versionado):

- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — em Project Settings > API no painel do Supabase.
- `ADMIN_PASSWORD` — a senha de acesso ao painel `/admin`.
- `RESEND_API_KEY` — envio do email de confirmação.
- `MP_ACCESS_TOKEN` — Access Token da aplicação no
  [painel do Mercado Pago](https://www.mercadopago.com.br/developers/panel/app). Comece pelo de
  teste.
- `MP_WEBHOOK_SECRET` — a "assinatura secreta" do webhook, na mesma tela.
- `SITE_URL` — opcional; em produção a Vercel injeta o endereço sozinha.

O schema do banco está em `supabase/schema.sql`. Para um banco que já existe, rode
`supabase/migrations/001_pagamento_pix.sql` no SQL Editor do Supabase.

## Testando o pagamento localmente

O Mercado Pago não consegue chamar `localhost`, então o webhook não chega durante o
desenvolvimento. Há duas saídas:

1. **Sem configurar nada** — a tela de espera (`/inscricao/pagamento/[token]`) consulta o Mercado
   Pago a cada 6 segundos por conta própria, então o pagamento é confirmado do mesmo jeito
   enquanto a página estiver aberta.
2. **Com túnel** — exponha a porta 3000 (ngrok, Cloudflare Tunnel), defina `SITE_URL` com o
   endereço público e cadastre `<SITE_URL>/api/webhooks/mercadopago` no painel do Mercado Pago.
   Só assim dá para testar o caminho de quem fecha a aba.

## Estrutura

- `/` — página do evento
- `/inscricao` — formulário de inscrição
- `/inscricao/pagamento/[token]` — QR code do Pix e espera da confirmação
- `/inscricao/confirmacao?token=...` — mostra o número de peito, depois do pagamento confirmado
- `/percurso` — informações do percurso (placeholder até serem definidas)
- `/admin` — login do painel administrativo (senha única)
- `/admin/dashboard` — lista de inscritos + exportação CSV

Rotas de API: `/api/inscricao/status`, `/api/webhooks/mercadopago`, `/api/admin/export`.

Configurações editáveis do evento (nome, data, local, valor da inscrição) ficam em
`src/lib/config.ts`.

## Deploy

Hospedagem na Vercel. Configure as mesmas variáveis de ambiente do `.env.local` nas Environment
Variables do projeto, e aponte o webhook do Mercado Pago para
`https://<seu-dominio>/api/webhooks/mercadopago`.
