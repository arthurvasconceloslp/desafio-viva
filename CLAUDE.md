# Projeto: Sistema de Inscrição — Desafío Farmácia Viva

Sistema web de inscrição para a corrida de comemoração de aniversário da farmácia do pai do usuário. Este documento resume tudo que foi decidido em conversa antes de qualquer código ser escrito, para que a próxima sessão possa continuar de onde paramos sem precisar perguntar tudo de novo.

## Status atual

**O site está no ar, cobrando R$ 20,00 de verdade**, em `https://desafio-viva.vercel.app`, com
credenciais de **produção** do Mercado Pago. Banco vazio, sem registros de teste. `npm run build`
e `npm run lint` passam sem erros.

O que existe: as 7 páginas listadas em "Páginas/telas", formulário com Server Action + validação
(zod, com dígito verificador de CPF e denylist de CPFs de teste), cobrança Pix pelo Mercado Pago
com três caminhos independentes de confirmação, página de consulta por CPF, painel admin com
login por senha única (cookie HMAC-assinado, sem guardar a senha em texto), exportação CSV, e
proteção de `/admin/dashboard` via `src/proxy.ts` (convenção nova do Next.js 16, que substituiu
`middleware.ts`).

**Antes de divulgar para o público, faltam dois passos que só o usuário pode dar** — ver
"O que ainda falta para ir ao ar".

### Histórico de bugs reais encontrados (todos já corrigidos)

Cada um destes só apareceu testando de verdade; nenhum era pego por build, lint ou tipos. Estão
detalhados nas seções marcadas com ⚠️ ao longo deste documento.

1. **CSP quebrou a hidratação do site inteiro** — nada de JavaScript rodava, silenciosamente.
2. **React 19 reseta o formulário depois de toda Server Action** — erros de validação apagavam
   tudo que o usuário tinha digitado.
3. **Status errados da Orders API** — "pago" é `processed`/`accredited`, não `approved`; nenhum
   pagamento seria confirmado, jamais.
4. **Assinatura do webhook nunca conferia** — era divergência de ambiente (segredo de produção
   contra notificações de teste), não de formato.
5. **`"use server"` só exporta funções async** — exportar uma constante quebrava a página em
   runtime sem falhar no build.

### Como o formulário sobrevive ao reset do React 19

Vale registrar porque é contraintuitivo e mexer nisso sem saber quebra o formulário: o React 19
chama `form.reset()` nativamente **depois** de toda submissão de Server Action, inclusive quando
ela devolve erro de validação. Manter os campos controlados não basta, porque esse reset escreve
no DOM por último.

A solução em `InscricaoForm.tsx` (e repetida em `ConsultaForm.tsx`) é um `useEffect` que roda
depois da pintura — ou seja, depois do reset nativo — e reimpõe os valores guardados em estado
diretamente nos elementos do DOM. É o único ponto do fluxo que tem a palavra final.

### Bateria de testes já executada

Histórico das rodadas de teste, todas contra o banco Supabase de verdade e, nas mais recentes,
contra o build de produção (`npm run build && npm run start`) ou contra o site publicado:

- **Antes do pagamento existir**: home, percurso, validação por campo, banner de erro, fallback
  de "banco não conectado", login admin (senha errada/certa), dashboard, logout e proteção de
  rota pós-logout. Cabeçalhos de segurança conferidos com `curl`.
- **Com o Mercado Pago em modo de teste**: formulário → QR code → confirmação automática →
  peito nº 1 → email entregue; seis casos de webhook; idempotência comprovada (4 entregas do
  mesmo evento, peito e email inalterados); admin e CSV; CPF duplicado nas três camadas.
- **Em produção**: inscrição pelo formulário com a aba fechada logo depois, confirmada sozinha
  pelo webhook, com assinatura válida; página `/consulta` nos casos "encontrado" e
  "dados não conferem".

Detalhes de cada rodada estão em "Testado de ponta a ponta", dentro da seção de pagamento.

