# Projeto: Sistema de Inscrição — Desafío Farmácia Viva

Sistema web de inscrição para a corrida de comemoração de aniversário da farmácia do pai do usuário. Este documento resume tudo que foi decidido em conversa antes de qualquer código ser escrito, para que a próxima sessão possa continuar de onde paramos sem precisar perguntar tudo de novo.

## Status atual

Implementação completa do código: todas as 5 páginas, formulário de inscrição com Server Action + validação (zod, incluindo checagem de dígito verificador de CPF), painel admin com login por senha única (sessão via cookie HMAC-assinado, sem guardar a senha em texto), exportação CSV, e proteção de `/admin/dashboard` via `src/proxy.ts` (convenção nova do Next.js 16, substituiu `middleware.ts`). `npm run build` e `npm run lint` passam sem erros.

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

## Nome do evento

**Desafío Farmácia Viva** (confirmar com o usuário se é "Desafío" com acento espanhol de propósito ou "Desafio" em português — foi escrito com acento na conversa, mas pode ter sido erro de digitação). Por padrão o sistema usa "Desafio Farmácia Viva" (grafia em português), configurável em um único lugar (`src/lib/config.ts`).

## Decisões de produto

- **Inscrição gratuita** — por enquanto. O usuário disse que "ainda não foi decidido, pode ser só um valor significativo ou não", mas decidiu seguir com gratuita por ora. Vale manter o modelo de dados aberto para adicionar pagamento (Pix/Mercado Pago ou Stripe) no futuro sem grande refatoração, mas **não implementar pagamento agora**.
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

Tabela `inscricoes`:
- `id` (bigint identity, gerado automaticamente) — também serve como número de peito
- `nome` (text)
- `cpf` (text, com constraint de unicidade para evitar inscrição duplicada)
- `data_nascimento` (date)
- `sexo` (text)
- `email` (text)
- `telefone` (text)
- `created_at` (timestamptz, default now())

SQL de criação em `supabase/schema.sql`.

## Páginas/telas planejadas

1. **Home / página do evento** (`/`) — nome do evento, data/local (placeholder até serem definidos), informações gerais, premiação, botão de inscrição.
2. **Formulário de inscrição** (`/inscricao`) — os campos listados acima.
3. **Confirmação de inscrição** (`/inscricao/confirmacao`) — mostra o número de peito gerado.
4. **Percurso** (`/percurso`) — aba com aviso "em breve", a ser substituída futuramente por mapa real (Strava/Google Maps embed ou GPX renderizado).
5. **Painel admin** (`/admin`) — login por senha única, lista de inscritos, exportação CSV.

## Pendências / perguntas em aberto para quando o usuário retomar

- Confirmar grafia final do nome do evento ("Desafío" vs "Desafio") — hoje está como "Desafio Farmácia Viva" em `src/lib/config.ts`.
- ~~Definir data e local do evento~~ — feito: 18/10/2026, concentração na Farmácia Viva em frente à Praça da Bela Vista.
- ~~Definir a senha do painel admin~~ — feito, está em `.env.local` (`ADMIN_PASSWORD`).
- ~~Criar conta no Supabase e configurar `.env.local`~~ — feito. Variáveis reais: `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` (chave secreta `sb_secret_...`, não a `sb_publishable_...`) — não usamos Supabase Auth nem anon key, tudo passa pela service role no servidor.
- ~~Criar conta na Vercel e fazer o deploy~~ — feito, site no ar (ver "Stack técnica escolhida" acima para a URL do repositório).
- ~~Trocar o favicon pela logo~~ — feito via `src/app/icon.png`.
- Decidir sobre rate limiting real (login admin + spam de inscrição) — ver seção Segurança acima.
- **Verificar um domínio no Resend antes de divulgar a inscrição para o público** (ver seção "Notificação por email" acima) — sem isso, só o email da conta Resend recebe as confirmações.
- Se houver mais testes manuais de inscrição depois deste ponto, rodar de novo `alter table public.inscricoes alter column id restart with 1;` antes do lançamento real.
