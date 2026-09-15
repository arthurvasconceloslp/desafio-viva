/**
 * Configuração central do evento. Edite aqui quando data, local ou nome
 * forem definidos — evita espalhar esses valores pelo código.
 */
export const EVENT = {
  name: "Desafio Farmácia Viva",
  subtitle: "Corrida de aniversário da Farmácia Viva",
  dateLabel: "18 de outubro de 2026",
  locationLabel: "Concentração: Farmácia Viva, em frente à Praça da Bela Vista",
  awardsText: "Premiação para os 3 primeiros colocados.",
  description:
    "Uma corrida única, aberta a todos, para comemorar o aniversário da Farmácia Viva. Sem categorias, sem distinção de distância, sexo ou idade — todo mundo corre junto.",
};

/**
 * Taxa de inscrição, cobrada via Pix pelo Mercado Pago.
 *
 * O valor fica em centavos porque é assim que ele circula no resto do
 * sistema (coluna `valor_centavos` no banco) — converter só na hora de
 * exibir ou de enviar para o Mercado Pago evita erro de arredondamento.
 */
export const PAYMENT = {
  feeAmountCents: 2000, // R$ 20,00
  currency: "BRL",
  /**
   * Validade do código Pix. O Mercado Pago aceita de 30 minutos a 30 dias;
   * uma hora é folgado para quem se inscreve pelo celular e paga na hora,
   * sem deixar cobranças pendentes acumuladas por dias.
   */
  pixExpirationMinutes: 60,
};

export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