### Segurança (revisão feita com a skill security-and-hardening)

Aplicado e testado:
- **CSV/Formula Injection corrigido** em `/api/admin/export`: campos que começam com `=`, `+`, `-`, `@`, tab ou CR agora recebem um apóstrofo na frente antes de entrar no CSV, para não virar fórmula executável ao abrir no Excel/Sheets.
- **Cabeçalhos de segurança** adicionados em `next.config.ts` (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, HSTS) e `X-Powered-By` removido.
- **Vazamento de timing na senha do admin corrigido**: `checkAdminPassword` (`src/lib/admin-session.ts`) agora compara hash SHA-256 de tamanho fixo em vez das strings originais, evitando o early-return por diferença de tamanho.
- **Honeypot anti-spam** no formulário de inscrição: campo oculto (`empresa`, `aria-hidden`, fora da tela, `tabIndex={-1}`) que só um bot preencheria — se vier preenchido, a Server Action finge sucesso sem gravar nada no banco.
- `npm audit`: 0 vulnerabilidades nas dependências.
- Confirmado que não há risco de SQL injection (todo acesso ao Supabase é via client parametrizado, nunca SQL concatenado) nem XSS (React escapa toda saída, nenhum uso de `dangerouslySetInnerHTML`).
- Removido o link "Acesso administrativo" do rodapé (`src/components/SiteFooter.tsx`), a pedido do usuário. **Importante**: isso é só discrição, não é uma proteção real — `/admin` continua acessível direto pela URL, e a segurança de verdade continua sendo a senha + cookie de sessão verificado no servidor (`src/proxy.ts`), não a ausência de um link visível.

**Decidido com o usuário**: manter só a validação de dígito verificador de CPF (sem consulta paga à Receita Federal) e usar **email** (não SMS) para a notificação de confirmação — ver "CPF: reforço além do dígito verificador" e "Notificação por email" abaixo.

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

