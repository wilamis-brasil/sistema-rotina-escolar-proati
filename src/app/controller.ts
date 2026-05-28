import { failure } from "../domain/errors";
import {
  MAX_ROUTINES,
  MAX_TEACHERS,
  MAX_CLASSES,
  MAX_DEVICES,
  MAX_MAINTENANCES,
  MAX_NOTIFICATION_LOG,
} from "../domain/limits";
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
} from "../domain/model";
import {
  type AppState,
  type CatalogKind,
  type CatalogPayload,
  type EmptyResult,
  type MaintenancePayload,
  type NotificationLogEntry,
  type NotificationSettings,
  type NotificationStatus,
  type NotificationType,
  type Routine,
  type RoutinePayload,
  type SortOption,
  type StorageAdapter,
} from "../domain/types";
import {
  clearStoredState,
  exportState,
  importMaintenanceFromText,
  importStateFromText,
  saveState,
} from "../persistence/store";

interface AppController {
  getState(): AppState;
  actions: AppActions;
}

export interface AppActions {
  addRoutine(payload: RoutinePayload): EmptyResult;
  updateRoutine(id: string, payload: RoutinePayload): EmptyResult;
  deleteRoutine(id: string): EmptyResult;
  duplicateRoutine(id: string): EmptyResult;
  canUndoDeleteRoutine(): boolean;
  undoDeleteRoutine(): EmptyResult;
  addCatalogItem(kind: CatalogKind, payload: CatalogPayload): EmptyResult;
  updateCatalogItem(kind: CatalogKind, id: string, payload: CatalogPayload): EmptyResult;
  deleteCatalogItem(kind: CatalogKind, id: string): EmptyResult;
  updateUiFilters(payload: { filterText?: unknown; sortBy?: SortOption }): EmptyResult;
  exportData(): string;
  validateImportData(rawText: string): EmptyResult;
  importData(rawText: string): EmptyResult;
  resetData(): EmptyResult;
  addMaintenanceRecord(payload: MaintenancePayload): EmptyResult;
  updateMaintenanceRecord(id: string, payload: MaintenancePayload): EmptyResult;
  deleteMaintenanceRecord(id: string): EmptyResult;
  exportMaintenanceData(): string;
  importMaintenanceData(rawText: string): EmptyResult;
  updateNotificationSettings(patch: Partial<NotificationSettings>): EmptyResult;
  recordNotificationStatus(input: {
    id: string;
    status: NotificationStatus;
    date: string;
    type: NotificationType;
    time: string;
    routineIds: string[];
    snoozedUntil?: string;
  }): EmptyResult;
  markAllNotificationsAsSeen(entries: MarkAsSeenEntry[]): EmptyResult;
}

export interface MarkAsSeenEntry {
  id: string;
  date: string;
  type: NotificationType;
  time: string;
  routineIds: string[];
}

