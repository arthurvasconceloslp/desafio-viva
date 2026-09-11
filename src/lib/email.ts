import { Resend } from "resend";
import { EVENT } from "./config";

// onboarding@resend.dev funciona sem verificar domínio, mas o Resend só
// entrega a partir dele para o email da própria conta Resend (modo de
// teste). Para enviar a qualquer inscrito de verdade, é preciso verificar
// um domínio próprio em resend.com/domains e trocar este remetente.
const FROM_ADDRESS = "Desafio Farmácia Viva <onboarding@resend.dev>";

export async function sendConfirmationEmail(params: {
  to: string;
  nome: string;
  numero: number;
}): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { sent: false, error: "RESEND_API_KEY não configurada." };
  }

  const resend = new Resend(apiKey);
  const primeiroNome = params.nome.trim().split(/\s+/)[0] || params.nome;

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: params.to,
    subject: `Inscrição confirmada — ${EVENT.name} — Peito nº${params.numero}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <h1 style="color: #dc2626; font-size: 20px;">${EVENT.name}</h1>
        <p>Olá, ${primeiroNome}!</p>
        <p>Sua inscrição foi confirmada. Guarde seu número de peito:</p>
        <p style="font-size: 40px; font-weight: bold; color: #dc2626; margin: 16px 0;">
          ${params.numero}
        </p>
        <p><strong>Data:</strong> ${EVENT.dateLabel}</p>
        <p><strong>Local:</strong> ${EVENT.locationLabel}</p>
        <p>${EVENT.awardsText}</p>
        <p style="color: #6b7280; font-size: 13px; margin-top: 24px;">
          Nos vemos na corrida!
        </p>
      </div>
    `,
  });

  if (error) {
    return { sent: false, error: error.message };
  }
  return { sent: true };
}
