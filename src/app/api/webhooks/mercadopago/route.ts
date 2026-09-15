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
 * Valida a assinatura aceitando o `data.id` como veio E em minúsculas.
 *
 * Motivo: a documentação do Mercado Pago diz que o manifesto assinado usa o
 * `data.id` em minúsculas quando ele é alfanumérico, mas o
 * `WebhookSignatureValidator` do SDK usa o valor exatamente como recebido — e
 * os ids de ordem chegam em MAIÚSCULAS (`ORDTST01...`). Se as duas pontas
 * discordarem, todo webhook legítimo seria rejeitado como falso e nenhum
 * pagamento se confirmaria por esse caminho. Testar as duas grafias não
 * enfraquece nada: ambas continuam exigindo o HMAC correto feito com o
 * segredo, que só o Mercado Pago conhece.
 *
 * Só vale insistir quando a falha foi de HMAC — cabeçalho ausente, malformado
 * ou timestamp fora da tolerância (replay) não melhoram com outra grafia.
 */
function validarAssinatura(params: {
  secret: string;
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | null;
}): void {
  const grafias = params.dataId
    ? Array.from(new Set([params.dataId, params.dataId.toLowerCase()]))
    : [params.dataId];

  let ultimoErro: unknown;
  for (const dataId of grafias) {
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
  const dataIdParam = request.nextUrl.searchParams.get("data.id");

  try {
    validarAssinatura({
      secret,
      xSignature: request.headers.get("x-signature"),
      xRequestId: request.headers.get("x-request-id"),
      dataId: dataIdParam,
    });
  } catch (error) {
    if (error instanceof InvalidWebhookSignatureError) {
      console.warn(
        `Webhook do Mercado Pago rejeitado (${error.reason}), request-id=${error.requestId ?? "?"}`
      );
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
