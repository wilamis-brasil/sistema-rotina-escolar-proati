import { failure } from "../domain/errors";
import {
  MAX_ROUTINES,
  MAX_TEACHERS,
  MAX_CLASSES,
  MAX_DEVICES,
  MAX_PASSWORDS,
  MAX_MAINTENANCES,
} from "../domain/limits";
import {
  appendMaintenanceHistory,
  buildMaintenanceRecord,
  buildRoutine,
  createCatalogItem,
  createEmptyState,
  describeMaintenanceChanges,
  getMaintenanceStatusLabel,
  isCanonicalRoomName,
  normalizeCatalogPayload,
  normalizeCase,
  normalizeNotificationSettings,
  normalizeText,
  nowIso,
  singularKind,
  validatePasswordPayload,
} from "../domain/model";
import {
  CLASS_LETTERS,
  type AppState,
  type CatalogKind,
  type CatalogPayload,
  type EmptyResult,
  type MaintenancePayload,
  type NotificationLogEntry,
  type NotificationSettings,
  type NotificationStatus,
  type NotificationType,
  type PasswordPayload,
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
  addPassword(payload: PasswordPayload): EmptyResult;
  updatePassword(id: string, payload: PasswordPayload): EmptyResult;
  deletePassword(id: string): EmptyResult;
  updateUiFilters(payload: { filterText?: unknown; sortBy?: SortOption }): EmptyResult;
  exportData(): string;
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
  markAllNotificationsAsSeen(ids: string[]): EmptyResult;
  clearOldNotificationLog(beforeDate: string): EmptyResult;
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
        return failure(`Limite de ${MAX_ROUTINES} rotinas atingido.`);
      }
      const result = buildRoutine(payload);
      if (!result.ok) return result;

      if (!isCanonicalRoomName(result.value.room, CLASS_LETTERS)) {
        return failure("Selecione uma turma padronizada (ex.: 6º ano EF - B).");
      }

      state.routines.push(result.value);
      ensureCatalogsFromRoutine(result.value);
      return persist();
    },

    updateRoutine(id, payload) {
      const index = state.routines.findIndex((routine) => routine.id === id);
      if (index === -1) return failure("Rotina não encontrada.");

      const result = buildRoutine(payload, state.routines[index]);
      if (!result.ok) return result;

      if (!isCanonicalRoomName(result.value.room, CLASS_LETTERS)) {
        return failure("Selecione uma turma padronizada (ex.: 6º ano EF - B).");
      }

      state.routines[index] = result.value;
      ensureCatalogsFromRoutine(result.value);
      return persist();
    },

    deleteRoutine(id) {
      const index = state.routines.findIndex((routine) => routine.id === id);
      if (index === -1) return failure("Rotina não encontrada.");

      lastDeletedRoutine = state.routines[index] ?? null;
      state.routines.splice(index, 1);
      return persist();
    },

    duplicateRoutine(id) {
      const routine = state.routines.find((item) => item.id === id);
      if (!routine) return failure("Rotina não encontrada.");

      const duplicated = {
        ...routine,
        id: undefined,
      };
      const result = buildRoutine(duplicated);
      if (!result.ok) return result;

      state.routines.push(result.value);
      return persist();
    },

    canUndoDeleteRoutine() {
      return Boolean(lastDeletedRoutine);
    },

    undoDeleteRoutine() {
      if (!lastDeletedRoutine) return failure("Não há exclusão recente para desfazer.");
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
        return failure(`Limite de ${limit} itens atingido para este catálogo.`);
      }
      const normalized = normalizeCatalogPayload(kind, payload);
      if (!normalized.ok) return normalized;

      if (kind === "rooms" && !isCanonicalRoomName(normalized.value.name, CLASS_LETTERS)) {
        return failure("Selecione uma turma padronizada (ex.: 6º ano EF - B).");
      }

      if (catalogHasName(kind, normalized.value.name)) {
        return failure("Já existe um cadastro com esse nome.");
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
      if (index === -1) return failure("Cadastro não encontrado.");

      const normalized = normalizeCatalogPayload(kind, payload);
      if (!normalized.ok) return normalized;

      if (kind === "rooms" && !isCanonicalRoomName(normalized.value.name, CLASS_LETTERS)) {
        return failure("Selecione uma turma padronizada (ex.: 6º ano EF - B).");
      }

      const duplicate = collection.some(
        (item) => item.id !== id && normalizeCase(item.name) === normalizeCase(normalized.value.name),
      );
      if (duplicate) return failure("Já existe um cadastro com esse nome.");

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
      if (index === -1) return failure("Cadastro não encontrado.");

      collection.splice(index, 1);
      return persist();
    },

    addPassword(payload) {
      if (state.passwords.length >= MAX_PASSWORDS) {
        return failure(`Limite de ${MAX_PASSWORDS} senhas atingido.`);
      }
      const result = validatePasswordPayload(payload);
      if (!result.ok) return result;
      state.passwords.push(result.value);
      return persist();
    },

    updatePassword(id, payload) {
      const index = state.passwords.findIndex((p) => p.id === id);
      if (index === -1) return failure("Senha não encontrada.");
      const existing = state.passwords[index]!;
      const result = validatePasswordPayload(payload, existing.id, existing.createdAt);
      if (!result.ok) return result;
      state.passwords[index] = result.value;
      return persist();
    },

    deletePassword(id) {
      const index = state.passwords.findIndex((p) => p.id === id);
      if (index === -1) return failure("Senha não encontrada.");
      state.passwords.splice(index, 1);
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
        return failure(`Limite de ${MAX_MAINTENANCES} registros de manutenção atingido.`);
      }
      const result = buildMaintenanceRecord(payload, state.maintenanceRecords);
      if (!result.ok) return result;

      const created = appendMaintenanceHistory(
        result.value,
        `Registro criado com status "${getMaintenanceStatusLabel(result.value.status)}".`,
      );
      state.maintenanceRecords.push(created);
      return persist();
    },

    updateMaintenanceRecord(id, payload) {
      const index = state.maintenanceRecords.findIndex((record) => record.id === id);
      if (index === -1) return failure("Registro de manutenção não encontrado.");

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
      if (index === -1) return failure("Registro de manutenção não encontrado.");
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
      if (!input?.id) return failure("Identificador da notificação ausente.");
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
      } else {
        log[index] = entry;
      }
      state.notificationLog = log;
      return persist();
    },

    markAllNotificationsAsSeen(ids) {
      if (!Array.isArray(ids) || ids.length === 0) return { ok: true };
      const log = state.notificationLog ?? [];
      const known = new Set(log.map((entry) => entry.id));
      ids.forEach((id) => {
        const found = log.find((entry) => entry.id === id);
        if (found) {
          found.status = "vista";
          found.updatedAt = nowIso();
          delete found.snoozedUntil;
        } else if (!known.has(id)) {
          known.add(id);
        }
      });
      state.notificationLog = log;
      return persist();
    },

    clearOldNotificationLog(beforeDate) {
      if (!beforeDate) return { ok: true };
      const log = (state.notificationLog ?? []).filter((entry) => entry.date >= beforeDate);
      state.notificationLog = log;
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
    ensureCatalogItem("rooms", { name: routine.room, studentCount: routine.studentCount });
    routine.devices.forEach((device) => ensureCatalogItem("devices", { name: device }));
  }

  function ensureCatalogItem(kind: CatalogKind, payload: CatalogPayload): void {
    if (catalogHasName(kind, payload.name)) return;
    const normalized = normalizeCatalogPayload(kind, payload);
    if (!normalized.ok) return;
    const item = createCatalogItem(
      normalized.value.name,
      singularKind(kind),
      normalized.value.extra as never,
    );
    state[kind].push(item as never);
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