Usuário escolheu **email** (não SMS). Implementado com [Resend](https://resend.com) em
`src/lib/email.ts`.

**Onde o envio acontece mudou com o pagamento.** Antes era disparado de `createInscricao`, logo
após gravar a inscrição. Hoje é disparado de `confirmarPagamento`, em `src/lib/pagamento.ts`,
quando o pagamento é confirmado — porque é aí que a inscrição de fato existe e o número de peito
é atribuído. Chave em `.env.local` (`RESEND_API_KEY`).

O envio é **melhor-esforço**: se o Resend falhar, o erro só é registrado com `console.error` no
servidor e a inscrição continua confirmada. A coluna `email_enviado_em` só é preenchida quando o
envio dá certo, o que também serve para não reenviar em caso de webhook duplicado.

**Estado atual: o email está desligado na prática.** O usuário decidiu deixar o Resend para
depois e avisar os inscritos manualmente. Como o remetente ainda é o endereço de teste do Resend,
toda tentativa de envio para um participante real falha com
`You can only send testing emails to your own email address` (confirmado nos logs de produção) —
a inscrição é confirmada normalmente, mas ninguém recebe email. **A página `/consulta` foi criada
justamente para cobrir essa lacuna.**

**Limitação atual, importante para o lançamento**: o remetente usado é `onboarding@resend.dev`, o endereço de teste do Resend, que só entrega para o email da própria conta Resend (hoje `arthur.vasconceloslp@gmail.com` — note que é diferente do email da conta Claude usada nesta conversa). **Antes de divulgar a inscrição para o público, é preciso verificar um domínio próprio em resend.com/domains e trocar `FROM_ADDRESS` em `src/lib/email.ts`**, senão nenhum inscrito de verdade vai receber o email de confirmação.

O usuário confirmou que a farmácia **não tem domínio próprio ainda**. Verificar um domínio no Resend em si é gratuito, mas exige possuir um domínio, o que normalmente tem custo de registro (~R$40/ano em `.com.br` via registro.br, ou ~US$10-15/ano em `.com`) se comprado do zero — não decidido ainda se/quando isso será feito, não é bloqueante (o email já funciona em modo melhor-esforço). **Dica para quando for registrar**: um único domínio serve tanto para o Resend (envio de email) quanto para apontar o site na Vercel (em vez do endereço padrão `*.vercel.app`) — vale registrar um só para os dois usos, não dois separados.

**WhatsApp como alternativa foi considerado e descartado** (perguntado pelo usuário). Diferente do email, WhatsApp não depende de domínio, mas exige verificação de empresa na Meta e cobra por mensagem via API oficial (Twilio/Zenvia/Meta Cloud API) além de uma cota gratuita limitada — mais caro e mais burocrático que o email para uma corrida pequena. Alternativas não-oficiais (automatizar um número pessoal) foram descartadas por violarem os termos do WhatsApp e arriscarem banir o número. Decisão: manter só email.

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

### Tolerância a variações do `data.id` (defensiva, não foi a causa de nada)

A documentação do Mercado Pago diz que o manifesto assinado usa o `data.id` **em minúsculas**
quando ele é alfanumérico, enquanto o `WebhookSignatureValidator` do SDK oficial usa o valor
exatamente como recebido — e os ids de ordem chegam em MAIÚSCULAS. Isso parecia explicar as
rejeições, e `validarAssinatura` passou a testar várias grafias do id (como veio, em minúsculas,
e o manifesto sem o trecho `id:`, além de aceitar tanto `data.id` quanto `id` na query).

**Essa hipótese estava errada** — a causa real era outra, descrita na seção seguinte. A
tolerância foi mantida mesmo assim, porque é barata e não enfraquece nada: cada variação
continua exigindo o HMAC correto, feito com o segredo que só o Mercado Pago conhece. Falhas que
não são de HMAC (cabeçalho ausente ou malformado, timestamp fora da tolerância de 5 minutos, que
é a proteção contra replay) continuam sendo rejeitadas de primeira, sem insistência.

Fica aqui como registro para que ninguém "simplifique" esse código achando que é redundante sem
ler a história completa.

### A assinatura do webhook: o mistério e a solução

**Resolvido em 15/09/2026.** Durante quase toda a implementação, as notificações reais do Mercado
Pago chegavam com uma assinatura que não fechava com o segredo configurado. Antes da correção
isso significava responder 401 para toda notificação legítima — e, portanto, nenhuma confirmação
para quem fecha a aba antes de pagar, silenciosamente.

**A causa**: o segredo que tínhamos era o do **modo produtivo**, enquanto o site rodava com
credenciais de **teste**. O Mercado Pago assina as notificações de teste com o segredo do modo de
teste, que é outro. As duas pontas nunca podiam bater. Assim que o site passou a usar o Access
Token de produção, a assinatura passou a validar de primeira — confirmado nos logs: o `POST
/api/webhooks/mercadopago` aparece como `info`, sem o `warn` de diagnóstico que acompanhava todas
as notificações anteriores.

**Lição que custou caro**: antes de investigar o formato de um HMAC, confirmar que os dois lados
estão no mesmo ambiente. Foram testadas offline mais de 2.000 combinações de manifesto (nomes de
parâmetro, grafia do id, subconjuntos de campos, chave como texto e como bytes) — nenhuma podia
funcionar, porque o problema nunca esteve no formato. O sinal que deveria ter levantado a
suspeita mais cedo: o usuário afirmou que a "assinatura secreta" era **a mesma** nos modos
produtivo e de teste, o que não é o normal e indicava que ele só tinha visto um dos campos.

**O código continua tolerante de propósito.** Mesmo agora que a assinatura confere, o handler
segue processando notificações cuja assinatura não valide, desde que **a ordem citada exista no
nosso banco**. Isso foi decidido com o usuário quando a assinatura estava quebrada, e vale manter:
se o segredo for rotacionado um dia, ou se o Mercado Pago mudar o esquema, o pagamento continua
sendo confirmado em vez de parar em silêncio. A segurança não depende disso — o handler nunca
acreditou no conteúdo da notificação; ela só diz QUAL ordem mudou, e o que aconteceu vem de uma
consulta nossa à API do Mercado Pago. Uma notificação forjada não confirma inscrição não paga.

Toda falha de assinatura continua registrada no log. **Se `Webhook do Mercado Pago com assinatura
não conferida` voltar a aparecer, é sinal de que o segredo saiu de sincronia** — vale conferir,
mesmo que os pagamentos continuem sendo confirmados.

### ⚠️ Armadilha menor: o sandbox do Mercado Pago aprova quando quer

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
- `CRON_SECRET` — segredo que a Vercel envia no cabeçalho `Authorization` ao disparar o cron de
  reconciliação. A rota `/api/cron/reconciliar` aceita esse bearer **ou** uma sessão de admin.
- `MP_WEBHOOK_DEBUG` — opcional, existia só para diagnóstico (registrava a assinatura recebida).
  Foi removida da Vercel depois que o problema da assinatura foi resolvido; o código continua
  suportando, caso precise voltar.

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
  assinatura válida com id minúsculo → 200; replay com timestamp de 1 hora atrás → 401; tópico
  `payment` → 200 ignorado; reenvio duplicado → 200. **Atenção**: esses 401 refletem o
  comportamento daquele momento. Hoje assinatura inválida **não** gera mais 401 — ver
  "A assinatura do webhook: o mistério e a solução".
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
4. ~~Cadastrar a URL do webhook na aplicação de produção~~ — não era necessário: o webhook já
   estava configurado e, em produção, a assinatura passou a validar corretamente.
5. **Verificar um domínio no Resend** quando quiser voltar a enviar email de confirmação. Por ora
   o usuário optou por avisar manualmente, e a página `/consulta` cobre a lacuna.
6. ~~Retomar a investigação da assinatura do webhook~~ — resolvido; era divergência de ambiente.

### Conta de produção (dinheiro de verdade)

Desde 15/09/2026 o site usa o Access Token de **produção** da conta Mercado Pago de
**João Arthur Lopes Vasconcelos** (conta pessoal brasileira, id 3515760829, aplicação
`5474218114318934`). Verificado antes de publicar: a conta não tem a marca `test_user` e o Pix
está `active` nela — o que derrubou de vez o risco antigo de a categoria do negócio bloquear Pix.

**O dinheiro cai na conta pessoal do usuário, não em uma conta da farmácia.** Isso foi apontado
a ele e foi uma escolha consciente. Se um dia for preciso mudar para uma conta com CNPJ, o
momento certo é *antes* de haver inscritos pagantes — depois, os pagamentos ficam espalhados
entre duas contas.

**O webhook é o mesmo e funciona.** Cheguei a supor que a aplicação de produção fosse outra (o
id no meio do Access Token mudou) e que seria preciso recadastrar a URL — o usuário corrigiu, e o
teste confirmou: criando uma ordem com o token de produção, a notificação chega normalmente e
**com a assinatura válida**. A configuração de webhook e a `MP_WEBHOOK_SECRET` continuam corretas.

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
- **Duas categorias: masculina e feminina, sem restrição de idade** — decidido em 15/09/2026, substituindo a decisão anterior de "mistão sem categorias". O percurso continua único; o que muda é só a apuração do resultado. **A categoria sai do campo `sexo` que o formulário já coletava** — nenhuma coluna nova foi criada, e o CSV do admin já traz esse campo, então dá para separar os dois pódios na planilha.
- **A numeração de peito continua sequencial e única para as duas categorias** — não há faixa separada por categoria. Foi uma escolha consciente: o peito identifica a pessoa, a categoria vem do cadastro dela.
- **Sem camiseta e sem kit** — não há kit de participação nenhum. O evento distribui: número de peito para todos os inscritos, medalha para todos que correrem, e troféu mais dinheiro para os 3 primeiros de cada categoria. O site avisa isso explicitamente na seção "O que você recebe" da home, porque é a primeira pergunta de quem já correu outras provas.
- **Premiação em dinheiro, por categoria**: R$ 200,00 para o 1º lugar, R$ 100,00 para o 2º e R$ 50,00 para o 3º — **em cada categoria**, ou seja, R$ 700,00 no total. Confirmado com o usuário em 15/09/2026 (a frase original era ambígua tanto sobre isso quanto sobre quem ganha medalha). Nada disso impacta o sistema de inscrição: é texto, todo concentrado em `EVENT` (`src/lib/config.ts`), que alimenta a home e o email de confirmação.
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

Sequencial (1, 2, 3, ...), vindo da sequência Postgres `numero_peito_seq`. **Atribuído na
confirmação do pagamento**, não no envio do formulário — quem não pagou não tem peito, e o `id`
da tabela deixou de servir para isso porque passou a ter buracos.

O participante vê o número na tela de confirmação logo após o pagamento cair e, se tiver perdido
essa tela, pode recuperá-lo em `/consulta` com CPF e data de nascimento.

## Painel administrativo (para o pai do usuário)

- Precisa existir, protegido por login.
- **Autenticação escolhida: senha única simples** (não é login com email/senha via Supabase Auth) — mais rápido de implementar, suficiente para um único administrador por enquanto. A senha é definida pela variável de ambiente `ADMIN_PASSWORD` (nunca hardcoded no código) — o usuário escolhe e configura essa senha localmente (`.env.local`) e depois na Vercel.
- Permite ver a lista de inscritos com número de peito e situação de pagamento, **exportar em
  CSV/Excel**, e um botão **"Verificar pagamentos"** que pergunta ao Mercado Pago o que aconteceu
  com as inscrições ainda pendentes (útil quando alguém diz que pagou e não apareceu).

## Stack técnica escolhida

- **Frontend/backend**: Next.js (App Router, TypeScript, Tailwind CSS)
- **Banco de dados**: Supabase (plano gratuito)
- **Hospedagem**: Vercel (plano gratuito)

**Deploy feito e site no ar** em `https://desafio-viva.vercel.app`. Código no GitHub em
`https://github.com/arthurvasconceloslp/desafio-viva` (repositório privado, branch `main`),
conectado à Vercel via login com GitHub. Variáveis de ambiente configuradas no dashboard da
Vercel: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`, `RESEND_API_KEY`,
`MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` e `CRON_SECRET`.

Todo `git push` para `main` dispara redeploy automático na Vercel. **Mudar uma variável de
ambiente no dashboard não tem efeito sozinha** — ela só passa a valer no próximo deploy, o que
já causou confusão uma vez (o site continuou usando o token antigo depois de a variável ter sido
trocada).

O diretório está linkado ao projeto da Vercel (`.vercel/`, gitignored), então a CLI funciona
direto: `vercel logs`, `vercel env ls`, `vercel env add`. Vale saber que `vercel env pull`
**mascara valores sensíveis** como `[SENSITIVE]` — não dá para ler um segredo de volta por ali.

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

### Bloqueiam a divulgação ao público

1. **Resetar a sequência do número de peito.** As rodadas de teste consumiram números; sem isso o
   primeiro inscrito de verdade não pega o peito nº 1:
   `alter sequence public.numero_peito_seq restart with 1;` no SQL Editor do Supabase.
2. **Uma inscrição paga de verdade, feita pelo usuário.** É o único teste que não pôde ser feito
   aqui: o sandbox aprovava sozinho, produção é Pix real. Conferir que o QR abre no app do banco,
   que o peito aparece e que a inscrição fica "Paga" no painel.

### Decisões em aberto

- **Grafia do nome do evento**: "Desafío" (acento espanhol, como foi escrito na conversa original)
  ou "Desafio"? Hoje o sistema usa **"Desafio Farmácia Viva"**, em `src/lib/config.ts`.
- **Conta que recebe o dinheiro**: hoje é a conta pessoal do usuário, não uma conta da farmácia
  com CNPJ. Se for mudar, o momento certo é antes de haver inscritos pagantes.
- **Rate limiting real** (tentativas de senha no admin e spam no formulário público). Hoje há só
  o honeypot. Uma defesa de verdade exigiria um serviço externo com estado compartilhado
  (ex.: Upstash Redis) — nova integração, com conta a criar. Nunca foi decidido.
- **Email de confirmação (Resend)**: desligado na prática por decisão do usuário, que avisa
  manualmente. Para religar, verificar um domínio em resend.com/domains e trocar `FROM_ADDRESS`
  em `src/lib/email.ts`. Um domínio próprio serve para os dois usos: Resend e endereço do site na
  Vercel.
- **Percurso**: continua "em breve". Falta o usuário fornecer GPX ou link do Strava/Google Maps.
- **Alerta do OWASP ZAP**: ficou pendente o nome exato do alerta que o colega do usuário
  reportou, para confirmar se é falso positivo (ver a seção sobre o ZAP).

### Lembretes operacionais

- Se novos testes de inscrição forem feitos, **apagar os registros e resetar a sequência de novo**
  antes do lançamento.
- Cobranças Pix não pagas expiram sozinhas e aparecem no painel do Mercado Pago. As que sobraram
  das verificações são inofensivas.
- O cron de reconciliação roda **uma vez por dia** porque o plano Hobby da Vercel rejeita, no
  deploy, qualquer expressão mais frequente. Em plano Pro, trocar a expressão em `vercel.json`.

## Preparatório: análise completa do site com os agentes (próxima sessão)

Esta seção existe para que a próxima sessão possa começar a análise **sem redescobrir contexto**.
Leia-a inteira antes de invocar qualquer agente.

### Como conduzir

O ponto de entrada é o **tech-lead**, que é o único que pode invocar os outros cinco. Peça a ele
uma análise completa e deixe que ele distribua. O fluxo esperado para uma revisão ampla é:

```
análise → security → qa → performance → auditor
```

O **developer** só entra depois, para corrigir o que for aprovado — não o chame na fase de
diagnóstico, para não misturar quem encontra com quem conserta.

**Peça um veredito consolidado**, não cinco relatórios soltos: o que precisa ser corrigido antes
de divulgar, o que pode esperar, e o que é aceitável como está. Boa parte das escolhas abaixo foi
deliberada, e um relatório que as trate como defeito vai gerar retrabalho.

### Verificação antes de começar

```bash
npm run build     # build de produção; erros de tipo aparecem aqui
npm run lint      # ESLint
npm audit         # dependências
```

Não existe suíte automatizada de unit/integration/E2E — a verificação sempre foi build, lint e
teste manual no navegador. **A ausência de testes automatizados é, ela própria, um achado
legítimo para o auditor**, e provavelmente o mais relevante do projeto.

### ⚠️ Restrições que a análise precisa respeitar

Isto não é um projeto de brinquedo rodando local. Antes de qualquer agente tocar em algo:

1. **O site está no ar cobrando dinheiro de verdade.** Uma inscrição de teste em produção cria
   uma cobrança Pix real na conta pessoal do usuário. Não crie inscrições em produção sem
   necessidade, e apague o que criar.
2. **O banco é compartilhado e é o de produção.** Não há ambiente de staging. Toda escrita em
   `inscricoes` afeta dados reais. Prefira leitura; para escrita, use ids explícitos e apague
   depois.
3. **A tabela deve ficar vazia até o lançamento.** Se sobrar registro de teste, apague e peça ao
   usuário para resetar `numero_peito_seq`.
4. **Nunca publique (`git push`) sem o usuário mandar.** Todo push para `main` redeploya em
   produção.
5. **Segredos ficam só em `.env.local`** (gitignored) e nas variáveis da Vercel. O usuário tem
   histórico de colar segredos no lugar errado — confira antes de assumir que estão certos.

### Escolhas deliberadas — não reportar como defeito sem ler a justificativa

Cada uma destas parece um erro para quem chega de fora, e todas têm a razão registrada neste
documento:

| Escolha | Onde está a justificativa |
|---|---|
| Webhook aceita notificação sem assinatura válida | "A assinatura do webhook: o mistério e a solução" |
| `'unsafe-inline'` em `script-src` na CSP | "CSP quebrou a hidratação do site inteiro" |
| Serviço de pagamento é o Mercado Pago, não o Stripe | "Por que Mercado Pago e não Stripe" |
| `useEffect` reimpondo valores no DOM do formulário | "Como o formulário sobrevive ao reset do React 19" |
| CPF único só entre inscrições pagas | "Mudanças no banco" |
| Confirmação em três caminhos redundantes | "Três caminhos de confirmação (de propósito)" |
| Cron diário, e não a cada 5 minutos | "Três caminhos de confirmação" (limite do plano Hobby) |
| Consulta pública exige CPF **e** data de nascimento | `Página "Meu número" (/consulta)` |
| Sem testes automatizados | nunca houve; é achado legítimo |

### O que vale a pena olhar de verdade

Pontos onde eu, que escrevi o código, tenho menos confiança — é aqui que uma revisão
independente rende mais:

- **`src/lib/pagamento.ts`** é o coração do sistema. `reconcileOrder`, `confirmarPagamento` e
  `reconciliarPendentes` podem ser chamados ao mesmo tempo por três gatilhos diferentes. A
  idempotência real mora na função Postgres `confirmar_pagamento` (`SELECT ... FOR UPDATE`);
  confirmar que não existe caminho que atribua dois peitos ou reenvie email.
- **`reconciliarPendentes` roda em série**, com uma chamada HTTP ao Mercado Pago por inscrição
  pendente, limitada a 50. Com muitos inscritos isso pode estourar o tempo da função. O
  performance deve olhar o número real, não o hipotético.
- **`/api/inscricao/status` consulta o Mercado Pago a cada chamada** enquanto a inscrição está
  pendente, e o cliente faz polling a cada 6 segundos. Custo aceitável hoje; vale calcular o que
  acontece com dezenas de pessoas pagando ao mesmo tempo.
- **Enumeração em `/consulta`**: a proteção é exigir CPF + data de nascimento e devolver mensagem
  genérica. Não há rate limiting. Avaliar se é suficiente na prática.
- **O campo Nome não filtra HTML**. React escapa na renderização, mas o valor vai cru para o CSV
  e para o email. O escape de fórmula do CSV já existe (`csvEscape`); conferir o email.
- **`src/app/admin/`**: a sessão é um HMAC fixo derivado de `ADMIN_PASSWORD`, sem expiração no
  próprio token (só o `maxAge` do cookie) e sem invalidação. Trocar a senha invalida tudo, o que
  é aceitável para um admin só — confirmar que não há caminho pior.
- **Acessibilidade e responsividade** nunca foram testadas de propósito. Vale uma passada.

### Perguntas que a análise deveria responder

1. Existe algum caminho em que alguém consiga número de peito **sem pagar**?
2. Existe algum caminho em que alguém **pague e não seja confirmado**, sem que ninguém perceba?
3. O que acontece se o Mercado Pago ficar fora do ar por uma hora durante a inscrição?
4. O que acontece com 50 pessoas se inscrevendo ao mesmo tempo?
5. Algum dado pessoal (CPF, email, telefone) vaza por alguma rota pública?
6. Se o usuário sumir por seis meses e voltar, o que neste código ele não vai conseguir manter?
