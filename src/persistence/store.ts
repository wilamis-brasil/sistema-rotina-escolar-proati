import { failure } from "../domain/errors";
import { createEmptyState, migrateState, nowIso, pruneNotificationLog } from "../domain/model";
import {
  IMPORT_MAX_BYTES,
  MAX_NOTIFICATION_LOG,
  MAX_ROUTINES,
  MAX_TEACHERS,
  MAX_CLASSES,
  MAX_DEVICES,
  MAX_PASSWORDS,
  MAX_MAINTENANCES,
  MAX_MAINTENANCE_BATCH,
} from "../domain/limits";
import {
  LEGACY_STORAGE_KEYS,
  STORAGE_KEY,
  type AppState,
  type EmptyResult,
  type MaintenanceRecord,
  type Result,
  type StorageAdapter,
} from "../domain/types";

function browserStorage(): StorageAdapter {
  return window.localStorage;
}

export function loadState(storage: StorageAdapter = browserStorage()): {
  state: AppState;
  notice: string;
} {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) {
      const migrated = migrateState(JSON.parse(raw));
      if (migrated.notificationLog.length > MAX_NOTIFICATION_LOG) {
        migrated.notificationLog = pruneNotificationLog(migrated.notificationLog);
      }
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      } catch (persistError) {
        console.error("Falha ao atualizar dados locais migrados.", persistError);
      }

      return { state: migrated, notice: "Dados locais carregados." };
    }

    const legacyEntry = LEGACY_STORAGE_KEYS
      .map((key) => ({ key, raw: storage.getItem(key) }))
      .find((entry) => Boolean(entry.raw));

    if (legacyEntry?.raw) {
      const migrated = migrateState(JSON.parse(legacyEntry.raw));
      if (migrated.notificationLog.length > MAX_NOTIFICATION_LOG) {
        migrated.notificationLog = pruneNotificationLog(migrated.notificationLog);
      }
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        storage.removeItem(legacyEntry.key);
      } catch (persistError) {
        console.error("Falha ao migrar dados locais para nova chave.", persistError);
      }

      return { state: migrated, notice: "Dados locais migrados para a nova chave de armazenamento." };
    }

    return { state: createEmptyState(), notice: "Novo armazenamento local criado neste navegador." };
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
  if (rawText.length > IMPORT_MAX_BYTES) {
    return { ok: false, errors: [`Arquivo excede o limite de ${IMPORT_MAX_BYTES / 1_048_576} MB permitido para importação.`] };
  }
  try {
    const parsed = JSON.parse(rawText);
    const state = migrateState(parsed);
    if (state.routines.length > MAX_ROUTINES) {
      return { ok: false, errors: [`Importação contém muitas rotinas (máximo: ${MAX_ROUTINES}).`] };
    }
    if (state.teachers.length > MAX_TEACHERS) {
      return { ok: false, errors: [`Importação contém muitos professores (máximo: ${MAX_TEACHERS}).`] };
    }
    if (state.rooms.length > MAX_CLASSES) {
      return { ok: false, errors: [`Importação contém muitas turmas (máximo: ${MAX_CLASSES}).`] };
    }
    if (state.devices.length > MAX_DEVICES) {
      return { ok: false, errors: [`Importação contém muitos dispositivos (máximo: ${MAX_DEVICES}).`] };
    }
    if (state.passwords.length > MAX_PASSWORDS) {
      return { ok: false, errors: [`Importação contém muitas senhas (máximo: ${MAX_PASSWORDS}).`] };
    }
    if (state.maintenanceRecords.length > MAX_MAINTENANCES) {
      return { ok: false, errors: [`Importação contém muitos registros de manutenção (máximo: ${MAX_MAINTENANCES}).`] };
    }
    return { ok: true, value: state };
  } catch (error) {
    return {
      ok: false,
      errors: [`Arquivo JSON inválido ou incompatível: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

export function importMaintenanceFromText(rawText: string): Result<MaintenanceRecord[]> {
  if (rawText.length > IMPORT_MAX_BYTES) {
    return { ok: false, errors: [`Arquivo excede o limite de ${IMPORT_MAX_BYTES / 1_048_576} MB permitido para importação.`] };
  }
  try {
    const parsed = JSON.parse(rawText) as { maintenanceRecords?: unknown };
    const candidate = parsed && typeof parsed === "object" && Array.isArray(parsed.maintenanceRecords)
      ? { maintenanceRecords: parsed.maintenanceRecords }
      : Array.isArray(parsed)
        ? { maintenanceRecords: parsed }
        : null;
    if (!candidate) {
      return {
        ok: false,
        errors: ["Arquivo JSON inválido: nenhum registro de manutenção encontrado."],
      };
    }
    const migrated = migrateState({ maintenanceRecords: candidate.maintenanceRecords });
    if (migrated.maintenanceRecords.length > MAX_MAINTENANCE_BATCH) {
      return {
        ok: false,
        errors: [`O arquivo contém ${migrated.maintenanceRecords.length} registros. O limite por importação é ${MAX_MAINTENANCE_BATCH}.`],
      };
    }
    return { ok: true, value: migrated.maintenanceRecords };
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
    for (const key of LEGACY_STORAGE_KEYS) {
      storage.removeItem(key);
    }
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
