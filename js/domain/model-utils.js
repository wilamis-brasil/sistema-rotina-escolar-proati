// @ts-check

import { WEEKDAYS } from "./types.js";

/** @typedef {import("./types.js").WeekdayId} WeekdayId */

/** @returns {string} ISO 8601 do instante atual. */
export function nowIso() {
  return new Date().toISOString();
}

/**
 * Identificador único com prefixo de domínio (routine, teacher, maintenance…).
 * @param {string} prefix
 * @returns {string}
 */
export function createId(prefix) {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Texto enxuto: colapsa espaços e remove bordas.
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Chave de comparação insensível a maiúsculas (pt-BR).
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeCase(value) {
  return normalizeText(value).toLocaleLowerCase("pt-BR");
}

/**
 * Lista de nomes normalizados, sem vazios nem duplicados (case-insensitive).
 * @param {unknown} values
 * @returns {string[]}
 */
export function uniqueNames(values) {
  const seen = new Set();
  const result = [];
  const list = Array.isArray(values) ? values : [];

  list.forEach((value) => {
    const name = normalizeText(value);
    const key = normalizeCase(name);
    if (!name || seen.has(key)) return;
    seen.add(key);
    result.push(name);
  });

  return result;
}

/**
 * @param {unknown} value
 * @returns {boolean} true quando o texto está no formato HH:MM (00:00–23:59).
 */
export function isValidTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value ?? ""));
}

/**
 * Converte HH:MM em minutos desde a meia-noite, ou null se inválido.
 * @param {unknown} value
 * @returns {number | null}
 */
export function timeToMinutes(value) {
  if (!isValidTime(value)) return null;
  const [hours = 0, minutes = 0] = String(value).split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * @param {unknown} weekdayId
 * @returns {number} posição do dia em WEEKDAYS, ou -1.
 */
export function weekdayIndex(weekdayId) {
  return WEEKDAYS.findIndex((day) => day.id === weekdayId);
}

/**
 * @param {unknown} value
 * @returns {value is WeekdayId}
 */
export function isWeekdayId(value) {
  return weekdayIndex(value) !== -1;
}

/**
 * @param {unknown} weekdayId
 * @returns {string}
 */
export function getWeekdayLabel(weekdayId) {
  return WEEKDAYS.find((day) => day.id === weekdayId)?.label ?? "Dia não definido";
}

/**
 * Dia útil correspondente à data (segunda–sexta), ou null no fim de semana.
 * @param {Date} [date]
 * @returns {WeekdayId | null}
 */
export function getTodayWeekdayId(date = new Date()) {
  return /** @type {WeekdayId | null} */ (
    WEEKDAYS.find((day) => day.jsDay === date.getDay())?.id ?? null
  );
}

/**
 * Data e hora curtas no formato pt-BR, ou "" se inválida.
 * @param {unknown} value
 * @returns {string}
 */
export function formatDateTime(value) {
  const date = new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

/**
 * @param {string} value
 * @param {number} max
 * @param {string} label
 * @returns {string | null} mensagem de erro se exceder o limite, senão null.
 */
export function checkMaxLen(value, max, label) {
  return value.length > max ? `${label} deve ter no máximo ${max} caracteres.` : null;
}

/**
 * Busca textual livre: junta os campos, normaliza para pt-BR minúsculo e testa
 * se contêm a consulta já normalizada. Compartilhado pelos filtros de domínio.
 * @param {Array<unknown>} fields
 * @param {string} normalizedQuery
 * @returns {boolean}
 */
export function textMatch(fields, normalizedQuery) {
  return fields.join(" ").toLocaleLowerCase("pt-BR").includes(normalizedQuery);
}

/**
 * Resolve um ID único para uma coleção em normalização: reaproveita o ID do
 * registro quando válido e ainda não visto, senão gera um novo com o prefixo.
 * Registra o resultado em `seen` e o devolve.
 * @param {unknown} rawId
 * @param {Set<string>} seen
 * @param {string} prefix
 * @returns {string}
 */
export function takeUniqueId(rawId, seen, prefix) {
  let id = normalizeText(rawId) || createId(prefix);
  if (seen.has(id)) id = createId(prefix);
  seen.add(id);
  return id;
}

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
export function toRecord(value) {
  return value && typeof value === "object" ? /** @type {Record<string, unknown>} */ (value) : {};
}

/**
 * @param {unknown} value
 * @param {string} key
 * @returns {unknown}
 */
export function readObjectField(value, key) {
  return toRecord(value)[key];
}
