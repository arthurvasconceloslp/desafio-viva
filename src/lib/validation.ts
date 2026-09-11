import { z } from "zod";
import { isValidCPF, onlyDigits } from "./cpf";

export const SEXO_OPTIONS = [
  { value: "feminino", label: "Feminino" },
  { value: "masculino", label: "Masculino" },
  { value: "outro", label: "Outro / Prefiro não informar" },
] as const;

const sexoValues = SEXO_OPTIONS.map((option) => option.value) as [
  string,
  ...string[],
];

export const inscricaoSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(3, "Informe o nome completo.")
    .max(120, "Nome muito longo."),
  cpf: z
    .string()
    .trim()
    .transform(onlyDigits)
    .refine((value) => isValidCPF(value), "CPF inválido."),
  dataNascimento: z
    .string()
    .trim()
    .refine((value) => !Number.isNaN(Date.parse(value)), "Data de nascimento inválida.")
    .refine((value) => new Date(value) <= new Date(), "Data de nascimento não pode ser no futuro."),
  sexo: z.enum(sexoValues, { message: "Selecione uma opção." }),
  email: z.string().trim().min(1, "Informe o email.").email("Email inválido."),
  telefone: z
    .string()
    .trim()
    .transform(onlyDigits)
    .refine((value) => value.length >= 10 && value.length <= 11, "Telefone inválido."),
});

export type InscricaoInput = z.infer<typeof inscricaoSchema>;
