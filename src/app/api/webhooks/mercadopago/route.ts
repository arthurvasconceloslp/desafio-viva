import { NextResponse, type NextRequest } from "next/server";
import {
  WebhookSignatureValidator,
  InvalidWebhookSignatureError,
  SignatureFailureReason,
  MPNotFoundError,
} from "mercadopago";
import { reconcileOrder } from "@/lib/pagamento";

/**
 * Webhook do Mercado Pago — a única fonte confiável de "o Pix foi pago".
 *
 * Nunca confiamos no corpo da notificação para decidir que algo foi pago:
 * ela só diz QUAL ordem mudou. Quem diz o que aconteceu é a consulta feita
 * depois, direto na API do Mercado Pago, dentro de `reconcileOrder`.
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

  // Corpo bruto: a assinatura é verificada antes de qualquer parse, e nada
  // do conteúdo é usado enquanto a origem não estiver confirmada.
  const rawBody = await request.text();
  const dataIdParam =
    request.nextUrl.searchParams.get("data.id") ??
    request.nextUrl.searchParams.get("id");

  try {
    validarAssinatura({
      secret,
      xSignature: request.headers.get("x-signature"),
      xRequestId: request.headers.get("x-request-id"),
      candidatos: candidatosDataId(request.nextUrl),
    });
  } catch (error) {
    if (error instanceof InvalidWebhookSignatureError) {
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
      return NextResponse.json(
        { error: "Assinatura inválida." },
        { status: 401 }
      );
    }
    throw error;
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
