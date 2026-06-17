// @ts-check

import {
  DEFAULT_DEVICE_NAMES,
  DEFAULT_NOTIFICATION_SETTINGS,
  NOTIFICATION_SOUNDS,
  NOTIFICATION_STATUSES,
  NOTIFICATION_TYPES,
  SCHEMA_VERSION,
  SORT_OPTIONS,
} from "./types.js";
import {
  MAX_NOTIFICATION_LOG,
  NOTIF_GROUP_MAX,
  NOTIF_GROUP_MIN,
  NOTIF_LEAD_MAX,
  NOTIF_LEAD_MIN,
  NOTIF_SNOOZE_MAX,
  NOTIF_SNOOZE_MIN,
} from "./limits.js";
import { createId, isValidTime, normalizeText, nowIso, readObjectField, toRecord } from "./model-utils.js";
import { createCatalogItem, normalizeCatalogCollection, normalizeRoomCollection } from "./model-catalog.js";
import { buildRoutine, normalizeRoutineNotification } from "./model-routine.js";
import { normalizeMaintenanceCollection, validateImportedMaintenanceLimits } from "./model-maintenance.js";
import { parseStateCandidate } from "./validate.js";

/** @typedef {import("./types.js").AppState} AppState */
/** @typedef {import("./types.js").Settings} Settings */
/** @typedef {import("./types.js").NotificationSettings} NotificationSettings */
/** @typedef {import("./types.js").NotificationLogEntry} NotificationLogEntry */
/** @typedef {import("./types.js").SortOption} SortOption */
/** @typedef {import("./types.js").NotificationSoundId} NotificationSoundId */

const CATALOG_NAME_MAX = 80;

/** @returns {AppState} */
export function createEmptyState() {
  const timestamp = nowIso();
  return {
    schemaVersion: SCHEMA_VERSION,
    routines: [],
    teachers: [],
    rooms: [],
    devices: DEFAULT_DEVICE_NAMES.map((name) => createCatalogItem(name, "device")),
    maintenanceRecords: [],
    notificationLog: [],
    settings: {
      sortBy: "weekday-time",
      filterText: "",
      notifications: { ...DEFAULT_NOTIFICATION_SETTINGS },
    },
    meta: { createdAt: timestamp, updatedAt: timestamp },
  };
}

/**
 * Normaliza qualquer estado salvo (qualquer versão de schema) para a versão atual.
 * Lança um erro legível se o estado for estruturalmente inválido ou tiver
 * rotinas que não podem ser reconstruídas.
 * @param {unknown} candidate
 * @returns {AppState}
 */
export function normalizeState(candidate) {
  const raw = parseStateCandidate(candidate);
  const base = createEmptyState();

  /** @type {AppState} */
  const state = {
    ...base,
    schemaVersion: SCHEMA_VERSION,
    routines: [],
    teachers: normalizeCatalogCollection(raw.teachers, "teacher"),
    rooms: normalizeRoomCollection(raw.rooms),
    devices: normalizeCatalogCollection(raw.devices, "device"),
    maintenanceRecords: normalizeMaintenanceCollection(raw.maintenanceRecords),
    notificationLog: normalizeNotificationLog(raw.notificationLog),
    settings: normalizeSettings(raw.settings, base.settings),
    meta: {
      createdAt: normalizeText(readObjectField(raw.meta, "createdAt")) || base.meta.createdAt,
      updatedAt: nowIso(),
    },
  };

  if (state.devices.length === 0) {
    state.devices = base.devices;
  }

  const routineErrors = [];
  const routineIds = new Set();
  if (Array.isArray(raw.routines)) {
    raw.routines.forEach((routine, index) => {
      const record = toRecord(routine);
      const normalized = buildRoutine(/** @type {any} */ (record), {
        id: normalizeText(record.id) || createId("routine"),
        createdAt: normalizeText(record.createdAt) || nowIso(),
      });

      if (!normalized.ok) {
        routineErrors.push(`Rotina ${index + 1}: ${normalized.errors.join(" ")}`);
        return;
      }

      let routineId = normalizeText(record.id) || normalized.value.id;
      if (routineIds.has(routineId)) {
        routineId = createId("routine");
      }
      routineIds.add(routineId);

      const restoredNotification = normalizeRoutineNotification(record.notification);

      state.routines.push({
        ...normalized.value,
        id: routineId,
        ...(restoredNotification ? { notification: restoredNotification } : {}),
        createdAt: normalizeText(record.createdAt) || normalized.value.createdAt,
        updatedAt: normalizeText(record.updatedAt) || normalized.value.updatedAt,
      });
    });
  }

  if (routineErrors.length > 0) {
    throw new Error(routineErrors.join("\n"));
  }

  return state;
}

/** @param {unknown} raw @returns {AppState} */
export function migrateState(raw) {
  return normalizeState(raw);
}

/**
 * @param {unknown} settings
 * @param {Settings} defaults
 * @returns {Settings}
 */