export function createAppController({
  initialState,
  storage,
  onStateChange,
}: {
  initialState: AppState;
  storage?: StorageAdapter;
  onStateChange?: () => void;
}): AppController {
  let state = initialState;
  let lastDeletedRoutine: Routine | null = null;

  const actions: AppActions = {
    addRoutine(payload) {
      if (state.routines.length >= MAX_ROUTINES) {
        return failure(`Limite de ${MAX_ROUTINES} rotinas atingido. Exclua rotinas antigas antes de adicionar novas.`);
      }
      const result = buildRoutine(payload);
      if (!result.ok) return result;

      if (!catalogHasName("rooms", result.value.room)) {
        return failure("Cadastre a turma em “Turmas” antes de usá-la em uma rotina.");
      }

      const capacityError = checkCatalogCapacity(result.value);
      if (capacityError) return failure(capacityError);

      state.routines.push(result.value);
      ensureCatalogsFromRoutine(result.value);
      return persist();
    },

    updateRoutine(id, payload) {
      const index = state.routines.findIndex((routine) => routine.id === id);
      if (index === -1) return failure("Rotina não encontrada. Atualize a página e tente novamente.");

      const result = buildRoutine(payload, state.routines[index]);
      if (!result.ok) return result;

      if (!catalogHasName("rooms", result.value.room)) {
        return failure("Cadastre a turma em “Turmas” antes de usá-la em uma rotina.");
      }

      const capacityError = checkCatalogCapacity(result.value);
      if (capacityError) return failure(capacityError);

      state.routines[index] = result.value;
      ensureCatalogsFromRoutine(result.value);
      return persist();
    },

    deleteRoutine(id) {
      const index = state.routines.findIndex((routine) => routine.id === id);
      if (index === -1) return failure("Rotina não encontrada. Atualize a página e tente novamente.");

      lastDeletedRoutine = state.routines[index] ?? null;
      state.routines.splice(index, 1);
      return persist();
    },

    duplicateRoutine(id) {
      if (state.routines.length >= MAX_ROUTINES) {
        return failure(`Limite de ${MAX_ROUTINES} rotinas atingido. Exclua rotinas antigas antes de duplicar.`);
      }
      const routine = state.routines.find((item) => item.id === id);
      if (!routine) return failure("Rotina não encontrada. Atualize a página e tente novamente.");

      const duplicated = {
        ...routine,
        id: undefined,
      };
      const result = buildRoutine(duplicated);
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
      state.routines.push({
        ...lastDeletedRoutine,
        updatedAt: nowIso(),
      });
      lastDeletedRoutine = null;
      return persist();
    },

    addCatalogItem(kind, payload) {
      const limitMap: Record<string, number> = {
        teachers: MAX_TEACHERS,
        rooms: MAX_CLASSES,
        devices: MAX_DEVICES,
      };
      const limit = limitMap[kind];
      if (limit !== undefined && state[kind].length >= limit) {
        return failure(`Limite de ${limit} cadastros atingido neste catálogo. Remova itens não utilizados para liberar espaço.`);
      }
      const normalized = normalizeCatalogPayload(kind, payload);
      if (!normalized.ok) return normalized;

      if (catalogHasName(kind, normalized.value.name)) {
        return failure("Já existe um cadastro com esse nome neste catálogo.");
      }

      const item = createCatalogItem(
        normalized.value.name,
        singularKind(kind),
        normalized.value.extra as never,
      );
      state[kind].push(item as never);
      return persist();
    },

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

      const previousName = collection[index]!.name;
      collection[index] = {
        ...collection[index]!,
        name: normalized.value.name,
        updatedAt: nowIso(),
        ...normalized.value.extra,
      } as never;
      updateRoutineSnapshots(kind, previousName, normalized.value.name);

      return persist();
    },

    deleteCatalogItem(kind, id) {
      const collection = state[kind];
      const index = collection.findIndex((item) => item.id === id);
      if (index === -1) return failure("Cadastro não encontrado. Atualize a página e tente novamente.");

      collection.splice(index, 1);
      return persist();
    },

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

    validateImportData(rawText) {
      const result = importStateFromText(rawText);
      return result.ok ? { ok: true } : result;
    },

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

    updateMaintenanceRecord(id, payload) {
      const index = state.maintenanceRecords.findIndex((record) => record.id === id);
      if (index === -1) return failure("Manutenção não encontrada. Atualize a página e tente novamente.");

      const previous = state.maintenanceRecords[index]!;
      const result = buildMaintenanceRecord(payload, state.maintenanceRecords, previous);
      if (!result.ok) return result;

      let updated = result.value;
      describeMaintenanceChanges(previous, updated).forEach((message) => {
        updated = appendMaintenanceHistory(updated, message);
      });

      state.maintenanceRecords[index] = updated;
      return persist();
    },

    deleteMaintenanceRecord(id) {
      const index = state.maintenanceRecords.findIndex((record) => record.id === id);
      if (index === -1) return failure("Manutenção não encontrada. Atualize a página e tente novamente.");
      state.maintenanceRecords.splice(index, 1);
      return persist();
    },

    exportMaintenanceData() {
      return JSON.stringify(
        {
          schemaVersion: state.schemaVersion,
          maintenanceRecords: state.maintenanceRecords,
          exportedAt: nowIso(),
        },
        null,
        2,
      );
    },

    importMaintenanceData(rawText) {
      const result = importMaintenanceFromText(rawText);
      if (!result.ok) return result;

      state.maintenanceRecords = result.value;
      return persist();
    },

    updateNotificationSettings(patch) {
      const merged = normalizeNotificationSettings({
        ...state.settings.notifications,
        ...patch,
      });
      state.settings = {
        ...state.settings,
        notifications: merged,
      };
      return persist();
    },

    recordNotificationStatus(input) {
      if (!input?.id) return failure("Identificador do aviso ausente. Atualize a página e tente novamente.");
      const log = state.notificationLog ?? [];
      const index = log.findIndex((entry) => entry.id === input.id);
      const entry: NotificationLogEntry = {
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

  function getState(): AppState {
    return state;
  }

  function persist(): EmptyResult {
    const result = saveState(state, storage);
    if (!result.ok) return result;

    state = result.state!;
    onStateChange?.();
    return { ok: true };
  }

  function ensureCatalogsFromRoutine(routine: Routine): void {
    ensureCatalogItem("teachers", { name: routine.teacher });
    routine.devices.forEach((device) => ensureCatalogItem("devices", { name: device }));
  }

  function ensureCatalogItem(kind: CatalogKind, payload: CatalogPayload): void {
    if (catalogHasName(kind, payload.name)) return;
    const catalogLimitMap: Record<string, number> = {
      teachers: MAX_TEACHERS,
      rooms: MAX_CLASSES,
      devices: MAX_DEVICES,
    };
    const catalogLimit = catalogLimitMap[kind];
    if (catalogLimit !== undefined && state[kind].length >= catalogLimit) return;
    const normalized = normalizeCatalogPayload(kind, payload);
    if (!normalized.ok) return;
    const item = createCatalogItem(
      normalized.value.name,
      singularKind(kind),
      normalized.value.extra as never,
    );
    state[kind].push(item as never);
  }

  function checkCatalogCapacity(routine: Routine): string | null {
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

  function catalogHasName(kind: CatalogKind, name: unknown): boolean {
    const key = normalizeCase(name);
    return state[kind].some((item) => normalizeCase(item.name) === key);
  }

  function updateRoutineSnapshots(kind: CatalogKind, previousName: string, nextName: string): void {
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

  return {
    getState,
    actions,
  };
}
