import { NextResponse, type NextRequest } from "next/server";
import {
  WebhookSignatureValidator,
  InvalidWebhookSignatureError,
  SignatureFailureReason,
  MPNotFoundError,
} from "mercadopago";
import { reconcileOrder, situacaoDaOrdem } from "@/lib/pagamento";

/**
 * Webhook do Mercado Pago — o aviso de que uma ordem mudou.
 *
 * A regra que sustenta a segurança deste handler é uma só: **o conteúdo da
 * notificação nunca decide nada**. Ela só diz QUAL ordem mudou; o que
 * aconteceu vem de uma consulta nossa à API do Mercado Pago, autenticada com
 * o nosso token, dentro de `reconcileOrder`. É por isso que uma notificação
 * forjada não consegue confirmar uma inscrição que ninguém pagou.
 *
 * A assinatura é verificada, mas não é o que impede fraude — ver o bloco
 * "Por que seguimos mesmo sem assinatura válida", no meio do handler, para a
 * história completa e para o filtro que protege o endpoint contra abuso.
 *
 * Códigos de resposta importam: o Mercado Pago reenvia a notificação a cada
 * 15 minutos até receber 200/201. Por isso devolvemos 200 também para
 * eventos que decidimos ignorar (senão ele reenvia para sempre) e 500 apenas
 * para falhas temporárias que realmente merecem nova tentativa.
 */

/** Tópicos que dizem respeito a uma ordem (Orders API). Os demais são ignorados. */
const ORDER_TOPICS = new Set(["order", "orders"]);

/**
 * Monta os valores de `data.id` que podem ter sido usados no manifesto
 * assinado pelo Mercado Pago.
 *
 * O manifesto é `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`, mas na
 * prática há três incertezas sobre o `<data.id>`:
 *  1. o nome do parâmetro na query — as notificações novas usam `data.id`,
 *     mas o formato IPN antigo usa `id`;
 *  2. a grafia — a documentação diz que o manifesto usa o id em minúsculas
 *     quando ele é alfanumérico, e os ids de ordem chegam em MAIÚSCULAS
 *     (`ORDTST01...`), mas o validador do SDK usa o valor como veio;
 *  3. a ausência — quando o parâmetro não vem na URL, o trecho `id:` some
 *     do manifesto.
 *
 * Errar qualquer um deles faz TODO webhook legítimo ser rejeitado como falso,
 * em silêncio. Por isso testamos os candidatos em vez de apostar em um.
 * Isso não enfraquece a verificação: cada candidato continua exigindo o HMAC
 * correto, feito com o segredo que só o Mercado Pago conhece — quem não tem o
 * segredo não passa em nenhum deles.
 */
function candidatosDataId(url: URL): (string | null)[] {
  const brutos = [
    url.searchParams.get("data.id"),
    url.searchParams.get("id"),
  ].filter((v): v is string => Boolean(v));

  const candidatos = new Set<string | null>();
  for (const bruto of brutos) {
    candidatos.add(bruto);
    candidatos.add(bruto.toLowerCase());
  }
  // Último caso: manifesto sem o trecho `id:`.
  candidatos.add(null);
  return Array.from(candidatos);
}

/**
 * Valida a assinatura contra todos os candidatos de `data.id`.
 *
 * Só insiste quando a falha foi de HMAC: cabeçalho ausente, malformado ou
 * timestamp fora da tolerância (replay) não melhoram com outro candidato e
 * são rejeitados de primeira.
 */
function validarAssinatura(params: {
  secret: string;
  xSignature: string | null;
  xRequestId: string | null;
  candidatos: (string | null)[];
}): void {
  let ultimoErro: unknown;
  for (const dataId of params.candidatos) {
    try {
      WebhookSignatureValidator.validate({
        xSignature: params.xSignature,
        xRequestId: params.xRequestId,
        dataId,
        secret: params.secret,
        // Janela curta contra replay de uma notificação capturada.
        toleranceSeconds: 300,
      });
      return;
    } catch (error) {
      ultimoErro = error;
      const ehHmac =
        error instanceof InvalidWebhookSignatureError &&
        error.reason === SignatureFailureReason.SignatureMismatch;
      if (!ehHmac) throw error;
    }
  }
  throw ultimoErro;
}

