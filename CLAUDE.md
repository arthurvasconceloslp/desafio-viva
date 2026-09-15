# Projeto: Sistema de Inscrição — Desafío Farmácia Viva

Sistema web de inscrição para a corrida de comemoração de aniversário da farmácia do pai do usuário. Este documento resume tudo que foi decidido em conversa antes de qualquer código ser escrito, para que a próxima sessão possa continuar de onde paramos sem precisar perguntar tudo de novo.

## Status atual

Implementação completa do código: todas as páginas, formulário de inscrição com Server Action + validação (zod, incluindo checagem de dígito verificador de CPF), painel admin com login por senha única (sessão via cookie HMAC-assinado, sem guardar a senha em texto), exportação CSV, e proteção de `/admin/dashboard` via `src/proxy.ts` (convenção nova do Next.js 16, substituiu `middleware.ts`). `npm run build` e `npm run lint` passam sem erros.

**Cobrança da taxa de inscrição via Pix (Mercado Pago) implementada E testada de ponta a ponta** contra a API real, com a conta de teste do Mercado Pago e o Supabase de verdade: inscrição, geração do QR code, confirmação automática do pagamento, número de peito, email, painel admin e CSV. Dois bugs sérios foram encontrados e corrigidos nesse teste — ver "Armadilha real: os status da Orders API" e "Armadilha real: maiúsculas no `data.id` do webhook" abaixo. **Publicado na Vercel e rodando com credenciais de PRODUÇÃO do Mercado Pago** — o site cobra dinheiro de verdade.

Testado de ponta a ponta no navegador de verdade (Claude in Chrome) com Supabase propositalmente desconectado: home, formulário de inscrição (erro de validação por campo, banner geral de erro, fallback "banco não conectado"), login admin (senha errada, senha certa, dashboard, logout, proteção de rota pós-logout). Dois bugs reais de UX foram encontrados e corrigidos durante esse teste:
1. O React 19 reseta o `<form action={...}>` nativamente após toda submissão de Server Action. Como os inputs eram não-controlados, qualquer erro de validação apagava tudo que o usuário tinha digitado. Corrigido tornando os campos de `InscricaoForm` controlados (`useState` + `value`/`onChange`).
2. Mesmo controlado, o `<select>` de Sexo não se recuperava do reset nativo (bug conhecido do React com `<select>` controlado + reset de formulário) — o valor era enviado certo, mas a UI voltava a mostrar "Selecione", o que faria um reenvio seguinte falhar de verdade. Corrigido forçando a remontagem do `<select>` a cada resposta da action (chave incrementada via ajuste de estado durante o render, sem `useEffect`).

**Supabase real já configurado e testado de ponta a ponta**: o usuário criou o projeto, rodou `supabase/schema.sql` e colou as credenciais em `.env.local` (gitignored). Testado com dados reais: inscrição grava no banco, número de peito sequencial funciona, constraint de CPF único bloqueia duplicata, dashboard admin lista o inscrito real, exportação CSV traz os dados certos. Todos os registros de teste foram apagados depois e a sequência do `id` foi resetada para reiniciar em 1 (`alter table public.inscricoes alter column id restart with 1;`) — **se mais testes forem feitos depois, repetir esse reset antes do lançamento real**, senão o primeiro inscrito de verdade não pega o peito nº1.

### Bateria final pré-deploy (build de produção local, `npm run build && npm run start`)

Rodada completa de testes antes de partir para a Vercel, tudo clicando de verdade no navegador (Claude in Chrome) contra o build de produção local, não o `next dev`:
- Home, Percurso: renderização e hidratação ok (sem erros no console).
- Cabeçalhos de segurança confirmados via `curl` na build de produção (CSP sem `unsafe-eval`, como esperado).
- `/admin/dashboard` sem sessão → redireciona; `/api/admin/export` sem sessão → 401.
- Inscrição: CPF da denylist rejeitado com os campos preservados (incluindo o `<select>` de Sexo); CPF válido gera peito corretamente; CPF duplicado é bloqueado contra o banco real; honeypot descarta um envio de "bot" simulado sem gravar nada.
- Admin: senha errada rejeitada, senha certa loga, dashboard mostra o inscrito real certo, CSV exportado com os dados corretos, logout funciona.
- Todos os registros de teste foram apagados de novo e pedi ao usuário para rodar o reset de sequência (`alter table ... restart with 1`) mais uma vez.

Nenhum problema novo encontrado nessa rodada — os bugs já corrigidos anteriormente (reset de formulário do React 19, CSP quebrando hidratação) permanecem corrigidos na build de produção.

### Segurança (revisão feita com a skill security-and-hardening)

Aplicado e testado:
- **CSV/Formula Injection corrigido** em `/api/admin/export`: campos que começam com `=`, `+`, `-`, `@`, tab ou CR agora recebem um apóstrofo na frente antes de entrar no CSV, para não virar fórmula executável ao abrir no Excel/Sheets.
- **Cabeçalhos de segurança** adicionados em `next.config.ts` (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, HSTS) e `X-Powered-By` removido.
- **Vazamento de timing na senha do admin corrigido**: `checkAdminPassword` (`src/lib/admin-session.ts`) agora compara hash SHA-256 de tamanho fixo em vez das strings originais, evitando o early-return por diferença de tamanho.
- **Honeypot anti-spam** no formulário de inscrição: campo oculto (`empresa`, `aria-hidden`, fora da tela, `tabIndex={-1}`) que só um bot preencheria — se vier preenchido, a Server Action finge sucesso sem gravar nada no banco.
- `npm audit`: 0 vulnerabilidades nas dependências.
- Confirmado que não há risco de SQL injection (todo acesso ao Supabase é via client parametrizado, nunca SQL concatenado) nem XSS (React escapa toda saída, nenhum uso de `dangerouslySetInnerHTML`).
- Removido o link "Acesso administrativo" do rodapé (`src/components/SiteFooter.tsx`), a pedido do usuário. **Importante**: isso é só discrição, não é uma proteção real — `/admin` continua acessível direto pela URL, e a segurança de verdade continua sendo a senha + cookie de sessão verificado no servidor (`src/proxy.ts`), não a ausência de um link visível.

