import { failure } from "../domain/errors";
import {
  buildRoutine,
  createCatalogItem,
  createEmptyState,
  normalizeCatalogPayload,
  normalizeCase,
  normalizeText,
  nowIso,
  singularKind,
  validateLeadMinutes,
  validatePasswordPayload,
} from "../domain/model";
import type {
  AppState,
  CatalogKind,
  CatalogPayload,
  EmptyResult,
  PasswordPayload,
  Routine,
  RoutinePayload,
  SortOption,
  StorageAdapter,
} from "../domain/types";
import { clearStoredState, exportState, importStateFromText, saveState } from "../persistence/store";

export interface PersistOptions {
  reschedule?: boolean;
}

export interface AppController {
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
  updateSettings(payload: {
    notificationsEnabled: unknown;
    defaultLeadMinutes: unknown;
    soundEnabled: unknown;
  }): EmptyResult;
  updateUiFilters(payload: { filterText?: unknown; sortBy?: SortOption }): EmptyResult;
  exportData(): string;
  importData(rawText: string): EmptyResult;
  resetData(): EmptyResult;
}

export function createAppController({
  initialState,
  storage,
  onStateChange,
}: {
  initialState: AppState;
  storage?: StorageAdapter;
  onStateChange?: (options: PersistOptions) => void;
}): AppController {
  let state = initialState;
  let lastDeletedRoutine: Routine | null = null;

  const actions: AppActions = {
    addRoutine(payload) {
      const result = buildRoutine(payload);
      if (!result.ok) return result;

      state.routines.push(result.value);
      ensureCatalogsFromRoutine(result.value);
      return persist();
    },

    updateRoutine(id, payload) {
      const index = state.routines.findIndex((routine) => routine.id === id);
      if (index === -1) return failure("Rotina não encontrada.");

      const result = buildRoutine(payload, state.routines[index]);
      if (!result.ok) return result;

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
      const normalized = normalizeCatalogPayload(kind, payload);
      if (!normalized.ok) return normalized;

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

    updateSettings(payload) {
      const lead = validateLeadMinutes(payload.defaultLeadMinutes, "Antecedência Padrão");
      if (lead.error) return failure(lead.error);

      state.settings = {
        ...state.settings,
        notificationsEnabled: Boolean(payload.notificationsEnabled),
        defaultLeadMinutes: lead.value ?? state.settings.defaultLeadMinutes,
        soundEnabled: Boolean(payload.soundEnabled),
      };
      return persist();
    },

    updateUiFilters(payload) {
      state.settings = {
        ...state.settings,
        filterText: normalizeText(payload.filterText ?? state.settings.filterText),
        sortBy: payload.sortBy ?? state.settings.sortBy,
      };
      return persist({ reschedule: false });
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
  };

  function getState(): AppState {
    return state;
  }

  function persist(options: PersistOptions = {}): EmptyResult {
    const result = saveState(state, storage);
    if (!result.ok) return result;

    state = result.state!;
    onStateChange?.(options);
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
