// @ts-check

import { resultFailure } from "./errors.js";
import { MAINTENANCE_PRIORITIES, MAINTENANCE_STATUSES } from "./types.js";
import {
  checkMaxLen,
  createId,
  normalizeCase,
  normalizeText,
  nowIso,
  takeUniqueId,
  textMatch,
  toRecord,
} from "./model-utils.js";

/** @typedef {import("./types.js").MaintenanceRecord} MaintenanceRecord */
/** @typedef {import("./types.js").MaintenanceHistoryEntry} MaintenanceHistoryEntry */
/** @typedef {import("./types.js").MaintenancePayload} MaintenancePayload */
/** @typedef {import("./types.js").MaintenancePriority} MaintenancePriority */
/** @typedef {import("./types.js").MaintenanceStatus} MaintenanceStatus */
/** @template T @typedef {import("./types.js").Result<T>} Result */

const ID_MAX = 60;
const SHORT_MAX = 80;
const TICKET_MAX = 30;
const MEDIUM_MAX = 200;
const LONG_MAX = 500;

// Fonte única dos limites de tamanho por campo (chave → máximo → rótulo da
// mensagem). Usada na construção (campos opcionais) e na validação de importação.
/** @type {Array<[keyof MaintenancePayload & string, number, string]>} */
const FIELD_LIMITS = [
  ["equipmentId", ID_MAX, "Identificador"],
  ["type", SHORT_MAX, "Tipo"],
  ["brandModel", SHORT_MAX, "Modelo"],
  ["location", SHORT_MAX, "Local"],
  ["mainProblem", MEDIUM_MAX, "Problema principal"],
  ["technicalDescription", LONG_MAX, "Descrição técnica"],
  ["ticketNumber", TICKET_MAX, "Número do chamado"],
  ["responsibleContact", SHORT_MAX, "Responsável"],
  ["actionsTaken", LONG_MAX, "Ações realizadas"],
  ["notes", LONG_MAX, "Observações"],
];

// Campos cujo único requisito é o limite de tamanho (os demais têm regras próprias).
const OPTIONAL_FIELD_KEYS = new Set([
  "brandModel",
  "location",
  "technicalDescription",
  "ticketNumber",
  "responsibleContact",
  "actionsTaken",
  "notes",
]);

/** @param {unknown} value @returns {value is MaintenancePriority} */
export function isMaintenancePriority(value) {
  return MAINTENANCE_PRIORITIES.some((p) => p.value === value);
}

/** @param {unknown} value @returns {value is MaintenanceStatus} */
export function isMaintenanceStatus(value) {
  return MAINTENANCE_STATUSES.some((s) => s.value === value);
}

/** @param {unknown} value @returns {string} */
export function getMaintenancePriorityLabel(value) {
  return MAINTENANCE_PRIORITIES.find((p) => p.value === value)?.label ?? "";
}

/** @param {unknown} value @returns {string} */
export function getMaintenanceStatusLabel(value) {
  return MAINTENANCE_STATUSES.find((s) => s.value === value)?.label ?? "";
}

/** @param {unknown} value @returns {string} */
export function getMaintenanceStatusTone(value) {
  return MAINTENANCE_STATUSES.find((s) => s.value === value)?.tone ?? "neutral";
}

/**
 * Valida e constrói um registro de manutenção. O identificador é único entre os
 * registros existentes (case-insensitive).
 * @param {MaintenancePayload} payload
 * @param {MaintenanceRecord[]} existingRecords
 * @param {Pick<MaintenanceRecord, "id" | "createdAt" | "history"> | null} [existing]
 * @returns {Result<MaintenanceRecord>}
 */
export function buildMaintenanceRecord(payload, existingRecords, existing = null) {
  const errors = [];
  const fields = {
    equipmentId: normalizeText(payload.equipmentId),
    type: normalizeText(payload.type),
    brandModel: normalizeText(payload.brandModel),
    location: normalizeText(payload.location),
    mainProblem: normalizeText(payload.mainProblem),
    technicalDescription: normalizeText(payload.technicalDescription),
    priority: normalizeText(payload.priority),
    status: normalizeText(payload.status),
    ticketNumber: normalizeText(payload.ticketNumber),
    responsibleContact: normalizeText(payload.responsibleContact),
    actionsTaken: normalizeText(payload.actionsTaken),
    notes: normalizeText(payload.notes),
  };

  if (!fields.equipmentId) {
    errors.push("Informe o número/identificador do equipamento.");
  } else if (fields.equipmentId.length > ID_MAX) {
    errors.push(`O identificador deve ter no máximo ${ID_MAX} caracteres.`);
  }

  if (!fields.type) {
    errors.push("Informe o tipo do equipamento.");
  } else {
    const error = checkMaxLen(fields.type, SHORT_MAX, "Tipo");
    if (error) errors.push(error);
  }

  if (!fields.mainProblem) {
    errors.push("Descreva o problema principal.");
  } else {
    const error = checkMaxLen(fields.mainProblem, MEDIUM_MAX, "Problema principal");
    if (error) errors.push(error);
  }

  for (const [key, max, label] of FIELD_LIMITS) {
    if (!OPTIONAL_FIELD_KEYS.has(key)) continue;
    const error = checkMaxLen(fields[key], max, label);
    if (error) errors.push(error);
  }

  if (!isMaintenancePriority(fields.priority)) {
    errors.push("Escolha uma prioridade válida.");
  }
  if (!isMaintenanceStatus(fields.status)) {
    errors.push("Escolha um status válido.");
  }

  if (fields.equipmentId) {
    const key = normalizeCase(fields.equipmentId);
    const duplicated = existingRecords.some(
      (record) => record.id !== existing?.id && normalizeCase(record.equipmentId) === key,
    );
    if (duplicated) {
      errors.push("Já existe um registro com esse identificador.");
    }
  }

  if (errors.length > 0) {
    return resultFailure(errors);
  }

  const timestamp = nowIso();
  return {
    ok: true,
    value: {
      id: existing?.id ?? createId("maintenance"),
      ...fields,
      priority: /** @type {MaintenancePriority} */ (fields.priority),
      status: /** @type {MaintenanceStatus} */ (fields.status),
      history: existing?.history ? [...existing.history] : [],
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    },
  };
}