**Decidido com o usuário**: manter só a validação de dígito verificador de CPF (sem consulta paga à Receita Federal) e usar **email** (não SMS) para a notificação de confirmação — ver "Validação de CPF" e "Notificação por email" abaixo.

**Ainda em aberto**:
- Sem limite de tentativas de senha no login do admin nem limite de envios repetidos no formulário público — mitigado parcialmente pelo honeypot, mas uma defesa mais forte (rate limiting de verdade) exigiria um serviço externo com estado compartilhado (ex: Upstash Redis), que é uma nova integração e tem custo/conta a criar. Não implementado ainda; perguntar ao usuário se quer investir nisso.

### Teste com OWASP ZAP (colega do usuário) — investigação de "senha vazando"

Um colega do usuário rodou o OWASP ZAP contra o site (não confirmado se contra produção ou local) e reportou algo como "o banco está vazando senha e tal". Investiguei os três lugares mais prováveis de um vazamento real e **nenhum mostrou problema**:
1. Cookie de sessão do admin: testado `document.cookie` numa aba autenticada em produção → retorna vazio, confirmando `httpOnly` (JS não consegue ler).
2. HTTPS: `http://` redireciona para `https://` (308) — senha nunca trafega sem criptografia.
3. Bundles JS do site: baixados e vasculhados por `ADMIN_PASSWORD`, `sb_secret`, `RESEND_API_KEY`, `checkAdminPassword`, `createHmac`, `createHash`, `KNOWN_FAKE_CPFS` — nenhuma ocorrência. As Server Actions do Next.js já enviam só um ID criptografado ao cliente (ex: `$ACTION_KEY` = hash opaco), nunca o código de verdade.

Hipótese mais provável: o ZAP, atuando como proxy, está mostrando o corpo da requisição POST do login (a senha aparece em texto plano ali, como em qualquer formulário de login do mundo, protegida em trânsito pelo HTTPS) — não é a mesma coisa que um vazamento real. **Pendente**: pedi o nome exato do alerta do ZAP (ex: "Password Autocomplete", "Session Cookie without Secure Flag") pra confirmar se é falso positivo ou algo real antes de mexer em mais alguma coisa. Também alertei que rodar o ZAP (scan ativo) contra produção pode gerar inscrições de teste reais no banco (o campo Nome não filtra HTML/scripts, só CPF e email têm validação rígida) — se aparecerem registros estranhos no admin, provavelmente são disso, seguro de limpar.

### CPF: reforço além do dígito verificador

Além da checagem de dígito verificador (já existia), `src/lib/cpf.ts` agora também rejeita uma lista de CPFs **matematicamente válidos mas publicamente conhecidos como "CPF de teste"** — números que circulam em tutoriais/geradores e que pessoas mal-intencionadas digitam de propósito para passar por formulários sem usar um CPF de verdade. Descobri isso na prática: o CPF que eu vinha usando em todos os testes deste projeto (`111.444.777-35`) é exatamente um desses. A lista (`KNOWN_FAKE_CPFS`) inclui hoje `111.444.777-35`, `123.456.789-09`, `529.982.247-25` e `168.995.350-09` — é best-effort, não exaustiva, e pode ser expandida se o admin encontrar outros casos.

Validado com um teste estatístico: gerando 100.000 CPFs de 11 dígitos aleatórios, ~1% passa no dígito verificador por acaso (matemática do próprio algoritmo, não é uma falha nossa) — ou seja, **99% de qualquer tentativa de "número qualquer" é barrada**. Todos os CPFs repetidos (`000.000.000-00` ... `999.999.999-99`), tamanho errado e não-numéricos são 100% rejeitados. **Para novos testes manuais, não usar `111.444.777-35`** (agora rejeitado de propósito) — um CPF válido e não listado, gerado só para teste, é `345.761.098-39`.

### ⚠️ Armadilha real encontrada: CSP quebrou a hidratação do site inteiro

Ao adicionar os cabeçalhos de segurança (seção acima), configurei `Content-Security-Policy` com `script-src 'self'` sem `'unsafe-inline'` nem nonce. Isso bloqueou os próprios scripts inline que o Next.js injeta para hidratar a página (bootstrap de RSC, `self.__next_r`) — o site carregava visualmente mas **nenhum JavaScript rodava**: formulário sempre caía no fallback nativo do HTML (recarregava a página inteira a cada envio, apagando os campos), nada era interativo. Reproduzi tanto em `next dev` quanto em `next build && next start`. Só percebi porque o navegador mostrava "0 fiber keys" do React nos elementos e o console tinha `InvariantError: Expected a request ID... self.__next_r` (dev) / erro React #412 "Connection closed" (produção).

**Corrigido** adicionando `'unsafe-inline'` a `script-src` (a própria documentação do Next.js recomenda exatamente isso para sites sem CSP baseado em nonce — a alternativa nonce exigiria forçar toda página a renderizar dinamicamente, perdendo a otimização estática). Também adicionei `'unsafe-eval'` só em modo dev (`NODE_ENV === "development"`), porque o React usa `eval()` em dev para reconstruir stack traces — nunca em produção. Testado depois: hidratação confirmada (`__reactFiber$...` presente no DOM) tanto em dev quanto em build de produção local, formulário funcionando ponta a ponta de novo.

**Lição para o futuro**: sempre que adicionar ou editar o `Content-Security-Policy`, testar clicando de verdade no navegador depois (não só checar os headers com `curl`) — um CSP mal configurado não gera erro de build nem de lint, só quebra silenciosamente a interatividade em runtime.

### Notificação por email — implementado e testado