function normalizeSettings(settings, defaults) {
  const record = toRecord(settings);
  const sortBy = SORT_OPTIONS.some((option) => option.value === record.sortBy)
    ? /** @type {SortOption} */ (record.sortBy)
    : defaults.sortBy;

  return {
    sortBy,
    filterText: normalizeText(record.filterText),
    notifications: normalizeNotificationSettings(record.notifications, defaults.notifications),
  };
}

/**
 * @param {unknown} candidate
 * @param {NotificationSettings} [defaults]
 * @returns {NotificationSettings}
 */
export function normalizeNotificationSettings(candidate, defaults = DEFAULT_NOTIFICATION_SETTINGS) {
  const record = toRecord(candidate);
  const soundName = NOTIFICATION_SOUNDS.some((option) => option.value === record.soundName)
    ? /** @type {NotificationSoundId} */ (record.soundName)
    : defaults.soundName;

  return {
    enabled: typeof record.enabled === "boolean" ? record.enabled : defaults.enabled,
    defaultLeadMinutes: clampMinutes(record.defaultLeadMinutes, defaults.defaultLeadMinutes, NOTIF_LEAD_MIN, NOTIF_LEAD_MAX),
    soundEnabled: typeof record.soundEnabled === "boolean" ? record.soundEnabled : defaults.soundEnabled,
    soundName,
    groupingEnabled: typeof record.groupingEnabled === "boolean" ? record.groupingEnabled : defaults.groupingEnabled,
    groupingWindowMinutes: clampMinutes(record.groupingWindowMinutes, defaults.groupingWindowMinutes, NOTIF_GROUP_MIN, NOTIF_GROUP_MAX),
    allowSnooze: typeof record.allowSnooze === "boolean" ? record.allowSnooze : defaults.allowSnooze,
    defaultSnoozeMinutes: clampMinutes(record.defaultSnoozeMinutes, defaults.defaultSnoozeMinutes, NOTIF_SNOOZE_MIN, NOTIF_SNOOZE_MAX),
  };
}

/**
 * Arredonda o valor e mantém-no dentro de [min, max]; usa o fallback se inválido.
 * @param {unknown} value
 * @param {number} fallback
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clampMinutes(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  const rounded = Math.round(number);
  return rounded < min || rounded > max ? fallback : rounded;
}

/**
 * Mantém apenas as entradas de log mais recentes quando excede o limite.
 * @param {NotificationLogEntry[]} log
 * @returns {NotificationLogEntry[]}
 */
export function pruneNotificationLog(log) {
  if (log.length <= MAX_NOTIFICATION_LOG) return log;
  return [...log]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_NOTIFICATION_LOG);
}

/**
 * @param {unknown} value
 * @returns {NotificationLogEntry[]}
 */
function normalizeNotificationLog(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];
  const validStatuses = new Set(NOTIFICATION_STATUSES);
  const validTypes = new Set(NOTIFICATION_TYPES);

  value.forEach((item) => {
    const record = toRecord(item);
    const id = normalizeText(record.id);
    if (!id || seen.has(id)) return;
    if (!validStatuses.has(/** @type {any} */ (record.status))) return;
    if (!validTypes.has(/** @type {any} */ (record.type))) return;
    const date = normalizeText(record.date);
    const time = normalizeText(record.time);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    if (!isValidTime(time)) return;
    const routineIds = Array.isArray(record.routineIds)
      ? record.routineIds.map(normalizeText).filter(Boolean)
      : [];
    if (routineIds.length === 0) return;

    seen.add(id);
    /** @type {NotificationLogEntry} */
    const entry = {
      id,
      status: /** @type {any} */ (record.status),
      date,
      type: /** @type {any} */ (record.type),
      time,
      routineIds,
      updatedAt: normalizeText(record.updatedAt) || nowIso(),
    };
    const snoozedUntil = normalizeText(record.snoozedUntil);
    if (snoozedUntil) entry.snoozedUntil = snoozedUntil;
    result.push(entry);
  });
  return result;
}

/**
 * Verifica limites de tamanho dos nomes de catálogos e dos campos de manutenção
 * em um estado importado.
 * @param {AppState} state
 * @returns {string[]}
 */
export function validateImportedStateLimits(state) {
  const errors = [];
  for (const teacher of state.teachers) {
    if (teacher.name.length > CATALOG_NAME_MAX) {
      errors.push(`Professor "${teacher.name.slice(0, 20)}" excede ${CATALOG_NAME_MAX} caracteres.`);
    }
  }
  for (const room of state.rooms) {
    if (room.name.length > CATALOG_NAME_MAX) {
      errors.push(`Turma "${room.name.slice(0, 20)}" excede ${CATALOG_NAME_MAX} caracteres.`);
    }
  }
  for (const device of state.devices) {
    if (device.name.length > CATALOG_NAME_MAX) {
      errors.push(`Equipamento "${device.name.slice(0, 20)}" excede ${CATALOG_NAME_MAX} caracteres.`);
    }
  }
  errors.push(...validateImportedMaintenanceLimits(state.maintenanceRecords));
  return errors;
}
