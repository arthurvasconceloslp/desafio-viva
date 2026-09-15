/**
 * Endereço público do site, usado para montar a URL absoluta que o Mercado
 * Pago precisa para chamar nosso webhook.
 *
 * Em produção a Vercel injeta `VERCEL_PROJECT_PRODUCTION_URL` sozinha (é o
 * domínio estável do projeto, não o da build). `SITE_URL` existe para quando
 * um domínio próprio for registrado — aí basta definir a variável, sem mexer
 * no código. Localmente não há endereço público, então devolvemos null e a
 * cobrança é criada sem callback (veja o README para testar com um túnel).
 */
export function getSiteUrl(): string | null {
  const explicit = process.env.SITE_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/+$/, "");
  }

  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelHost) {
    return `https://${vercelHost.replace(/\/+$/, "")}`;
  }

  return null;
}

export function getWebhookUrl(): string | undefined {
  const base = getSiteUrl();
  return base ? `${base}/api/webhooks/mercadopago` : undefined;
}
