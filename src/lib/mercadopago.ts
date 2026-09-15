import { MercadoPagoConfig, Order } from "mercadopago";
import { PAYMENT } from "./config";

/**
 * Integração com o Mercado Pago (Orders API, `POST /v1/orders`).
 *
 * Este módulo só pode ser usado no servidor: o MP_ACCESS_TOKEN é a chave
 * privada da conta e nunca pode chegar ao navegador.
 *
 * Usamos o "Checkout Transparente": o Mercado Pago devolve o QR code e o
 * código copia-e-cola, e nós mostramos isso numa página do próprio site, em
 * vez de redirecionar o participante para fora. Confirmação de pagamento
 * Pix é sempre assíncrona — quem avisa que o dinheiro entrou é o webhook,
 * nunca o navegador do participante.
 */

function getClient(): MercadoPagoConfig {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error(
      "Mercado Pago não configurado. Defina MP_ACCESS_TOKEN em .env.local."
    );
  }
  return new MercadoPagoConfig({ accessToken, options: { timeout: 15000 } });
}

export type PixCharge = {
  orderId: string;
  /** Código "copia e cola" que o participante pode colar no app do banco. */
  qrCode: string;
  /** Imagem do QR code em base64 (renderizada como `data:image/png;base64,...`). */
  qrCodeBase64: string;
  ticketUrl: string | null;
  expiresAt: string | null;
};

/** Converte centavos para o formato decimal em string que a API espera ("20.00"). */
function toDecimalString(cents: number): string {
  return (cents / 100).toFixed(2);
}

export async function createPixCharge(params: {
  /** Id da linha em `inscricoes`, para reconciliar depois. */
  externalReference: string;
  amountCents: number;
  nome: string;
  email: string;
  cpf: string;
  description: string;
  /** URL do nosso webhook. Omitida quando o site ainda não sabe seu próprio endereço. */
  notificationUrl?: string;
}): Promise<PixCharge> {
  const order = new Order(getClient());
  const amount = toDecimalString(params.amountCents);
  const [firstName, ...rest] = params.nome.trim().split(/\s+/);

  const response = await order.create({
    body: {
      type: "online",
      processing_mode: "automatic",
      external_reference: params.externalReference,
      description: params.description,
      total_amount: amount,
      payer: {
        email: params.email,
        first_name: firstName,
        last_name: rest.join(" ") || firstName,
        identification: { type: "CPF", number: params.cpf },
      },
      transactions: {
        payments: [
          {
            amount,
            payment_method: { id: "pix", type: "bank_transfer" },
            // ISO 8601 de duração: PT60M = 60 minutos a partir de agora.
            expiration_time: `PT${PAYMENT.pixExpirationMinutes}M`,
          },
        ],
      },
      ...(params.notificationUrl
        ? { config: { online: { callback_url: params.notificationUrl } } }
        : {}),
    },
    requestOptions: {
      // Chave determinística: se a Server Action for reexecutada (retry do
      // Next.js, duplo clique), o Mercado Pago devolve a MESMA ordem em vez
      // de criar uma segunda cobrança para a mesma inscrição.
      idempotencyKey: `inscricao-${params.externalReference}`,
    },
  });

  const payment = response.transactions?.payments?.[0];
  const method = payment?.payment_method;

  if (!response.id || !method?.qr_code || !method.qr_code_base64) {
    throw new Error(
      `Mercado Pago não devolveu o QR code do Pix (status=${response.status ?? "?"}, detail=${response.status_detail ?? "?"}).`
    );
  }

  return {
    orderId: response.id,
    qrCode: method.qr_code,
    qrCodeBase64: method.qr_code_base64,
    ticketUrl: method.ticket_url ?? null,
    expiresAt: payment?.date_of_expiration ?? null,
  };
}

export async function getOrder(orderId: string) {
  return new Order(getClient()).get({ id: orderId });
}

export type PixOutcome = "pago" | "expirado" | "falhou" | "cancelado" | "pendente";

/**
 * Traduz o estado de uma ordem do Mercado Pago para o `payment_status` que
 * guardamos.
 *
 * ATENÇÃO — os valores da Orders API NÃO são os da antiga API de pagamentos.
 * Aqui "pago" é `processed` (com `status_detail` `accredited`), e não
 * `approved`; uma cobrança Pix recém-criada volta como `action_required` /
 * `waiting_transfer`, e não `pending`. Confundir os dois conjuntos faz o
 * pagamento nunca ser confirmado, em silêncio. Tabela oficial:
 * https://www.mercadopago.com.br/developers/en/docs/checkout-api-orders/payment-management/status/order-status
 *
 * O status do pagamento manda; o da ordem serve de fallback para quando ainda
 * não existe pagamento nenhum na ordem.
 */
export function mapOrderToStatus(order: {
  status?: string;
  transactions?: { payments?: { status?: string }[] };
}): PixOutcome {
  const status = order.transactions?.payments?.[0]?.status ?? order.status;

  switch (status) {
    case "processed":
      // `accredited` (creditado) e `partially_refunded` (parte devolvida) são
      // os dois detalhes possíveis aqui, e em ambos o dinheiro entrou.
      return "pago";
    case "expired":
      return "expirado";
    case "failed":
      return "falhou";
    case "canceled":
    case "cancelled":
      return "cancelado";
    case "refunded":
    case "charged_back":
      // Só acontecem depois de um pagamento que já entrou. Como a inscrição
      // já estará marcada como paga, a reconciliação não sobrescreve nada —
      // devolução e chargeback são tratados manualmente pelo administrador.
      return "cancelado";
    case "created":
    case "processing":
    case "action_required":
    case "in_review":
      return "pendente";
    default:
      // Status desconhecido (ex.: valor novo na API): tratar como pendente é
      // o único erro seguro — nunca confirmar uma inscrição por engano.
      return "pendente";
  }
}
