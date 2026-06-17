// @ts-check

import { resultFailure } from "./errors.js";
import { createId, normalizeCase, normalizeText, nowIso, takeUniqueId, toRecord } from "./model-utils.js";

/** @typedef {import("./types.js").CatalogItem} CatalogItem */
/** @typedef {import("./types.js").Room} Room */
/** @typedef {import("./types.js").CatalogKind} CatalogKind */
/** @typedef {import("./types.js").SingularCatalogKind} SingularCatalogKind */
/** @typedef {import("./types.js").CatalogPayload} CatalogPayload */
/** @template T @typedef {import("./types.js").Result<T>} Result */

const CATALOG_NAME_MAX = 80;

/** @type {Record<CatalogKind, string>} */
const CATALOG_LABELS = {
  teachers: "o nome do professor",
  rooms: "a turma",
  devices: "o equipamento",
};

/** @type {Record<CatalogKind, SingularCatalogKind>} */
const SINGULAR_KINDS = {
  teachers: "teacher",
  rooms: "room",
  devices: "device",
};

/**
 * Cria um item de catálogo (professor, turma ou equipamento) já normalizado.
 * @param {unknown} name
 * @param {SingularCatalogKind} type
 * @param {{ studentCount?: number | null }} [extra]
 * @returns {CatalogItem & { studentCount?: number | null }}
 */
export function createCatalogItem(name, type, extra = {}) {
  const timestamp = nowIso();
  return {
    id: createId(type),
    name: normalizeText(name),
    createdAt: timestamp,
    updatedAt: timestamp,
    ...extra,
  };
}

/** @param {CatalogKind} kind @returns {SingularCatalogKind} */
export function singularKind(kind) {
  return SINGULAR_KINDS[kind];
}

/**
 * @param {unknown} name
 * @param {string} label
 * @returns {Result<string>}
 */
export function validateCatalogName(name, label) {
  const value = normalizeText(name);
  if (!value) {
    return resultFailure(`Informe ${label}.`);
  }
  if (value.length > CATALOG_NAME_MAX) {
    return resultFailure(`${label} deve ter no máximo ${CATALOG_NAME_MAX} caracteres.`);
  }
  return { ok: true, value };
}

/**
 * @param {unknown} value
 * @returns {Result<number | null>}
 */
export function validateRoomCount(value) {
  if (value === null || value === undefined || value === "") {
    return { ok: true, value: null };
  }
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < 1) {
    return resultFailure("A quantidade padrão de alunos deve ser maior que zero.");
  }
  return { ok: true, value: numberValue };
}

/**
 * Valida o payload de um catálogo e devolve nome + dados extras (alunos da turma).
 * @param {CatalogKind} kind
 * @param {CatalogPayload} payload
 * @returns {Result<{ name: string, extra: { studentCount?: number | null } }>}
 */
export function normalizeCatalogPayload(kind, payload) {
  const name = validateCatalogName(payload.name, CATALOG_LABELS[kind] ?? "o cadastro");
  if (!name.ok) return name;

  if (kind !== "rooms") {
    return { ok: true, value: { name: name.value, extra: {} } };
  }

  const count = validateRoomCount(payload.studentCount);
  if (!count.ok) return count;

  return { ok: true, value: { name: name.value, extra: { studentCount: count.value } } };
}

/**
 * Esqueleto de normalização de catálogos: descarta vazios, deduplica por nome
 * (case-insensitive) e garante IDs únicos. `extra` injeta campos específicos do
 * tipo (ex.: studentCount das turmas).
 * @param {unknown} items
 * @param {SingularCatalogKind} type
 * @param {(record: Record<string, unknown>) => Record<string, unknown>} extra
 * @returns {any[]}
 */
function normalizeNamedCollection(items, type, extra) {
  if (!Array.isArray(items)) return [];

  const seenNames = new Set();
  const seenIds = new Set();
  const timestamp = nowIso();

  return items.reduce((result, item) => {
    const record = toRecord(item);
    const name = normalizeText(typeof item === "string" ? item : record.name);
    const key = normalizeCase(name);
    if (!name || seenNames.has(key)) return result;
    seenNames.add(key);

    result.push({
      id: takeUniqueId(record.id, seenIds, type),
      name,
      ...extra(record),
      createdAt: normalizeText(record.createdAt) || timestamp,
      updatedAt: normalizeText(record.updatedAt) || timestamp,
    });
    return result;
  }, /** @type {any[]} */ ([]));
}

/**
 * Normaliza uma coleção de catálogo simples (professores/equipamentos).
 * @param {unknown} items
 * @param {SingularCatalogKind} type
 * @returns {CatalogItem[]}
 */
export function normalizeCatalogCollection(items, type) {
  return normalizeNamedCollection(items, type, () => ({}));
}

/**
 * Como normalizeCatalogCollection, mas para turmas (preserva studentCount).
 * @param {unknown} items
 * @returns {Room[]}
 */
export function normalizeRoomCollection(items) {
  return normalizeNamedCollection(items, "room", (record) => {
    const count = validateRoomCount(record.studentCount);
    return { studentCount: count.ok ? count.value : null };
  });
}
