import { z } from "zod";

/**
 * Schema Zod que valida e normaliza os dados de um utilizador.
 * Usado para garantir consistência dos dados vindos da API / storage.
 */
export const UserSchema = z.object({
  /** Identificador único do utilizador (record ID, UUID, etc.) */
  id: z.string(),

  /** Nome do utilizador */
  nome: z.string().default("Sem Nome"),

  /** Função/cargo do utilizador */
  funcao: z.string().default("Sem Função"),

  /** Departamento ao qual o utilizador pertence */
  department: z.string().default("Sem Departamento"),

  /**
   * Identificador IST do utilizador.
   * Pode vir como string ou número e é convertido para number.
   */
  istId: z.number().or(z.string()).transform(Number),
});

/**
 * Tipo TypeScript inferido a partir do UserSchema.
 * Representa um utilizador já validado.
 */
export type User = z.infer<typeof UserSchema>;

/**
 * Schema Zod que representa um evento ativo no sistema.
 * Contém participantes, turnos associados e intervalo temporal.
 */
export const EventoSchema = z.object({
  /** Identificador único do evento */
  id: z.string(),

  /** Nome do evento */
  nome: z.string().default("Sem Nome"),

  /** Lista de IDs dos participantes associados ao evento */
  participantes: z.array(z.string()).default([]),

  /** Data e hora de início do evento (ISO 8601) */
  dataInicio: z.string().default("Sem Data"),

  /** Data e hora de fim do evento (ISO 8601) */
  dataFim: z.string().default("Sem Data"),

  /** Lista de IDs dos turnos ativos associados ao evento */
  turnos: z.array(z.string()).default([]),
});

/**
 * Representa um evento ativo já validado.
 */
export type Evento = z.infer<typeof EventoSchema>;

/**
 * Tipo utilizado para criar um novo evento.
 * Não inclui ID nem relações, apenas os dados mínimos necessários.
 */
export type EventoPorCriar = {
  /** Nome do evento a criar */
  nome: string;

  /** Data e hora de início do evento (ISO 8601) */
  dataInicio: string;

  /** Data e hora de fim do evento (ISO 8601) */
  dataFim: string;
};

/**
 * Schema Zod que representa um turno ativo.
 * Um turno está associado a um evento e a vários participantes.
 */
export const TurnoSchema = z.object({
  /** Identificador único do turno ativo */
  id: z.string(),

  /** Nome do turno */
  nome: z.string().default("Sem Nome"),

  /** Identificador lógico do turno (ex: número ou código) */
  idTurno: z.string().default("Sem ID Turno"),

  /** Lista de IDs dos participantes do turno */
  participantes: z.array(z.string()).default([]),

  /** ID do evento associado ao turno */
  evento: z.string().default("Sem Evento"),

  /** Data e hora de início do turno (ISO 8601) */
  dataInicio: z.string().default("Sem Data"),

  /** Data e hora de fim do turno (ISO 8601) */
  dataFim: z.string().default("Sem Data"),
});

/**
 * Representa um turno ativo já validado.
 */
export type Turno = z.infer<typeof TurnoSchema>;
