import { failure } from "../domain/errors";
import { createEmptyState, migrateState, nowIso } from "../domain/model";
import { STORAGE_KEY, type AppState, type EmptyResult, type Result, type StorageAdapter } from "../domain/types";

export function browserStorage(): StorageAdapter {
  return window.localStorage;
}

export function loadState(storage: StorageAdapter = browserStorage()): {
  state: AppState;
  notice: string;
} {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      return { state: createEmptyState(), notice: "Novo armazenamento local criado neste navegador." };
    }

    return { state: migrateState(JSON.parse(raw)), notice: "Dados locais carregados." };
  } catch (error) {
    console.error("Falha ao carregar dados locais.", error);
    return {
      state: createEmptyState(),
      notice: "Não foi possível carregar os dados locais. Um estado limpo foi iniciado.",
    };
  }
}

export function saveState(
  state: AppState,
  storage: StorageAdapter = browserStorage(),
): EmptyResult & { state?: AppState } {
  try {
    const nextState: AppState = {
      ...state,
      meta: {
        ...state.meta,
        updatedAt: nowIso(),
      },
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    return { ok: true, state: nextState };
  } catch (error) {
    console.error("Falha ao salvar dados locais.", error);
    return {
      ok: false,
      errors: ["Não foi possível salvar no navegador. Verifique espaço disponível ou permissões do site."],
    };
  }
}

export function exportState(state: AppState): string {
  return JSON.stringify(
    {
      ...state,
      exportedAt: nowIso(),
    },
    null,
    2,
  );
}

export function importStateFromText(rawText: string): Result<AppState> {
  try {
    const parsed = JSON.parse(rawText);
    return { ok: true, value: migrateState(parsed) };
  } catch (error) {
    return {
      ok: false,
      errors: [`Arquivo JSON inválido ou incompatível: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

export function clearStoredState(storage: StorageAdapter = browserStorage()): EmptyResult {
  try {
    storage.removeItem(STORAGE_KEY);
    return { ok: true };
  } catch {
    return failure("Não foi possível apagar os dados locais.");
  }
}

export function createMemoryStorage(initial: Record<string, string> = {}): StorageAdapter {
  const values = new Map(Object.entries(initial));

  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}
