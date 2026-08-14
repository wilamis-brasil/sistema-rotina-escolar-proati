// @ts-check

import { failure } from "../domain/errors.js";
import {
  MAX_DEVICES,
  MAX_CLASSES,
  MAX_MAINTENANCES,
  MAX_NOTIFICATION_LOG,
  MAX_ROUTINES,
  MAX_TEACHERS,
} from "../domain/limits.js";
import {
  appendMaintenanceHistory,
  buildMaintenanceRecord,
  buildRoutine,
  createCatalogItem,
  createEmptyState,
  describeMaintenanceChanges,
  getMaintenanceStatusLabel,
  normalizeCatalogPayload,
  normalizeCase,
  normalizeNotificationSettings,
  normalizeText,
  nowIso,
  pruneNotificationLog,
  singularKind,
} from "../domain/model.js";
import {
  clearStoredState,
  exportState,
  importMaintenanceFromText,
  importStateFromText,
  saveState,
} from "../persistence/store.js";

/** @typedef {import("../domain/types.js").AppState} AppState */
/** @typedef {import("../domain/types.js").CatalogKind} CatalogKind */
/** @typedef {import("../domain/types.js").CatalogPayload} CatalogPayload */
/** @typedef {import("../domain/types.js").EmptyResult} EmptyResult */
/** @typedef {import("../domain/types.js").MaintenancePayload} MaintenancePayload */
/** @typedef {import("../domain/types.js").NotificationLogEntry} NotificationLogEntry */
/** @typedef {import("../domain/types.js").NotificationSettings} NotificationSettings */
/** @typedef {import("../domain/types.js").Routine} Routine */
/** @typedef {import("../domain/types.js").RoutinePayload} RoutinePayload */
/** @typedef {import("../domain/types.js").SortOption} SortOption */
/** @typedef {import("../domain/types.js").StorageAdapter} StorageAdapter */

/** Limites de catálogo por tipo. @type {Record<CatalogKind, number>} */
const CATALOG_LIMITS = { teachers: MAX_TEACHERS, rooms: MAX_CLASSES, devices: MAX_DEVICES };

/**
 * Cria o controller da aplicação: ponto único de acesso às ações, mantendo o
 * estado em memória e persistindo após cada mudança.
 * @param {{ initialState: AppState, storage?: StorageAdapter, onStateChange?: () => void }} options
 */
