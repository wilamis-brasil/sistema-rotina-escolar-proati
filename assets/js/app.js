import {
  buildRoutine,
  createCatalogItem,
  createEmptyState,
  normalizeCase,
  normalizeText,
  nowIso,
  validateCatalogName,
  validateLeadMinutes,
  validateRoomCount,
} from "./model.js";
import { clearStoredState, exportState, importStateFromText, loadState, saveState } from "./store.js";
import { createNotificationManager } from "./notifications.js";
import { createUI } from "./ui.js?v=20260512-popups";
import { failure } from "./errors.js";

const loaded = loadState();
let state = loaded.state;
let lastDeletedRoutine = null;
let ui = null;

const notifications = createNotificationManager({
  getState: () => state,
  onAlert: (alert) => ui?.addAlert(alert),
  onAlarm: (alert) => ui?.showAlarm(alert),
  onSoundBlocked: (message) => ui?.showToast({
    type: "warning",
    title: "Som bloqueado",
    message,
  }),
  onStatusChange: () => ui?.renderNotificationStatus(),
});

const actions = {
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

    lastDeletedRoutine = state.routines[index];
    state.routines.splice(index, 1);
    return persist();
  },

  duplicateRoutine(id) {
    const routine = state.routines.find((item) => item.id === id);
    if (!routine) return failure("Rotina não encontrada.");

    const duplicated = {
      ...routine,
      id: undefined,
      notes: routine.notes ? `${routine.notes} (cópia)` : "Cópia",
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

    state[kind].push(createCatalogItem(normalized.value.name, singularKind(kind), normalized.value.extra));
    return persist();
  },

  updateCatalogItem(kind, id, payload) {
    const collection = state[kind];
    if (!Array.isArray(collection)) return failure("Catálogo inválido.");

    const index = collection.findIndex((item) => item.id === id);
    if (index === -1) return failure("Cadastro não encontrado.");

    const normalized = normalizeCatalogPayload(kind, payload);
    if (!normalized.ok) return normalized;

    const duplicate = collection.some((item) => item.id !== id && normalizeCase(item.name) === normalizeCase(normalized.value.name));
    if (duplicate) return failure("Já existe um cadastro com esse nome.");

    const previousName = collection[index].name;
    collection[index] = {
      ...collection[index],
      name: normalized.value.name,
      updatedAt: nowIso(),
      ...normalized.value.extra,
    };
    updateRoutineSnapshots(kind, previousName, normalized.value.name);

    return persist();
  },

  deleteCatalogItem(kind, id) {
    const collection = state[kind];
    if (!Array.isArray(collection)) return failure("Catálogo inválido.");

    const index = collection.findIndex((item) => item.id === id);
    if (index === -1) return failure("Cadastro não encontrado.");

    collection.splice(index, 1);
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

    state = result.state;
    lastDeletedRoutine = null;
    return persist();
  },

  resetData() {
    clearStoredState();
    state = createEmptyState();
    lastDeletedRoutine = null;
    return persist();
  },
};

ui = createUI({
  getState: () => state,
  actions,
  notifications,
  initialNotice: loaded.notice,
});

ui.init();
notifications.reschedule();

function persist(options = {}) {
  const result = saveState(state);
  if (!result.ok) return result;

  state = result.state;
  if (options.reschedule !== false) {
    notifications.reschedule();
  }
  return { ok: true };
}

function ensureCatalogsFromRoutine(routine) {
  ensureCatalogItem("teachers", { name: routine.teacher });
  ensureCatalogItem("rooms", { name: routine.room, studentCount: routine.studentCount });
  routine.devices.forEach((device) => ensureCatalogItem("devices", { name: device }));
}

function ensureCatalogItem(kind, payload) {
  if (catalogHasName(kind, payload.name)) return;
  const normalized = normalizeCatalogPayload(kind, payload);
  if (!normalized.ok) return;
  state[kind].push(createCatalogItem(normalized.value.name, singularKind(kind), normalized.value.extra));
}

function catalogHasName(kind, name) {
  const key = normalizeCase(name);
  return state[kind].some((item) => normalizeCase(item.name) === key);
}

function normalizeCatalogPayload(kind, payload) {
  const labels = {
    teachers: "o nome do professor",
    rooms: "a sala/turma",
    devices: "o dispositivo",
  };
  const name = validateCatalogName(payload.name, labels[kind] ?? "o cadastro");
  if (!name.ok) return name;

  if (kind !== "rooms") {
    return { ok: true, value: { name: name.value, extra: {} } };
  }

  const count = validateRoomCount(payload.studentCount);
  if (!count.ok) return count;

  return {
    ok: true,
    value: {
      name: name.value,
      extra: {
        studentCount: count.value,
      },
    },
  };
}

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

function singularKind(kind) {
  return {
    teachers: "teacher",
    rooms: "room",
    devices: "device",
  }[kind] ?? "item";
}
