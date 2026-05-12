export const SCHEMA_VERSION = 1;
export const STORAGE_KEY = "kickoff-proati-state-v1";

export const WEEKDAYS = [
  { id: "monday", label: "Segunda-feira", shortLabel: "Seg", jsDay: 1 },
  { id: "tuesday", label: "Terça-feira", shortLabel: "Ter", jsDay: 2 },
  { id: "wednesday", label: "Quarta-feira", shortLabel: "Qua", jsDay: 3 },
  { id: "thursday", label: "Quinta-feira", shortLabel: "Qui", jsDay: 4 },
  { id: "friday", label: "Sexta-feira", shortLabel: "Sex", jsDay: 5 },
];

export const SORT_OPTIONS = [
  { value: "weekday-time", label: "Dia e horário" },
  { value: "time", label: "Horário" },
  { value: "teacher", label: "Professor" },
  { value: "room", label: "Sala/turma" },
  { value: "device", label: "Dispositivo" },
];

export const DEFAULT_DEVICE_NAMES = [
  "Notebook",
  "Chromebook",
  "Notebook/Chromebook",
  "Tablet",
  "Headset",
];

export function nowIso() {
  return new Date().toISOString();
}

export function createId(prefix) {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function normalizeCase(value) {
  return normalizeText(value).toLocaleLowerCase("pt-BR");
}

export function uniqueNames(values) {
  const seen = new Set();
  const result = [];

  values.forEach((value) => {
    const name = normalizeText(value);
    const key = normalizeCase(name);
    if (!name || seen.has(key)) return;
    seen.add(key);
    result.push(name);
  });

  return result;
}

export function timeToMinutes(value) {
  if (!isValidTime(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function isValidTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value ?? ""));
}

export function weekdayIndex(weekdayId) {
  return WEEKDAYS.findIndex((day) => day.id === weekdayId);
}

export function getWeekdayLabel(weekdayId) {
  return WEEKDAYS.find((day) => day.id === weekdayId)?.label ?? "Dia não definido";
}

export function getTodayWeekdayId(date = new Date()) {
  return WEEKDAYS.find((day) => day.jsDay === date.getDay())?.id ?? null;
}

export function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

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

export function createEmptyState() {
  const timestamp = nowIso();

  return {
    schemaVersion: SCHEMA_VERSION,
    routines: [],
    teachers: [],
    rooms: [],
    devices: DEFAULT_DEVICE_NAMES.map((name) => createCatalogItem(name, "device")),
    settings: {
      notificationsEnabled: false,
      defaultLeadMinutes: 10,
      soundEnabled: true,
      sortBy: "weekday-time",
      filterText: "",
    },
    meta: {
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  };
}

export function validateLeadMinutes(value, fieldLabel = "Antecedência") {
  if (value === null || value === undefined || value === "") {
    return { value: null, error: null };
  }

  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < 0 || numberValue > 1440) {
    return { value: null, error: `${fieldLabel} deve ser um número inteiro entre 0 e 1440 minutos.` };
  }

  return { value: numberValue, error: null };
}

export function buildRoutine(payload, existingRoutine = null) {
  const errors = [];
  const weekday = normalizeText(payload.weekday);
  const startTime = normalizeText(payload.startTime);
  const endTime = normalizeText(payload.endTime);
  const teacher = normalizeText(payload.teacher);
  const room = normalizeText(payload.room);
  const studentCount = Number(payload.studentCount);
  const devices = uniqueNames(Array.isArray(payload.devices) ? payload.devices : []);
  const notes = normalizeText(payload.notes);
  const leadResult = validateLeadMinutes(payload.leadMinutes, "Antecedência da rotina");

  if (weekdayIndex(weekday) === -1) {
    errors.push("Escolha um dia útil entre segunda e sexta-feira.");
  }

  if (!isValidTime(startTime)) {
    errors.push("Informe o horário de retirada no formato HH:MM.");
  }

  if (endTime && !isValidTime(endTime)) {
    errors.push("Informe o horário de término no formato HH:MM ou deixe em branco.");
  }

  if (isValidTime(startTime) && isValidTime(endTime) && timeToMinutes(endTime) < timeToMinutes(startTime)) {
    errors.push("O horário de término não pode ser anterior ao horário de retirada.");
  }

  if (!teacher) {
    errors.push("Informe o professor responsável.");
  }

  if (!room) {
    errors.push("Informe a sala ou turma.");
  }

  if (!Number.isInteger(studentCount) || studentCount < 1) {
    errors.push("Informe uma quantidade de alunos maior que zero.");
  }

  if (devices.length === 0) {
    errors.push("Selecione ou cadastre ao menos um dispositivo.");
  }

  if (leadResult.error) {
    errors.push(leadResult.error);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const timestamp = nowIso();

  return {
    ok: true,
    value: {
      id: existingRoutine?.id ?? createId("routine"),
      weekday,
      startTime,
      endTime,
      teacher,
      room,
      studentCount,
      devices,
      notes,
      notificationEnabled: Boolean(payload.notificationEnabled),
      leadMinutes: leadResult.value,
      createdAt: existingRoutine?.createdAt ?? timestamp,
      updatedAt: timestamp,
    },
  };
}

export function validateCatalogName(name, label) {
  const value = normalizeText(name);
  if (!value) {
    return { ok: false, errors: [`Informe ${label}.`] };
  }

  if (value.length > 80) {
    return { ok: false, errors: [`${label} deve ter no máximo 80 caracteres.`] };
  }

  return { ok: true, value };
}

export function validateRoomCount(value) {
  if (value === null || value === undefined || value === "") {
    return { ok: true, value: null };
  }

  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < 1) {
    return { ok: false, errors: ["A quantidade padrão de alunos deve ser maior que zero."] };
  }

  return { ok: true, value: numberValue };
}

export function sortRoutines(routines, sortBy = "weekday-time") {
  const copy = [...routines];
  const byTime = (a, b) => (timeToMinutes(a.startTime) ?? 0) - (timeToMinutes(b.startTime) ?? 0);
  const byDay = (a, b) => weekdayIndex(a.weekday) - weekdayIndex(b.weekday);
  const byText = (selector) => (a, b) => normalizeCase(selector(a)).localeCompare(normalizeCase(selector(b)), "pt-BR");

  const sorters = {
    "weekday-time": (a, b) => byDay(a, b) || byTime(a, b) || byText((item) => item.teacher)(a, b),
    time: (a, b) => byTime(a, b) || byDay(a, b),
    teacher: (a, b) => byText((item) => item.teacher)(a, b) || byDay(a, b) || byTime(a, b),
    room: (a, b) => byText((item) => item.room)(a, b) || byDay(a, b) || byTime(a, b),
    device: (a, b) => byText((item) => item.devices[0] ?? "")(a, b) || byDay(a, b) || byTime(a, b),
  };

  return copy.sort(sorters[sortBy] ?? sorters["weekday-time"]);
}

export function filterRoutines(routines, query) {
  const normalizedQuery = normalizeCase(query);
  if (!normalizedQuery) return routines;

  return routines.filter((routine) => {
    const haystack = [
      routine.teacher,
      routine.room,
      routine.studentCount,
      routine.weekday,
      getWeekdayLabel(routine.weekday),
      routine.startTime,
      routine.endTime,
      routine.notes,
      ...routine.devices,
    ]
      .join(" ")
      .toLocaleLowerCase("pt-BR");

    return haystack.includes(normalizedQuery);
  });
}

export function normalizeState(candidate) {
  if (!candidate || typeof candidate !== "object") {
    throw new Error("Arquivo de dados inválido.");
  }

  const base = createEmptyState();
  const state = {
    ...base,
    schemaVersion: SCHEMA_VERSION,
    routines: [],
    teachers: normalizeCatalogCollection(candidate.teachers, "teacher"),
    rooms: normalizeRoomCollection(candidate.rooms),
    devices: normalizeCatalogCollection(candidate.devices, "device"),
    settings: normalizeSettings(candidate.settings, base.settings),
    meta: {
      createdAt: normalizeText(candidate.meta?.createdAt) || base.meta.createdAt,
      updatedAt: nowIso(),
    },
  };

  if (state.devices.length === 0) {
    state.devices = base.devices;
  }

  const routineErrors = [];
  const routineIds = new Set();
  if (Array.isArray(candidate.routines)) {
    candidate.routines.forEach((routine, index) => {
      const normalized = buildRoutine(routine, {
        id: normalizeText(routine?.id) || createId("routine"),
        createdAt: normalizeText(routine?.createdAt) || nowIso(),
      });

      if (!normalized.ok) {
        routineErrors.push(`Rotina ${index + 1}: ${normalized.errors.join(" ")}`);
        return;
      }

      let routineId = normalizeText(routine?.id) || normalized.value.id;
      if (routineIds.has(routineId)) {
        routineId = createId("routine");
      }
      routineIds.add(routineId);

      state.routines.push({
        ...normalized.value,
        id: routineId,
        createdAt: normalizeText(routine?.createdAt) || normalized.value.createdAt,
        updatedAt: normalizeText(routine?.updatedAt) || normalized.value.updatedAt,
      });
    });
  }

  if (routineErrors.length > 0) {
    throw new Error(routineErrors.join("\n"));
  }

  return state;
}

function normalizeCatalogCollection(items, type) {
  if (!Array.isArray(items)) return [];

  const seen = new Set();
  const seenIds = new Set();
  const timestamp = nowIso();

  return items.reduce((result, item) => {
    const name = normalizeText(typeof item === "string" ? item : item?.name);
    const key = normalizeCase(name);
    if (!name || seen.has(key)) return result;
    seen.add(key);
    let id = normalizeText(item?.id) || createId(type);
    if (seenIds.has(id)) {
      id = createId(type);
    }
    seenIds.add(id);

    result.push({
      id,
      name,
      createdAt: normalizeText(item?.createdAt) || timestamp,
      updatedAt: normalizeText(item?.updatedAt) || timestamp,
    });

    return result;
  }, []);
}

function normalizeRoomCollection(items) {
  if (!Array.isArray(items)) return [];

  const seen = new Set();
  const seenIds = new Set();
  const timestamp = nowIso();

  return items.reduce((result, item) => {
    const name = normalizeText(typeof item === "string" ? item : item?.name);
    const key = normalizeCase(name);
    if (!name || seen.has(key)) return result;
    seen.add(key);
    let id = normalizeText(item?.id) || createId("room");
    if (seenIds.has(id)) {
      id = createId("room");
    }
    seenIds.add(id);

    const count = validateRoomCount(item?.studentCount);

    result.push({
      id,
      name,
      studentCount: count.ok ? count.value : null,
      createdAt: normalizeText(item?.createdAt) || timestamp,
      updatedAt: normalizeText(item?.updatedAt) || timestamp,
    });

    return result;
  }, []);
}

function normalizeSettings(settings, defaults) {
  const lead = validateLeadMinutes(settings?.defaultLeadMinutes, "Antecedência Padrão");

  return {
    notificationsEnabled: Boolean(settings?.notificationsEnabled),
    defaultLeadMinutes: lead.error ? defaults.defaultLeadMinutes : lead.value ?? defaults.defaultLeadMinutes,
    soundEnabled: settings?.soundEnabled !== false,
    sortBy: SORT_OPTIONS.some((option) => option.value === settings?.sortBy) ? settings.sortBy : defaults.sortBy,
    filterText: normalizeText(settings?.filterText),
  };
}
