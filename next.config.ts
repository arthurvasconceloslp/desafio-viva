import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  {
    // Sem nonce: o Next.js injeta scripts inline próprios (bootstrap de
    // hidratação, payload de RSC) que exigiriam CSP dinâmico por página
    // (forçando toda a rota a renderizar sob demanda) para usar nonce. Para
    // um site deste porte, sem scripts de terceiros, 'unsafe-inline' em
    // script-src é a troca recomendada pela própria documentação do Next.js
    // — a proteção contra XSS já vem do React escapar toda saída por padrão.
    // 'unsafe-eval' só em dev: o React usa eval() para reconstruir stack
    // traces de erro do servidor no console; nunca é usado em produção.
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self' https://*.supabase.co",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
