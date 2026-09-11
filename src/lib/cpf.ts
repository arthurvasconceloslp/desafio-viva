export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * CPFs matematicamente válidos (passam no dígito verificador) mas que
 * circulam publicamente como "CPF de teste" em tutoriais e geradores online
 * — por isso são comumente digitados por quem quer só passar pelo formulário
 * sem usar um CPF de verdade. Lista best-effort, não exaustiva.
 */
const KNOWN_FAKE_CPFS = new Set([
  "11144477735",
  "12345678909",
  "52998224725",
  "16899535009",
]);

export function isValidCPF(rawCpf: string): boolean {
  const cpf = onlyDigits(rawCpf);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  if (KNOWN_FAKE_CPFS.has(cpf)) return false;

  const digit = (base: string) => {
    let sum = 0;
    let weight = base.length + 1;
    for (const char of base) {
      sum += Number(char) * weight;
      weight--;
    }
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  const base = cpf.slice(0, 9);
  const d1 = digit(base);
  const d2 = digit(base + d1);
  return cpf === base + String(d1) + String(d2);
}

export function formatCPF(rawCpf: string): string {
  const cpf = onlyDigits(rawCpf);
  if (cpf.length !== 11) return rawCpf;
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}