export function createAppController({ initialState, storage, onStateChange }) {
  let state = initialState;
  /** @type {Routine | null} */
  let lastDeletedRoutine = null;

  const actions = {
    /** @param {RoutinePayload} payload */
    addRoutine(payload) {
      if (state.routines.length >= MAX_ROUTINES) {
        return failure(`Limite de ${MAX_ROUTINES} rotinas atingido. Exclua rotinas antigas antes de adicionar novas.`);
      }
      const result = buildRoutine(payload);
      if (!result.ok) return result;

      const saveError = routineSaveError(result.value);
      if (saveError) return saveError;

      state.routines.push(result.value);
      ensureCatalogsFromRoutine(result.value);
      return persist();
    },

    /** @param {string} id @param {RoutinePayload} payload */
    updateRoutine(id, payload) {
      const index = state.routines.findIndex((routine) => routine.id === id);
      if (index === -1) return failure("Rotina não encontrada. Atualize a página e tente novamente.");

      const result = buildRoutine(payload, state.routines[index]);
      if (!result.ok) return result;

      const saveError = routineSaveError(result.value);
      if (saveError) return saveError;

      state.routines[index] = result.value;
      ensureCatalogsFromRoutine(result.value);
      return persist();
    },

    /** @param {string} id */
    deleteRoutine(id) {
      const index = state.routines.findIndex((routine) => routine.id === id);
      if (index === -1) return failure("Rotina não encontrada. Atualize a página e tente novamente.");

      lastDeletedRoutine = state.routines[index] ?? null;
      state.routines.splice(index, 1);
      return persist();
    },

    /** @param {string} id */
    duplicateRoutine(id) {
      if (state.routines.length >= MAX_ROUTINES) {
        return failure(`Limite de ${MAX_ROUTINES} rotinas atingido. Exclua rotinas antigas antes de duplicar.`);
      }
      const routine = state.routines.find((item) => item.id === id);
      if (!routine) return failure("Rotina não encontrada. Atualize a página e tente novamente.");

      const result = buildRoutine({ ...routine, id: undefined });
      if (!result.ok) return result;

      const capacityError = checkCatalogCapacity(result.value);
      if (capacityError) return failure(capacityError);

      state.routines.push(result.value);
      return persist();
    },

    canUndoDeleteRoutine() {
      return Boolean(lastDeletedRoutine);
    },

    undoDeleteRoutine() {
      if (!lastDeletedRoutine) return failure("Nenhuma exclusão recente para desfazer.");
      if (state.routines.length >= MAX_ROUTINES) {
        return failure(`Limite de ${MAX_ROUTINES} rotinas atingido. Exclua rotinas antigas para restaurar a anterior.`);
      }
      state.routines.push({ ...lastDeletedRoutine, updatedAt: nowIso() });
      lastDeletedRoutine = null;
      return persist();
    },

    /** @param {CatalogKind} kind @param {CatalogPayload} payload */
    addCatalogItem(kind, payload) {
      const limit = CATALOG_LIMITS[kind];
      if (limit !== undefined && state[kind].length >= limit) {
        return failure(`Limite de ${limit} cadastros atingido neste catálogo. Remova itens não utilizados para liberar espaço.`);
      }
      const normalized = normalizeCatalogPayload(kind, payload);
      if (!normalized.ok) return normalized;

      if (catalogHasName(kind, normalized.value.name)) {
        return failure("Já existe um cadastro com esse nome neste catálogo.");
      }

      const item = createCatalogItem(normalized.value.name, singularKind(kind), normalized.value.extra);
      state[kind].push(/** @type {any} */ (item));
      return persist();
    },

    /** @param {CatalogKind} kind @param {string} id @param {CatalogPayload} payload */
    updateCatalogItem(kind, id, payload) {
      const collection = state[kind];
      const index = collection.findIndex((item) => item.id === id);
      if (index === -1) return failure("Cadastro não encontrado. Atualize a página e tente novamente.");

      const normalized = normalizeCatalogPayload(kind, payload);
      if (!normalized.ok) return normalized;

      const duplicate = collection.some(
        (item) => item.id !== id && normalizeCase(item.name) === normalizeCase(normalized.value.name),
      );
      if (duplicate) return failure("Já existe um cadastro com esse nome neste catálogo.");

      const previousName = collection[index].name;
      collection[index] = /** @type {any} */ ({
        ...collection[index],
        name: normalized.value.name,
        updatedAt: nowIso(),
        ...normalized.value.extra,
      });
      updateRoutineSnapshots(kind, previousName, normalized.value.name);

      return persist();
    },

    /** @param {CatalogKind} kind @param {string} id */
    deleteCatalogItem(kind, id) {
      const collection = state[kind];
      const index = collection.findIndex((item) => item.id === id);
      if (index === -1) return failure("Cadastro não encontrado. Atualize a página e tente novamente.");

      collection.splice(index, 1);
      return persist();
    },

    /** @param {{ filterText?: unknown, sortBy?: SortOption }} payload */
    updateUiFilters(payload) {
      state.settings = {
        ...state.settings,
        filterText: normalizeText(payload.filterText ?? state.settings.filterText),
        sortBy: payload.sortBy ?? state.settings.sortBy,
      };
      return persist();
    },

    exportData() {
      return exportState(state);
    },

    /** @param {string} rawText */
    validateImportData(rawText) {
      const result = importStateFromText(rawText);
      return result.ok ? { ok: true } : result;
    },

    /** @param {string} rawText */
    importData(rawText) {
      const result = importStateFromText(rawText);
      if (!result.ok) return result;

      state = result.value;
      lastDeletedRoutine = null;
      return persist();
    },

    resetData() {
      clearStoredState(storage);
      state = createEmptyState();
      lastDeletedRoutine = null;
      return persist();
    },

    /** @param {MaintenancePayload} payload */
    addMaintenanceRecord(payload) {
      if (state.maintenanceRecords.length >= MAX_MAINTENANCES) {
        return failure(`Limite de ${MAX_MAINTENANCES} manutenções atingido. Conclua ou remova registros antigos antes de cadastrar novos.`);
      }
      const result = buildMaintenanceRecord(payload, state.maintenanceRecords);
      if (!result.ok) return result;

      const created = appendMaintenanceHistory(
        result.value,
        `Manutenção cadastrada com status "${getMaintenanceStatusLabel(result.value.status)}".`,
      );
      state.maintenanceRecords.push(created);
      return persist();
    },

    /** @param {string} id @param {MaintenancePayload} payload */
    updateMaintenanceRecord(id, payload) {
      const index = state.maintenanceRecords.findIndex((record) => record.id === id);
      if (index === -1) return failure("Manutenção não encontrada. Atualize a página e tente novamente.");

      const previous = state.maintenanceRecords[index];
      const result = buildMaintenanceRecord(payload, state.maintenanceRecords, previous);
      if (!result.ok) return result;

      let updated = result.value;
      describeMaintenanceChanges(previous, updated).forEach((message) => {
        updated = appendMaintenanceHistory(updated, message);
      });

      state.maintenanceRecords[index] = updated;
      return persist();
    },

    /** @param {string} id */
    deleteMaintenanceRecord(id) {
      const index = state.maintenanceRecords.findIndex((record) => record.id === id);
      if (index === -1) return failure("Manutenção não encontrada. Atualize a página e tente novamente.");
      state.maintenanceRecords.splice(index, 1);
      return persist();
    },

    exportMaintenanceData() {
      return JSON.stringify(
        { schemaVersion: state.schemaVersion, maintenanceRecords: state.maintenanceRecords, exportedAt: nowIso() },
        null,
        2,
      );
    },

    /** @param {string} rawText */
    importMaintenanceData(rawText) {
      const result = importMaintenanceFromText(rawText);
      if (!result.ok) return result;

      state.maintenanceRecords = result.value;
      return persist();
    },

    /** @param {Partial<NotificationSettings>} patch */
    updateNotificationSettings(patch) {
      const merged = normalizeNotificationSettings({ ...state.settings.notifications, ...patch });
      state.settings = { ...state.settings, notifications: merged };
      return persist();
    },

    /**
     * @param {{ id: string, status: import("../domain/types.js").NotificationStatus, date: string, type: import("../domain/types.js").NotificationType, time: string, routineIds: string[], snoozedUntil?: string }} input
     */
    recordNotificationStatus(input) {
      if (!input?.id) return failure("Identificador do aviso ausente. Atualize a página e tente novamente.");
      const log = state.notificationLog ?? [];
      const index = log.findIndex((entry) => entry.id === input.id);
      /** @type {NotificationLogEntry} */
      const entry = {
        id: input.id,
        status: input.status,
        date: input.date,
        type: input.type,
        time: input.time,
        routineIds: input.routineIds,
        updatedAt: nowIso(),
        ...(input.snoozedUntil ? { snoozedUntil: input.snoozedUntil } : {}),
      };
      if (index === -1) {
        log.push(entry);
        state.notificationLog = log.length > MAX_NOTIFICATION_LOG ? pruneNotificationLog(log) : log;
      } else {
        log[index] = entry;
        state.notificationLog = log;
      }
      return persist();
    },

    /** @param {Array<{ id: string, date: string, type: import("../domain/types.js").NotificationType, time: string, routineIds: string[] }>} entries */
    markAllNotificationsAsSeen(entries) {
      if (!Array.isArray(entries) || entries.length === 0) return { ok: true };
      const log = state.notificationLog ?? [];
      const timestamp = nowIso();
      entries.forEach((entry) => {
        if (!entry?.id) return;
        const found = log.find((logEntry) => logEntry.id === entry.id);
        if (found) {
          found.status = "vista";
          found.updatedAt = timestamp;
          delete found.snoozedUntil;
          return;
        }
        log.push({
          id: entry.id,
          status: "vista",
          date: entry.date,
          type: entry.type,
          time: entry.time,
          routineIds: entry.routineIds,
          updatedAt: timestamp,
        });
      });
      state.notificationLog = log.length > MAX_NOTIFICATION_LOG ? pruneNotificationLog(log) : log;
      return persist();
    },
  };

  /** @returns {AppState} */
  function getState() {
    return state;
  }

  /** @returns {EmptyResult} */
  function persist() {
    const result = saveState(state, storage);
    if (!result.ok) return result;
    if (result.state) state = result.state;
    onStateChange?.();
    return { ok: true };
  }

  /** @param {Routine} routine */
  function ensureCatalogsFromRoutine(routine) {
    ensureCatalogItem("teachers", { name: routine.teacher });
    routine.devices.forEach((device) => ensureCatalogItem("devices", { name: device }));
  }

  /** @param {CatalogKind} kind @param {CatalogPayload} payload */
  function ensureCatalogItem(kind, payload) {
    if (catalogHasName(kind, payload.name)) return;
    const limit = CATALOG_LIMITS[kind];
    if (limit !== undefined && state[kind].length >= limit) return;
    const normalized = normalizeCatalogPayload(kind, payload);
    if (!normalized.ok) return;
    const item = createCatalogItem(normalized.value.name, singularKind(kind), normalized.value.extra);
    state[kind].push(/** @type {any} */ (item));
  }

  /** @param {Routine} routine @returns {string | null} */
  function checkCatalogCapacity(routine) {
    if (!catalogHasName("teachers", routine.teacher) && state.teachers.length >= MAX_TEACHERS) {
      return `Limite de ${MAX_TEACHERS} professores cadastrados atingido. Remova nomes em desuso antes de salvar.`;
    }
    for (const device of routine.devices) {
      if (!catalogHasName("devices", device) && state.devices.length >= MAX_DEVICES) {
        return `Limite de ${MAX_DEVICES} equipamentos cadastrados atingido. Remova itens em desuso antes de salvar.`;
      }
    }
    return null;
  }

  /**
   * Validações comuns ao salvar uma rotina (criar/atualizar): a turma precisa
   * estar cadastrada e os catálogos não podem estourar a capacidade.
   * @param {Routine} routine
   * @returns {EmptyResult | null}
   */
  function routineSaveError(routine) {
    if (!catalogHasName("rooms", routine.room)) {
      return failure("Cadastre a turma em “Turmas” antes de usá-la em uma rotina.");
    }
    const capacityError = checkCatalogCapacity(routine);
    return capacityError ? failure(capacityError) : null;
  }

  /** @param {CatalogKind} kind @param {unknown} name @returns {boolean} */
  function catalogHasName(kind, name) {
    const key = normalizeCase(name);
    return state[kind].some((item) => normalizeCase(item.name) === key);
  }

  /**
   * Propaga a renomeação de um item de catálogo para as rotinas vinculadas.
   * @param {CatalogKind} kind
   * @param {string} previousName
   * @param {string} nextName
   */
  function updateRoutineSnapshots(kind, previousName, nextName) {
    state.routines = state.routines.map((routine) => {
      if (kind === "teachers" && routine.teacher === previousName) {
        return { ...routine, teacher: nextName, updatedAt: nowIso() };
      }
      if (kind === "rooms" && routine.room === previousName) {
        return { ...routine, room: nextName, updatedAt: nowIso() };
      }
      if (kind === "devices" && routine.devices.includes(previousName)) {
        return {
          ...routine,
          devices: routine.devices.map((device) => (device === previousName ? nextName : device)),
          updatedAt: nowIso(),
        };
      }
      return routine;
    });
  }

  return { getState, actions };
}