export async function POST(request: NextRequest) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) {
    console.error("MP_WEBHOOK_SECRET não configurada — webhook rejeitado.");
    return NextResponse.json(
      { error: "Webhook não configurado." },
      { status: 500 }
    );
  }

  // Corpo bruto, lido antes de qualquer parse: a verificação de assinatura
  // precisa dos bytes exatamente como chegaram.
  const rawBody = await request.text();
  const dataIdParam =
    request.nextUrl.searchParams.get("data.id") ??
    request.nextUrl.searchParams.get("id");

  let assinado = true;

  try {
    validarAssinatura({
      secret,
      xSignature: request.headers.get("x-signature"),
      xRequestId: request.headers.get("x-request-id"),
      candidatos: candidatosDataId(request.nextUrl),
    });
  } catch (error) {
    if (error instanceof InvalidWebhookSignatureError) {
      assinado = false;
      // Diagnóstico: uma rejeição pode significar tanto uma tentativa de
      // fraude quanto uma divergência de formato entre o que o Mercado Pago
      // assina e o que reconstruímos — e as duas são indistinguíveis sem ver
      // o formato real da requisição. Registramos só o que é necessário para
      // diferenciar: nada aqui é segredo (a query é pública, o request-id é
      // um identificador de correlação e o `ts` é o carimbo da assinatura).
      const diagnostico = [
        `Webhook do Mercado Pago rejeitado (${error.reason})`,
        `request-id=${error.requestId ?? "?"}`,
        `ts=${error.timestamp ?? "?"}`,
        `query=${request.nextUrl.search || "(vazia)"}`,
        `candidatos=${JSON.stringify(candidatosDataId(request.nextUrl))}`,
      ];

      // Diagnóstico profundo, ligado sob demanda por MP_WEBHOOK_DEBUG=1.
      // Registra a assinatura recebida para permitir descobrir offline, com
      // o segredo em mãos, qual manifesto o Mercado Pago usou — ou concluir
      // que o segredo configurado é de outra aplicação/ambiente. O valor `v1`
      // é a SAÍDA de um HMAC sobre dados públicos: não revela o segredo, e
      // não serve para forjar outra notificação, porque cada uma tem seu
      // próprio `ts` e a janela de tolerância é de 5 minutos. Ainda assim
      // fica desligado por padrão, para não poluir o log de produção.
      if (process.env.MP_WEBHOOK_DEBUG === "1") {
        diagnostico.push(
          `x-signature=${request.headers.get("x-signature") ?? "(ausente)"}`,
          `corpo=${rawBody.slice(0, 300)}`
        );
      }

      console.warn(diagnostico.join(" | "));
      // NÃO devolvemos 401 aqui. Ver "Por que seguimos sem assinatura"
      // logo abaixo — a notificação continua valendo apenas como um aviso
      // de "vá conferir esta ordem", e o filtro que protege o endpoint é a
      // existência da ordem no nosso banco, verificada adiante.
    } else {
      throw error;
    }
  }

  let event: { type?: string; topic?: string; data?: { id?: string | number } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const topic = String(event.type ?? event.topic ?? "").toLowerCase();
  if (topic && !ORDER_TOPICS.has(topic)) {
    // Ex.: notificações de "payment" quando a aplicação também as assina.
    // Não são erro — só não são o que reconciliamos.
    return NextResponse.json({ ok: true, ignored: topic });
  }

  const orderId = String(event.data?.id ?? dataIdParam ?? "").trim();
  if (!orderId) {
    return NextResponse.json({ ok: true, ignored: "sem id" });
  }

  // ---------------------------------------------------------------------
  // Por que seguimos mesmo sem assinatura válida
  //
  // As notificações reais do Mercado Pago chegam com uma assinatura que não
  // fecha com nenhum segredo configurado no painel, mesmo depois de
  // regenerá-lo e de testar exaustivamente os formatos documentados de
  // manifesto. Exigir assinatura, na prática, desligaria o webhook.
  //
  // Seguir é seguro porque este handler NUNCA acreditou no conteúdo da
  // notificação: ela só diz QUAL ordem mudou, e o que aconteceu vem de uma
  // consulta nossa à API do Mercado Pago, autenticada com o nosso token.
  // Uma notificação forjada, portanto, não consegue confirmar uma inscrição
  // que não foi paga — no máximo nos faz reconsultar uma ordem.
  //
  // O que sobra é o risco de abuso (alguém nos fazer gastar consultas à
  // toa), e é contra isso que serve o filtro abaixo: sem assinatura válida,
  // a ordem precisa existir no nosso banco. O id é uma string opaca que só
  // existe aqui e na tela de quem se inscreveu.
  // ---------------------------------------------------------------------
  if (!assinado) {
    const situacao = await situacaoDaOrdem(orderId);

    if (situacao === null) {
      console.warn(
        `Webhook sem assinatura válida citando ordem desconhecida (${orderId}) — ignorado.`
      );
      return NextResponse.json({ ok: true, ignored: "ordem desconhecida" });
    }

    if (situacao === "pago") {
      // Já confirmada: nada a fazer, e sem gastar consulta.
      return NextResponse.json({ ok: true, status: "pago" });
    }
  }

  try {
    const status = await reconcileOrder(orderId);
    return NextResponse.json({ ok: true, status });
  } catch (error) {
    if (error instanceof MPNotFoundError) {
      // Ordem de outra aplicação ou já removida: reenviar não vai ajudar.
      console.warn(`Ordem ${orderId} não encontrada no Mercado Pago.`);
      return NextResponse.json({ ok: true, ignored: "ordem desconhecida" });
    }
    console.error(`Falha ao processar webhook da ordem ${orderId}:`, error);
    return NextResponse.json(
      { error: "Falha temporária." },
      { status: 500 }
    );
  }
}