/**
 * Acrescenta uma entrada ao histórico do registro (imutável).
 * @param {MaintenanceRecord} record
 * @param {string} message
 * @returns {MaintenanceRecord}
 */
export function appendMaintenanceHistory(record, message) {
  const text = normalizeText(message);
  if (!text) return record;

  const entry = { id: createId("history"), at: nowIso(), message: text };
  return { ...record, history: [...record.history, entry] };
}

/**
 * Gera mensagens de histórico descrevendo mudanças de status, prioridade e chamado.
 * @param {MaintenanceRecord} previous
 * @param {MaintenanceRecord} next
 * @returns {string[]}
 */
export function describeMaintenanceChanges(previous, next) {
  const messages = [];

  if (previous.status !== next.status) {
    messages.push(
      `Status alterado de "${getMaintenanceStatusLabel(previous.status)}" para "${getMaintenanceStatusLabel(next.status)}".`,
    );
  }
  if (previous.priority !== next.priority) {
    messages.push(
      `Prioridade alterada de "${getMaintenancePriorityLabel(previous.priority)}" para "${getMaintenancePriorityLabel(next.priority)}".`,
    );
  }
  if (normalizeText(previous.ticketNumber) !== normalizeText(next.ticketNumber)) {
    const before = previous.ticketNumber || "sem chamado";
    const after = next.ticketNumber || "sem chamado";
    messages.push(`Chamado alterado de "${before}" para "${after}".`);
  }

  return messages;
}

/**
 * Filtra registros de manutenção por texto livre.
 * @param {MaintenanceRecord[]} records
 * @param {unknown} query
 * @returns {MaintenanceRecord[]}
 */
export function filterMaintenance(records, query) {
  const normalizedQuery = normalizeCase(query);
  if (!normalizedQuery) return records;

  return records.filter((record) =>
    textMatch(
      [
        record.equipmentId,
        record.type,
        record.brandModel,
        record.location,
        record.mainProblem,
        record.technicalDescription,
        getMaintenancePriorityLabel(record.priority),
        record.priority,
        getMaintenanceStatusLabel(record.status),
        record.status,
        record.ticketNumber,
        record.responsibleContact,
        record.actionsTaken,
        record.notes,
      ],
      normalizedQuery,
    ),
  );
}

/**
 * Normaliza uma coleção de manutenções: descarta sem identificador, deduplica
 * por equipmentId (case-insensitive) e preenche prioridade/status padrão.
 * @param {unknown} items
 * @returns {MaintenanceRecord[]}
 */
export function normalizeMaintenanceCollection(items) {
  if (!Array.isArray(items)) return [];

  const result = [];
  const timestamp = nowIso();
  const seenIds = new Set();
  const seenEquipmentIds = new Set();

  items.forEach((item) => {
    const record = toRecord(item);
    const equipmentId = normalizeText(record.equipmentId);
    if (!equipmentId) return;
    const equipmentKey = normalizeCase(equipmentId);
    if (seenEquipmentIds.has(equipmentKey)) return;
    seenEquipmentIds.add(equipmentKey);

    const id = takeUniqueId(record.id, seenIds, "maintenance");

    result.push({
      id,
      equipmentId,
      type: normalizeText(record.type),
      brandModel: normalizeText(record.brandModel),
      location: normalizeText(record.location),
      mainProblem: normalizeText(record.mainProblem),
      technicalDescription: normalizeText(record.technicalDescription),
      priority: isMaintenancePriority(record.priority) ? record.priority : "media",
      status: isMaintenanceStatus(record.status) ? record.status : "com-problema",
      ticketNumber: normalizeText(record.ticketNumber),
      responsibleContact: normalizeText(record.responsibleContact),
      actionsTaken: normalizeText(record.actionsTaken),
      notes: normalizeText(record.notes),
      history: normalizeMaintenanceHistory(record.history),
      createdAt: normalizeText(record.createdAt) || timestamp,
      updatedAt: normalizeText(record.updatedAt) || timestamp,
    });
  });

  return result;
}

/**
 * @param {unknown} value
 * @returns {MaintenanceHistoryEntry[]}
 */
function normalizeMaintenanceHistory(value) {
  if (!Array.isArray(value)) return [];
  const result = [];
  value.forEach((item) => {
    const record = toRecord(item);
    const message = normalizeText(record.message);
    if (!message) return;
    result.push({
      id: normalizeText(record.id) || createId("history"),
      at: normalizeText(record.at) || nowIso(),
      message,
    });
  });
  return result;
}

/**
 * Verifica limites de tamanho de campos em registros importados.
 * @param {MaintenanceRecord[]} records
 * @returns {string[]}
 */
export function validateImportedMaintenanceLimits(records) {
  const errors = [];
  for (const record of records) {
    for (const [key, max, label] of FIELD_LIMITS) {
      const error = checkMaxLen(record[key], max, label);
      if (error) {
        errors.push(error);
        break;
      }
    }
  }
  return errors;
}