Usuário escolheu **email** (não SMS). Implementado com [Resend](https://resend.com) (`src/lib/email.ts`, chamado a partir de `createInscricao` em `src/app/inscricao/actions.ts`, logo após o insert no Supabase, antes do `redirect()`). Chave em `.env.local` (`RESEND_API_KEY`).

O envio é **melhor-esforço**: se o Resend falhar por qualquer motivo, o erro só é registrado com `console.error` no servidor — a inscrição já foi salva no banco e o participante é redirecionado normalmente para a confirmação. Testado ao vivo os dois caminhos: (1) email enviado com sucesso para o endereço da conta Resend, e (2) envio para um domínio de exemplo rejeitado pelo Resend (modo de teste) sem quebrar a inscrição.

**Limitação atual, importante para o lançamento**: o remetente usado é `onboarding@resend.dev`, o endereço de teste do Resend, que só entrega para o email da própria conta Resend (hoje `arthur.vasconceloslp@gmail.com` — note que é diferente do email da conta Claude usada nesta conversa). **Antes de divulgar a inscrição para o público, é preciso verificar um domínio próprio em resend.com/domains e trocar `FROM_ADDRESS` em `src/lib/email.ts`**, senão nenhum inscrito de verdade vai receber o email de confirmação.

O usuário confirmou que a farmácia **não tem domínio próprio ainda**. Verificar um domínio no Resend em si é gratuito, mas exige possuir um domínio, o que normalmente tem custo de registro (~R$40/ano em `.com.br` via registro.br, ou ~US$10-15/ano em `.com`) se comprado do zero — não decidido ainda se/quando isso será feito, não é bloqueante (o email já funciona em modo melhor-esforço). **Dica para quando for registrar**: um único domínio serve tanto para o Resend (envio de email) quanto para apontar o site na Vercel (em vez do endereço padrão `*.vercel.app`) — vale registrar um só para os dois usos, não dois separados.

**WhatsApp como alternativa foi considerado e descartado** (perguntado pelo usuário). Diferente do email, WhatsApp não depende de domínio, mas exige verificação de empresa na Meta e cobra por mensagem via API oficial (Twilio/Zenvia/Meta Cloud API) além de uma cota gratuita limitada — mais caro e mais burocrático que o email para uma corrida pequena e gratuita. Alternativas não-oficiais (automatizar um número pessoal) foram descartadas por violarem os termos do WhatsApp e arriscarem banir o número. Decisão: manter só email.

## Pagamento da taxa de inscrição via Pix (Mercado Pago) — IMPLEMENTADO

**Valor da taxa: R$ 20,00** (`PAYMENT.feeAmountCents = 2000` em `src/lib/config.ts`), definido pelo usuário.

### Por que Mercado Pago e não Stripe

A especificação anterior desta seção mandava usar **Stripe via Vercel Marketplace**. Isso foi
**descartado pelo usuário** depois de uma conversa em que ficou claro que ele não conhecia o
conceito de gateway de pagamento: ele perguntou se a conta bancária da farmácia e a conta dele
no Nubank "serviam" como conta Stripe. Depois de explicado que o gateway é uma camada separada
do banco (o banco é só onde o dinheiro cai no fim), ele escolheu **Mercado Pago** — é brasileiro,
o cadastro é mais simples (aceita CPF, não exige só CNPJ), e ele já conhece.

Consequência prática: o Mercado Pago **não está no Vercel Marketplace** (`vercel integration
discover --category payments` só retorna Stripe), então as credenciais são gerenciadas à mão em
`.env.local` e no dashboard da Vercel, sem injeção automática.

**Se um dia for necessário reconsiderar o Stripe** (ex.: Mercado Pago recusar a conta), a
especificação original está no histórico do git — foi removida daqui para não confundir quem ler
este arquivo achando que ainda é o plano.

### Como funciona (Checkout Transparente, Orders API)

Escolhido o **Checkout Transparente** em vez do checkout hospedado: o Mercado Pago devolve o QR
code e o código copia-e-cola, e o site mostra isso numa página própria
(`/inscricao/pagamento/[token]`), sem jogar o participante para fora do site.

O contrato da API foi confirmado lendo os **tipos do SDK oficial `mercadopago@3.6.1`** instalado
em `node_modules` (não de memória nem de blog): `POST /v1/orders` com
`transactions.payments[0].payment_method = { id: "pix", type: "bank_transfer" }`; o QR volta em
`transactions.payments[0].payment_method.qr_code` / `.qr_code_base64`.

Fluxo completo:
1. `/inscricao` — formulário igual ao de antes (mesmos campos, mesma validação, mesmo honeypot);
   só mudou o texto, que agora avisa o valor e que o pagamento é na tela seguinte.
2. `createInscricao` (`src/app/inscricao/actions.ts`) verifica se o CPF já tem inscrição **paga**,
   insere a linha como `payment_status = 'pendente'` e **sem** número de peito, cria a cobrança Pix
   no Mercado Pago (`src/lib/mercadopago.ts`), grava o QR code na linha e redireciona para
   `/inscricao/pagamento/<public_token>`.
3. A tela de pagamento mostra QR code, botão de copiar, contagem regressiva até o vencimento e um
   componente cliente que consulta `/api/inscricao/status` a cada 6 segundos.
4. Quando o pagamento entra, a inscrição é confirmada, o número de peito é atribuído e o email de
   confirmação é enviado — tudo por `src/lib/pagamento.ts`, que é o **único** lugar do sistema que
   faz isso. O envio do email saiu da Server Action (era lá antes), porque agora é o pagamento que
   confirma a inscrição, não o envio do formulário.
5. `/inscricao/confirmacao?token=...` busca o número **no banco** (nunca na URL) e mostra o peito.
   Se ainda não estiver pago, redireciona de volta para a tela de pagamento.

### Três caminhos de confirmação (de propósito)

O pagamento por Pix é assíncrono, então quem avisa que o dinheiro entrou **não pode ser o
navegador do participante**. Há três caminhos independentes, e todos passam pela mesma função
idempotente (`src/lib/pagamento.ts`):

1. **Consulta da tela de espera** (`/api/inscricao/status`) — enquanto o participante olha o QR
   code, a página pergunta ao Mercado Pago a cada 6 segundos. Confirma em segundos.
2. **Webhook** (`src/app/api/webhooks/mercadopago/route.ts`) — atende quem fechou a aba.
   Confirma em segundos. **Leia a seção sobre a assinatura antes de mexer aqui.**
3. **Varredura de pendentes** (`reconciliarPendentes`, em `src/lib/pagamento.ts`) — lista as
   inscrições ainda pendentes e pergunta ao Mercado Pago sobre cada uma. Não depende de webhook,
   de assinatura, nem de o Mercado Pago conseguir alcançar nosso servidor. Dois gatilhos: o cron
   da Vercel (`vercel.json`) e o botão **"Verificar pagamentos"** no painel admin.

O terceiro caminho existe porque o webhook é a única peça fora do nosso controle — e ele
realmente deu problema (ver a seção da assinatura). Com ele, mesmo que o webhook pare de
funcionar um dia, ninguém fica sem confirmação: o administrador clica no botão, ou o cron pega
no dia seguinte.

**Limitação do cron**: está agendado uma vez por dia (`0 3 * * *`) porque o **plano Hobby da
Vercel rejeita, no deploy**, qualquer expressão que rode mais de uma vez por dia — confirmado na
documentação oficial. Num plano Pro, basta trocar a expressão em `vercel.json` por algo como
`*/5 * * * *`; nada mais precisa mudar.

O webhook **nunca** confia no corpo da notificação para decidir que algo foi pago: a notificação
só diz *qual ordem mudou*; o que aconteceu vem de uma consulta à API do Mercado Pago logo depois.
Essa é a regra que sustenta a segurança do endpoint.

### Idempotência — onde ela realmente mora

A garantia de "não queimar dois números de peito para a mesma pessoa" **não está no TypeScript**, e
sim na função Postgres `confirmar_pagamento` (em `supabase/schema.sql`): ela faz
`SELECT ... FOR UPDATE` na linha e só chama `nextval('numero_peito_seq')` se a inscrição ainda não
estiver paga. Devolve `ja_estava_pago` para o chamador saber que não deve reenviar o email.

Isso é essencial porque o Mercado Pago reenvia a notificação a cada 15 minutos até receber 200, e os
dois caminhos acima podem chegar ao mesmo tempo. Fazer "consulta + update" em duas etapas no
servidor abriria uma janela de corrida.

Além disso, a criação da cobrança usa `idempotencyKey: inscricao-<id>`, então um duplo clique ou
retry da Server Action devolve a **mesma** ordem em vez de gerar uma segunda cobrança.

### ⚠️ Armadilha real: os status da Orders API não são os da API antiga

A primeira versão do `mapOrderToStatus` (`src/lib/mercadopago.ts`) tratava "pago" como
`approved` e "recusado" como `rejected` — os valores da **antiga API de pagamentos**, que é o
que aparece na maioria dos tutoriais e no conhecimento prévio do modelo. **A Orders API usa
outro conjunto**, e o erro não gerava falha de build, de lint nem de tipo: simplesmente
nenhum pagamento seria confirmado, para sempre, em silêncio. Pior ainda, o código chegava a
mapear explicitamente `processed` (que é o status de **pago**) para `pendente`.

Descoberto testando de verdade contra a API com a conta de teste. Valores confirmados na
prática e na [tabela oficial](https://www.mercadopago.com.br/developers/en/docs/checkout-api-orders/payment-management/status/order-status):

| Situação | `status` | `status_detail` |
|---|---|---|
| Pix recém-criado, esperando pagamento | `action_required` | `waiting_transfer` |
| **Pago** | `processed` | `accredited` |
| Pago com parte devolvida | `processed` | `partially_refunded` |
| Expirou sem pagar | `expired` | `expired` |
| Recusado | `failed` | (vários) |
| Cancelado | `canceled` | `canceled` (um "l" só) |

Há um teste de mesa das oito traduções possíveis descrito abaixo, em "Como testar sem dinheiro
real". **Lição**: ao integrar uma API de pagamento, nunca confiar nos nomes de status de
memória — conferir na tabela oficial E provocar o estado de verdade contra a API de teste,
porque esse tipo de erro não aparece em nenhuma verificação estática.

### Como testar sem dinheiro real

A conta configurada é um **usuário de teste** do Mercado Pago (tag `test_user`, Brasil/MLB) —
o Access Token começa com `APP_USR-`, o que parece credencial de produção mas não é; dá para
confirmar com `GET https://api.mercadopago.com/users/me`, que mostra as tags da conta.

Truque essencial: **`payer.first_name = "APRO"`** faz o Pix de teste ser aprovado
automaticamente em poucos segundos, sem precisar pagar nada. Foi assim que os status acima
foram confirmados.

### ⚠️ Armadilha real: maiúsculas no `data.id` do webhook

A documentação do Mercado Pago diz que o manifesto assinado usa o `data.id` **em minúsculas**
quando ele é alfanumérico, mas o `WebhookSignatureValidator` do SDK oficial usa o valor
exatamente como recebido — e os ids de ordem chegam em MAIÚSCULAS (`ORDTST01...`). Se as duas
pontas discordarem, **todo webhook legítimo seria rejeitado como falso** (401) e nenhum
pagamento se confirmaria por esse caminho — de novo, em silêncio.

Confirmado em teste: assinando com o id em minúsculas, a validação do SDK falhava com 401.
Como não dá para saber com certeza qual grafia o Mercado Pago usa em produção sem receber um
webhook real dele, `validarAssinatura` (no route handler) agora tenta **as duas grafias** e só
rejeita se nenhuma bater. Isso não enfraquece a proteção: as duas continuam exigindo o HMAC
correto, feito com o segredo que só o Mercado Pago conhece. A insistência só acontece quando a
falha foi de HMAC — cabeçalho ausente/malformado e timestamp fora da tolerância (replay)
continuam sendo rejeitados de primeira.

**Quando o primeiro pagamento real acontecer, conferir no log se o webhook foi aceito.** Se
aparecer `Webhook do Mercado Pago rejeitado (SignatureMismatch)`, o problema é outro e vale
investigar — mas o participante ainda assim é confirmado pela tela de espera.

### ⚠️ Armadilha real e NÃO RESOLVIDA: a assinatura do webhook nunca confere

**Sintoma**: o Mercado Pago chama nosso webhook normalmente (dá para ver nos logs da Vercel,
com `request-id` em UUID de verdade), mas a assinatura do cabeçalho `x-signature` não fecha com
nenhum segredo configurado no painel. Antes da correção, isso significava responder 401 para
toda notificação legítima — e, portanto, **nenhuma confirmação de pagamento para quem fecha a
aba antes de pagar**, silenciosamente.

**O que foi descartado**, testando offline contra assinaturas reais capturadas em produção
(mais de 2.000 combinações ao todo):
- os dois nomes possíveis do parâmetro de id na query (`data.id` e `id`) — o Mercado Pago manda
  `data.id`, presente e em MAIÚSCULAS;
- grafia do id: maiúscula, minúscula e ausente do manifesto;
- todos os subconjuntos de campos plausíveis (`id`, `request-id`, `ts`, `type`,
  `external_reference`, `application_id`), com e sem `;` final;
- o id da ordem, o id do pagamento, a referência externa e o id da aplicação como valor do `id:`;
- a chave do HMAC como texto e como os 32 bytes decodificados do hexadecimal;
- o segredo original **e** um regenerado pelo usuário no painel.

**Evidência de que o formato está certo e o problema é a chave**: duas notificações chegam com o
mesmo `ts` e `v1` diferentes, e a única coisa que varia entre elas é o `request-id` — ou seja, o
`request-id` está mesmo no manifesto, exatamente como a documentação descreve.

**Causa provável, não confirmada**: o segredo que o painel exibe não é o usado para assinar.
O usuário reportou que a URL está cadastrada nos dois modos (produtivo e teste) e que a
"assinatura secreta" mostrada é a mesma string nos dois — o que é suspeito, já que o normal
seria haver uma por modo. Se alguém retomar isso, começar por aí.

**Como ficou (decisão tomada com o usuário)**: o handler passou a **seguir mesmo sem assinatura
válida**, com uma trava. A justificativa é que a assinatura nunca foi o que impede fraude aqui:
este handler jamais acreditou no conteúdo da notificação — ela só diz QUAL ordem mudou, e o que
aconteceu vem de uma consulta nossa à API do Mercado Pago, autenticada com o nosso token. Uma
notificação forjada dizendo "a ordem X foi paga" não confirma nada, porque perguntamos ao
Mercado Pago e ele responde a verdade.

O que sobrava era risco de **abuso** (fazer o servidor gastar consultas à toa), e contra isso
entra a trava: sem assinatura válida, a ordem citada **precisa existir no nosso banco**. O id é
uma string opaca de 32 caracteres que só existe aqui e na tela de quem se inscreveu. Ordem
desconhecida é descartada sem consulta externa; ordem já paga responde sem consulta também.

A assinatura continua sendo verificada e toda falha vai para o log — a divergência não pode
virar esquecimento. **Se um dia o segredo certo aparecer, nada precisa mudar no código**: a
validação volta a passar sozinha e a trava deixa de ser exercida.

### ⚠️ Armadilha menor: o sandbox do Mercado Pago aprova quando quer

O gatilho de teste `payer.first_name = "APRO"` aprova o Pix automaticamente, mas **o tempo varia
de 6 segundos a mais de 10 minutos, e às vezes a ordem simplesmente não aprova**. Duas ordens
criadas lado a lado com o mesmo corpo aprovaram em 50s e 80s. Isso levou a duas investigações
falsas durante o desenvolvimento (suspeitei do `callback_url` e do email do pagador; um teste
A/B controlado descartou o `callback_url`).

**Lição**: ao testar contra o sandbox, nunca concluir "está quebrado" porque o pagamento não
aprovou — confirmar o estado consultando a ordem na API antes de sair caçando bug no nosso lado.

### Códigos de resposta do webhook (importam)

- **200** — o caso normal, e também para eventos que decidimos ignorar (tópico que não é de
  ordem, ordem desconhecida, ordem já paga). Se devolvêssemos erro, o Mercado Pago reenviaria
  para sempre.
- **500** — só para falha temporária que merece nova tentativa.
- **401** — hoje só quando `MP_WEBHOOK_SECRET` não está configurada. Assinatura que não confere
  não gera mais 401; ver a seção acima.

### Mudanças no banco

`supabase/schema.sql` foi reescrito, e há uma migração para o banco que já existe:
**`supabase/migrations/001_pagamento_pix.sql`** — rodar **uma vez** no SQL Editor do Supabase.

Colunas novas: `public_token` (uuid), `payment_status`, `numero_peito`, `valor_centavos`,
`mp_order_id`, `mp_payment_id`, `mp_qr_code`, `mp_qr_code_base64`, `mp_ticket_url`,
`pix_expira_em`, `pago_em`, `email_enviado_em`.

Duas decisões que valem entender:
- **`public_token` em vez do `id` nas URLs**: com `id` sequencial, trocar o número na URL mostraria
  a inscrição de outra pessoa. O token é um UUID aleatório.
- **CPF único só entre pagos**: `inscricoes_cpf_key` (unique simples) virou o índice parcial
  `inscricoes_cpf_pago_key ... where payment_status = 'pago'`. Assim um Pix expirado libera o CPF
  para nova tentativa — decisão confirmada com o usuário — sem precisar de rotina de limpeza.

O `id` da tabela **não é mais o número de peito**: ele agora tem buracos (tentativas que nunca
pagaram). O peito vem da sequência `numero_peito_seq`.

### Variáveis de ambiente novas

- `MP_ACCESS_TOKEN` — Access Token da aplicação no Mercado Pago (só servidor, nunca no cliente).
- `MP_WEBHOOK_SECRET` — "assinatura secreta" do webhook, usada para provar que a notificação veio
  mesmo do Mercado Pago.
- `SITE_URL` — opcional. Em produção a Vercel já injeta `VERCEL_PROJECT_PRODUCTION_URL`, que
  `src/lib/site-url.ts` usa como fallback. Definir só quando houver domínio próprio, ou para testar
  localmente com túnel.

### Testado de ponta a ponta (15/09/2026)

Feito com a conta de **teste** do Mercado Pago (tag `test_user`, Brasil/MLB — o Access Token
começa com `APP_USR-`, o que parece produção mas não é; dá para confirmar com
`GET https://api.mercadopago.com/users/me`) e contra o Supabase de verdade, com o servidor de
produção local (`npm run build && npm run start`), não só o `next dev`.

Truque essencial para testar: **`payer.first_name = "APRO"`** faz o Pix de teste ser aprovado
automaticamente em segundos. Como a Server Action usa o primeiro nome do participante como
`first_name`, basta se inscrever com o nome "APRO Silva" pelo formulário normal.

O que passou:
- Formulário → cobrança criada → QR code renderizado na página, com o `public_token` na URL
  (não o id sequencial), valor R$ 20,00 e contagem regressiva.
- Confirmação automática: a tela de espera detectou o pagamento sozinha e redirecionou para a
  confirmação com o **peito nº 1**. Email de confirmação realmente entregue pelo Resend
  (`email_enviado_em` preenchido no banco).
- Webhook, seis casos: assinatura falsa → 401; assinatura válida com id maiúsculo → 200;
  assinatura válida com id minúsculo → 200 (depois do endurecimento acima); replay com
  timestamp de 1 hora atrás → 401; tópico `payment` → 200 ignorado; reenvio duplicado → 200.
- **Idempotência comprovada**: após 4 entregas de webhook bem-sucedidas para a mesma ordem, o
  `numero_peito` continuou 1 e o `email_enviado_em` continuou com o mesmo horário — nenhum
  número queimado a mais, nenhum email repetido.
- Admin: `/admin/dashboard` sem sessão → 307; `/api/admin/export` sem sessão → 401; com sessão,
  painel mostra "Pago", nome, CPF e total arrecadado; CSV sai com as colunas novas
  (peito, situação, valor com vírgula decimal, pago em).
- CPF duplicado, nas três camadas: a consulta da Server Action acha a inscrição paga e bloqueia;
  o índice único parcial rejeita um segundo registro **pago** com o mesmo CPF (erro 23505, que
  vira a mensagem "Este CPF já está inscrito."); e uma nova tentativa **pendente** com o mesmo
  CPF é permitida — que é exatamente o comportamento pedido para Pix expirado.

Depois disso, o sistema foi publicado na Vercel e **testado no site em produção**, onde o
webhook foi finalmente confirmado de ponta a ponta: uma inscrição feita pelo formulário, com a
aba fechada logo em seguida, foi confirmada sozinha com o peito atribuído — só o webhook poderia
ter feito isso. O email, nesse teste, falhou pela limitação conhecida do Resend (o destinatário
era um email de teste do Mercado Pago, e o Resend em modo de teste só entrega para o email da
própria conta); a inscrição foi confirmada normalmente, como esperado do envio melhor-esforço.

Todos os registros de teste foram apagados depois; a tabela ficou vazia.

**Observação sobre o ambiente**: o navegador automatizado (Claude in Chrome) travou no meio da
sessão e parou de navegar; as verificações restantes foram feitas por HTTP direto contra as
mesmas rotas, gerando o cookie de sessão do admin pelo mesmo HMAC que o código usa. O fluxo
principal (formulário → QR → confirmação) chegou a ser conferido visualmente antes disso.

### O que ainda falta para ir ao ar (depende do usuário)

1. ~~Migração no Supabase~~, ~~credenciais~~, ~~webhook~~, ~~publicar~~ — feitos.
2. ~~Trocar para credenciais de produção~~ — feito em 15/09/2026.
3. **Resetar a sequência do peito antes de divulgar**, porque os testes consumiram números:
   `alter sequence public.numero_peito_seq restart with 1;` no SQL Editor do Supabase.
4. **Cadastrar a URL do webhook na aplicação de produção** (ver "Conta de produção" abaixo):
   `https://desafio-viva.vercel.app/api/webhooks/mercadopago`, tópico de **ordens**.
5. **Verificar um domínio no Resend** quando quiser voltar a enviar email de confirmação. Por ora
   o usuário optou por avisar manualmente, e a página `/consulta` cobre a lacuna.
6. Opcional: retomar a investigação da assinatura do webhook. Não é bloqueante.

### Conta de produção (dinheiro de verdade)

Desde 15/09/2026 o site usa o Access Token de **produção** da conta Mercado Pago de
**João Arthur Lopes Vasconcelos** (conta pessoal brasileira, id 3515760829, aplicação
`5474218114318934`). Verificado antes de publicar: a conta não tem a marca `test_user` e o Pix
está `active` nela — o que derrubou de vez o risco antigo de a categoria do negócio bloquear Pix.

**O dinheiro cai na conta pessoal do usuário, não em uma conta da farmácia.** Isso foi apontado
a ele e foi uma escolha consciente. Se um dia for preciso mudar para uma conta com CNPJ, o
momento certo é *antes* de haver inscritos pagantes — depois, os pagamentos ficam espalhados
entre duas contas.

**Pendência conhecida**: a aplicação de produção (`5474218114318934`) é diferente da usada nos
testes (`2443225058617655`), e **a configuração de webhook vive dentro da aplicação**. Enquanto a
URL não for cadastrada na aplicação nova, o Mercado Pago não notifica o site. Isso não impede
ninguém de se inscrever — a tela de espera confirma em 6 segundos, e há o botão no admin e o cron
diário —, mas quem fechar a aba só é confirmado por esses caminhos mais lentos. A `MP_WEBHOOK_SECRET`
configurada ainda é a da aplicação antiga; como a validação de assinatura já não é bloqueante
(ver a seção da assinatura), isso não quebra nada, mas vale atualizar quando a nova for criada.

### Página "Meu número" (`/consulta`)

Criada porque o usuário decidiu **deixar o email (Resend) para depois**. Sem email, quem pagasse e
fechasse a aba não teria como descobrir o próprio número de peito: a tela de confirmação só abre
com o link que estava na aba fechada.

A consulta pede **CPF e data de nascimento**, não só CPF. Com só o CPF, qualquer pessoa poderia
descobrir quem está inscrito testando números — e CPF é um dado que circula. A resposta é
deliberadamente magra (primeiro nome, número de peito e situação), sem email, telefone ou CPF
completo, para que a página não vire uma forma de extrair dados pessoais. Quando os dados não
batem, a mensagem é a mesma para "não existe" e "data não confere", para não entregar que aquele
CPF está inscrito.

Quando a inscrição está pendente, a página devolve o link da tela de pagamento — o que também
resolve o caso de alguém ter perdido o QR code.

### ⚠️ Armadilha: `"use server"` só exporta funções async

A primeira versão de `src/app/consulta/actions.ts` exportava uma constante
(`export const consultaInicial`) junto com a Server Action. **O build passou sem reclamar**, mas
em tempo de execução a página quebrava com "A server error occurred" ao submeter o formulário.
Um arquivo com `"use server"` só pode exportar funções async. A constante foi movida para o
componente cliente. Vale lembrar disso: o erro não aparece em `npm run build` nem no lint.

### Detalhe para avisar o usuário

O Mercado Pago cobra uma **taxa por transação** sobre cada Pix recebido, e o repasse para a conta
bancária tem prazo (configurável no painel: liberação imediata com taxa maior, ou prazos maiores
com taxa menor). Conferir a tabela vigente no painel antes de fixar o valor final — com R$ 20,00 a
taxa é de poucos centavos, mas o usuário deve saber que ela existe.

## Nome do evento

**Desafío Farmácia Viva** (confirmar com o usuário se é "Desafío" com acento espanhol de propósito ou "Desafio" em português — foi escrito com acento na conversa, mas pode ter sido erro de digitação). Por padrão o sistema usa "Desafio Farmácia Viva" (grafia em português), configurável em um único lugar (`src/lib/config.ts`).

## Decisões de produto

- ~~**Inscrição gratuita**~~. **Superado e implementado**: a inscrição custa **R$ 20,00**, pagos via Pix pelo Mercado Pago — ver a seção "Pagamento da taxa de inscrição via Pix (Mercado Pago)" logo abaixo.
- **Sem limite de vagas** — inscrições sempre abertas, sem bloqueio automático por quantidade.
- **Corrida única, sem categorias** — é um "mistão" (todos correm juntos), um único percurso, sem separação por distância/sexo/idade. Por isso a numeração de peito pode ser simplesmente sequencial.
- **Sem camiseta** — não há brinde de camiseta, então não perguntar tamanho no formulário.
- **Premiação apenas para os 3 primeiros colocados** — isso é só informativo na página do evento, não impacta o sistema de inscrição.
- **Percurso/rota ainda não definido** — o usuário não tem GPX nem link do Strava/Google Maps ainda. Deixar uma aba/seção "Percurso" na página com aviso de "em breve" / "informações do percurso serão divulgadas em breve". Implementar a exibição real do mapa depois, quando o usuário fornecer um link (Strava/Google Maps) ou arquivo GPX.
- **Data e local do evento**: definidos. Data: **18 de outubro de 2026**. Local de concentração: **Farmácia Viva, em frente à Praça da Bela Vista**. Editável em `src/lib/config.ts` (`EVENT.dateLabel` / `EVENT.locationLabel`).
- **Logo e cores**: arquivo `LOGO.png` já está na pasta do projeto (copiado para `public/logo.png`, usado no header/home, e também como favicon via `src/app/icon.png` — convenção de ícone do Next.js App Router, substituiu o `favicon.ico` padrão do scaffold). Cores de identidade visual extraídas da logo e configuradas no tema Tailwind (vermelho ~#DC3545 como cor primária).

## Campos do formulário de inscrição

Apenas dados básicos, sem camiseta:
- Nome
- CPF
- Data de nascimento
- Sexo
- Email
- Telefone

## Numeração do peito

Sequencial, gerado automaticamente na confirmação da inscrição (1, 2, 3, ...). O participante deve conseguir ver seu número de peito logo após se inscrever (ex: tela de confirmação).

## Painel administrativo (para o pai do usuário)

- Precisa existir, protegido por login.
- **Autenticação escolhida: senha única simples** (não é login com email/senha via Supabase Auth) — mais rápido de implementar, suficiente para um único administrador por enquanto. A senha é definida pela variável de ambiente `ADMIN_PASSWORD` (nunca hardcoded no código) — o usuário escolhe e configura essa senha localmente (`.env.local`) e depois na Vercel.
- Deve permitir ver a lista de inscritos (com número de peito) e **exportar em CSV/Excel**.

## Stack técnica escolhida

- **Frontend/backend**: Next.js (App Router, TypeScript, Tailwind CSS)
- **Banco de dados**: Supabase (plano gratuito)
- **Hospedagem**: Vercel (plano gratuito)

**Deploy feito e site no ar.** Código no GitHub em `https://github.com/arthurvasconceloslp/desafio-viva` (repositório privado, branch `main`), conectado à Vercel via login com GitHub. Variáveis de ambiente (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`, `RESEND_API_KEY`) configuradas no dashboard da Vercel, copiadas de `.env.local`. Todo `git push` para `main` dispara redeploy automático na Vercel.

## Estrutura de dados (Supabase)

Tabela `inscricoes` — definição completa e comentada em `supabase/schema.sql`. Resumo:

- `id` (bigint identity) — chave interna. **Não é mais o número de peito.**
- `public_token` (uuid) — identificador público usado nas URLs de pagamento/confirmação.
- `nome`, `cpf`, `data_nascimento`, `sexo`, `email`, `telefone` — dados do participante.
- `payment_status` — `pendente` | `pago` | `expirado` | `falhou` | `cancelado`.
- `numero_peito` (bigint, único, nulo até pagar) — vem da sequência `numero_peito_seq`.
- `valor_centavos` — quanto foi cobrado.
- `mp_order_id`, `mp_payment_id`, `mp_qr_code`, `mp_qr_code_base64`, `mp_ticket_url`,
  `pix_expira_em` — dados da cobrança no Mercado Pago.
- `pago_em`, `email_enviado_em`, `created_at` — marcos de tempo.

A unicidade de CPF é um **índice parcial** (`inscricoes_cpf_pago_key`), válido só para
`payment_status = 'pago'`. A função `confirmar_pagamento` faz a confirmação de forma atômica.

## Páginas/telas

1. **Home / página do evento** (`/`) — nome do evento, data/local, informações gerais, premiação,
   valor da inscrição, botão de inscrição.
2. **Formulário de inscrição** (`/inscricao`) — os campos listados acima.
3. **Pagamento** (`/inscricao/pagamento/[token]`) — QR code do Pix, código copia-e-cola, contagem
   regressiva e verificação automática do pagamento.
4. **Confirmação de inscrição** (`/inscricao/confirmacao?token=...`) — mostra o número de peito,
   buscado no banco depois do pagamento confirmado.
5. **Consultar inscrição** (`/consulta`) — o participante informa CPF e data de nascimento e vê
   seu número de peito, ou o link para retomar um pagamento pendente.
6. **Percurso** (`/percurso`) — aba com aviso "em breve", a ser substituída futuramente por mapa
   real (Strava/Google Maps embed ou GPX renderizado).
7. **Painel admin** (`/admin`) — login por senha única, lista de inscritos com situação de
   pagamento e número de peito, botão "Verificar pagamentos" e exportação CSV.

Rotas de API: `/api/inscricao/status` (consulta de status pela tela de espera),
`/api/webhooks/mercadopago` (notificação de pagamento), `/api/admin/export` (CSV).

## Agentes especializados (Claude Code)

O projeto tem seis subagentes definidos em `.claude/agents/` (escopo de projeto — o Claude Code carrega esses arquivos automaticamente por estarem nessa pasta, não precisa instalar nada). Cada um tem uma função fixa e só o `tech-lead` pode invocar os outros cinco:

- **tech-lead** — orquestrador, não escreve código. Lê o CLAUDE.md, classifica a tarefa (trivial / pequena / média / grande) e delega na ordem certa — ex.: `developer → qa` para algo pequeno, `developer → qa → auditor` para médio (acrescentando `security` quando há dados/autenticação/API), ou um fluxo completo `análise → security → developer → qa → performance → auditor` para mudanças grandes.
- **developer** — implementação. É o único com permissão de escrita (`Edit`/`Write`); implementa a funcionalidade, corrige bugs, escreve testes seguindo os padrões já existentes, nunca reescreve nem remove código sem necessidade.
- **qa** — teste e busca de bugs. Só leitura; tenta quebrar o que o developer fez (edge cases, regressão, validação, erros de API) e reporta PASS/FAIL/BLOCKED com bugs classificados por severidade — não corrige nada, só encontra e documenta.
- **security** — segurança. Só leitura; revisa autenticação, autorização, secrets, injection (SQL/XSS/command), exposição de dados e dependências. Para uma auditoria completa pode escalar para o plugin `claude-security` (scan multi-agente), mas só com confirmação prévia do usuário, por ser caro em tokens.
- **performance** — performance e escalabilidade. Só leitura; procura gargalos reais (não hipotéticos) em frontend, banco, cache, APIs externas, classificando por ATUAL / PROVÁVEL / HIPOTÉTICO.
- **auditor** — auditoria técnica independente do que o developer fez. Só leitura; avalia arquitetura, dívida técnica e manutenibilidade, e dá um veredito final: APPROVED / APPROVED WITH WARNINGS / REQUIRES CHANGES / REJECTED.

**Corrigido**: os seis arquivos vieram originalmente copiados de outro projeto (um app de rotas com mapas/GPS/"inversor", citado como "ROTAS PWC" em `qa.md`), com seções e comandos de teste (`cd app && node --test`, `npm run test:e2e` em `app/app.js`) que não existem aqui. Removidas as seções de mapas/geolocalização/inversor/KMZ de `developer.md`, `qa.md`, `security.md`, `performance.md` e `auditor.md`, e os comandos de teste do `qa.md` foram trocados pelos reais deste projeto (`npm run build`, `npm run lint` — não há suíte automatizada de unit/E2E aqui).

## Pendências / perguntas em aberto para quando o usuário retomar

- Confirmar grafia final do nome do evento ("Desafío" vs "Desafio") — hoje está como "Desafio Farmácia Viva" em `src/lib/config.ts`.
- ~~Definir data e local do evento~~ — feito: 18/10/2026, concentração na Farmácia Viva em frente à Praça da Bela Vista.
- ~~Definir a senha do painel admin~~ — feito, está em `.env.local` (`ADMIN_PASSWORD`).
- ~~Criar conta no Supabase e configurar `.env.local`~~ — feito. Variáveis reais: `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` (chave secreta `sb_secret_...`, não a `sb_publishable_...`) — não usamos Supabase Auth nem anon key, tudo passa pela service role no servidor.
- ~~Criar conta na Vercel e fazer o deploy~~ — feito, site no ar (ver "Stack técnica escolhida" acima para a URL do repositório).
- ~~Trocar o favicon pela logo~~ — feito via `src/app/icon.png`.
- Decidir sobre rate limiting real (login admin + spam de inscrição) — ver seção Segurança acima.
- ~~Implementar pagamento da taxa de inscrição via Pix~~ — **código feito** (Mercado Pago). Falta o que só o usuário pode fazer: rodar a migração no Supabase, criar a aplicação no painel do Mercado Pago, cadastrar a chave Pix, configurar o webhook e então testar de ponta a ponta. Lista detalhada na seção do pagamento, em "O que ainda falta para ir ao ar".
- **Verificar um domínio no Resend antes de divulgar a inscrição para o público** (ver seção "Notificação por email" acima) — sem isso, só o email da conta Resend recebe as confirmações.
- Se houver mais testes manuais de inscrição depois deste ponto, rodar de novo `alter sequence public.numero_peito_seq restart with 1;` antes do lançamento real (a numeração do peito saiu do `id` da tabela e passou a ter sequência própria).
