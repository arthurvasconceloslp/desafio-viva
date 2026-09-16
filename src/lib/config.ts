/**
 * Configuração central do evento. Edite aqui quando data, local ou nome
 * forem definidos — evita espalhar esses valores pelo código.
 */
export const EVENT = {
  name: "Desafio Farmácia Viva",
  subtitle: "Corrida de aniversário da Farmácia Viva",
  dateLabel: "18 de outubro de 2026",
  locationLabel: "Concentração: Farmácia Viva, em frente à Praça da Bela Vista",
  description:
    "Uma corrida para comemorar o aniversário da Farmácia Viva: um só percurso, duas categorias — masculina e feminina — e nenhuma restrição de idade. Sua categoria é definida pelo campo Sexo do formulário de inscrição.",
  categoriesLabel: "Masculina e feminina, sem restrição de idade",
  /**
   * Premiação em dinheiro POR CATEGORIA: cada pódio (masculino e feminino)
   * recebe os três valores abaixo, então o total distribuído é o dobro.
   */
  awards: [
    { place: "1º lugar", prize: "R$ 200,00" },
    { place: "2º lugar", prize: "R$ 100,00" },
    { place: "3º lugar", prize: "R$ 50,00" },
  ],
  awardsNote:
    "Os valores acima valem para cada categoria — o pódio masculino e o feminino recebem os mesmos prêmios. Os 3 primeiros de cada categoria também levam troféu, e toda pessoa que correr recebe medalha.",
  /**
   * Aviso de que não há kit. É a pergunta mais provável de quem já correu
   * outras provas, então aparece na home e no email de confirmação.
   */
  kitText:
    "Esta corrida não terá kit de participação. O que será distribuído é: número de peito para todos os inscritos, medalha para todos que correrem, e troféu mais premiação em dinheiro para os 3 primeiros de cada categoria.",
  /**
   * Resumo curto de uma linha, para o email de confirmação, onde não cabe a
   * lista inteira.
   */
  awardsText:
    "Premiação por categoria (masculina e feminina): R$ 200,00 para o 1º lugar, R$ 100,00 para o 2º e R$ 50,00 para o 3º, com troféu para os 3 primeiros de cada categoria. Todo participante recebe medalha.",
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
