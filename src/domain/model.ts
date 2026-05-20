import { z } from "zod";
import { resultFailure } from "./errors";
import {
  DEFAULT_DEVICE_NAMES,
  MAINTENANCE_PRIORITIES,
  MAINTENANCE_STATUSES,
  SCHEMA_VERSION,
  SORT_OPTIONS,
  WEEKDAYS,
  type AppState,
  type CatalogItem,
  type CatalogPayload,
  type Device,
  type MaintenanceHistoryEntry,
  type MaintenancePayload,
  type MaintenancePriority,
  type MaintenanceRecord,
  type MaintenanceStatus,
  type Password,
  type PasswordPayload,
  type Result,
  type Room,
  type Routine,
  type RoutinePayload,
  type Settings,
  type SingularCatalogKind,
  type SortOption,
  type Teacher,
  type WeekdayId,
} from "./types";

const RawStateSchema = z
  .object({
    schemaVersion: z.unknown().optional(),
    routines: z.array(z.unknown()).optional(),
    teachers: z.array(z.unknown()).optional(),
    rooms: z.array(z.unknown()).optional(),
    devices: z.array(z.unknown()).optional(),
    passwords: z.array(z.unknown()).optional(),
    maintenanceRecords: z.array(z.unknown()).optional(),
    settings: z.unknown().optional(),
    meta: z.unknown().optional(),
  })
  .passthrough();

// AVISO DE SEGURANÇA: este arquivo contém credenciais em texto puro.
// Mantenha o repositório PRIVADO ou substitua os valores de "secret" abaixo
// antes de publicar uma build pública (ex.: GitHub Pages).
const DEFAULT_PASSWORDS: Password[] = [
  {
    id: "password-netbook-positivo-multilaser-sala",
    title: "Netbook Positivo/Multilaser – Sala de Aula",
    username: ".\\suporte",
    secret: "P@ssw0rd$eespW10",
    description: "Credencial utilizada em netbooks Positivo/Multilaser de sala de aula.",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  },
  {
    id: "password-netbook-multilaser-m11w-formatacao",
    title: "Netbook Multilaser M11W – Formação",
    username: "",
    secret: "1n0v@c@0",
    description: "Senha utilizada no processo de formação do Netbook Multilaser M11W.",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  },
  {
    id: "password-imagem-instalacao",
    title: "Imagem de Instalação",
    username: "",
    secret: "!m4gem@seduc",
    description: "Senha da imagem de instalação.",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  },
  {
    id: "password-lenovo-multilaser-ultra-administrador",
    title: "Notebooks/Desktop Lenovo, Netbook Multilaser Ultra – Administrador",
    username: ".\\administrador",
    secret: "1n0v@c@0$educ21",
    description: "Credencial de administrador para notebooks/desktops Lenovo e Netbook Multilaser Ultra.",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  },
  {
    id: "password-lenovo-multilaser-ultra-proatec",
    title: "Notebooks/Desktop Lenovo, Netbook Multilaser Ultra – Proatec",
    username: ".\\proatec",
    secret: "$educ_Pr0@t&c",
    description: "Credencial PROATEC para notebooks/desktops Lenovo e Netbook Multilaser Ultra.",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  },
  {
    id: "password-tablet-positivo-quiosque",
    title: "Sair do Modo Quiosque – Tablet Positivo",
    username: "",
    secret: "4920",
    description: "Senha utilizada para sair do modo quiosque em Tablet Positivo.",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  },
];

export function nowIso(): string {
  return new Date().toISOString();
}

export function createId(prefix: string): string {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function normalizeCase(value: unknown): string {
  return normalizeText(value).toLocaleLowerCase("pt-BR");
}

function uniqueNames(values: unknown): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  const list = Array.isArray(values) ? values : [];

  list.forEach((value) => {
    const name = normalizeText(value);
    const key = normalizeCase(name);
    if (!name || seen.has(key)) return;
    seen.add(key);
    result.push(name);
  });

  return result;
}

export function isValidTime(value: unknown): value is string {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value ?? ""));
}

export function timeToMinutes(value: unknown): number | null {
  if (!isValidTime(value)) return null;
  const [hours = 0, minutes = 0] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function weekdayIndex(weekdayId: unknown): number {
  return WEEKDAYS.findIndex((day) => day.id === weekdayId);
}

export function isWeekdayId(value: unknown): value is WeekdayId {
  return weekdayIndex(value) !== -1;
}

export function getWeekdayLabel(weekdayId: unknown): string {
  return WEEKDAYS.find((day) => day.id === weekdayId)?.label ?? "Dia não definido";
}

export function getTodayWeekdayId(date = new Date()): WeekdayId | null {
  return WEEKDAYS.find((day) => day.jsDay === date.getDay())?.id ?? null;
}

export function formatDateTime(value: unknown): string {
  const date = new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function createCatalogItem(
  name: unknown,
  type: SingularCatalogKind,
  extra: { studentCount?: number | null } = {},
): CatalogItem & Partial<Pick<Room, "studentCount">> {
  const timestamp = nowIso();

  return {
    id: createId(type),
    name: normalizeText(name),
    createdAt: timestamp,
    updatedAt: timestamp,
    ...extra,
  };
}

export function createEmptyState(): AppState {
  const timestamp = nowIso();

  return {
    schemaVersion: SCHEMA_VERSION,
    routines: [],
    teachers: [],
    rooms: [],
    devices: DEFAULT_DEVICE_NAMES.map((name) => createCatalogItem(name, "device") as Device),
    passwords: DEFAULT_PASSWORDS.map((p) => ({ ...p })),
    maintenanceRecords: [],
    settings: {
      sortBy: "weekday-time",
      filterText: "",
    },
    meta: {
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  };
}

export function buildRoutine(
  payload: RoutinePayload,
  existingRoutine: Pick<Routine, "id" | "createdAt"> | null = null,
): Result<Routine> {
  const errors: string[] = [];
  const weekday = normalizeText(payload.weekday);
  const startTime = normalizeText(payload.startTime);
  const endTime = normalizeText(payload.endTime);
  const subject = normalizeText(payload.subject);
  const teacher = normalizeText(payload.teacher);
  const room = normalizeText(payload.room);
  const studentCount = Number(payload.studentCount);
  const devices = uniqueNames(payload.devices);
  const notes = normalizeRoutineNotes(payload.notes);

  if (!isWeekdayId(weekday)) {
    errors.push("Escolha um dia útil entre segunda e sexta-feira.");
  }

  if (!isValidTime(startTime)) {
    errors.push("Informe o horário de retirada no formato HH:MM.");
  }

  if (endTime && !isValidTime(endTime)) {
    errors.push("Informe o horário de término no formato HH:MM ou deixe em branco.");
  }

  if (isValidTime(startTime) && isValidTime(endTime) && timeToMinutes(endTime)! < timeToMinutes(startTime)!) {
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

  if (errors.length > 0) {
    return resultFailure(errors);
  }

  const timestamp = nowIso();

  return {
    ok: true,
    value: {
      id: existingRoutine?.id ?? createId("routine"),
      weekday: weekday as WeekdayId,
      startTime,
      endTime,
      subject,
      teacher,
      room,
      studentCount,
      devices,
      notes,
      createdAt: existingRoutine?.createdAt ?? timestamp,
      updatedAt: timestamp,
    },
  };
}

function validateCatalogName(name: unknown, label: string): Result<string> {
  const value = normalizeText(name);
  if (!value) {
    return resultFailure(`Informe ${label}.`);
  }

  if (value.length > 80) {
    return resultFailure(`${label} deve ter no máximo 80 caracteres.`);
  }

  return { ok: true, value };
}

function normalizeRoutineNotes(notes: unknown): string {
  const value = normalizeText(notes);
  const legacyImportNote = [
    73, 109, 112, 111, 114, 116, 97, 100, 111, 32, 100, 97, 32, 102, 111, 108, 104, 97, 32, 100, 101,
    32, 114, 101, 115, 101, 114, 118, 97, 32, 100, 101, 32, 101, 113, 117, 105, 112, 97, 109, 101,
    110, 116, 111, 115, 32, 101, 108, 101, 116, 114, 244, 110, 105, 99, 111, 115, 32, 102, 105, 120,
    111, 115, 46,
  ]
    .map((code) => String.fromCharCode(code))
    .join("");

  return value === legacyImportNote ? "" : value;
}

function validateRoomCount(value: unknown): Result<number | null> {
  if (value === null || value === undefined || value === "") {
    return { ok: true, value: null };
  }

  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < 1) {
    return resultFailure("A quantidade padrão de alunos deve ser maior que zero.");
  }

  return { ok: true, value: numberValue };
}

export function sortRoutines(routines: Routine[], sortBy: SortOption = "weekday-time"): Routine[] {
  const copy = [...routines];
  const byTime = (a: Routine, b: Routine) =>
    (timeToMinutes(a.startTime) ?? 0) - (timeToMinutes(b.startTime) ?? 0);
  const byDay = (a: Routine, b: Routine) => weekdayIndex(a.weekday) - weekdayIndex(b.weekday);
  const byText = (selector: (item: Routine) => string) => (a: Routine, b: Routine) =>
    normalizeCase(selector(a)).localeCompare(normalizeCase(selector(b)), "pt-BR");

  const sorters: Record<SortOption, (a: Routine, b: Routine) => number> = {
    "weekday-time": (a, b) => byDay(a, b) || byTime(a, b) || byText((item) => item.teacher)(a, b),
    time: (a, b) => byTime(a, b) || byDay(a, b),
    subject: (a, b) => byText((item) => item.subject)(a, b) || byDay(a, b) || byTime(a, b),
    teacher: (a, b) => byText((item) => item.teacher)(a, b) || byDay(a, b) || byTime(a, b),
    room: (a, b) => byText((item) => item.room)(a, b) || byDay(a, b) || byTime(a, b),
    device: (a, b) => byText((item) => item.devices[0] ?? "")(a, b) || byDay(a, b) || byTime(a, b),
  };

  return copy.sort(sorters[sortBy] ?? sorters["weekday-time"]);
}

export function filterRoutines(routines: Routine[], query: unknown): Routine[] {
  const normalizedQuery = normalizeCase(query);
  if (!normalizedQuery) return routines;

  return routines.filter((routine) => {
    const haystack = [
      routine.teacher,
      routine.subject,
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

export function normalizeState(candidate: unknown): AppState {
  const parsed = RawStateSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new Error("Arquivo de dados inválido.");
  }

  const raw = parsed.data;
  const base = createEmptyState();
  const state: AppState = {
    ...base,
    schemaVersion: SCHEMA_VERSION,
    routines: [],
    teachers: normalizeCatalogCollection<Teacher>(raw.teachers, "teacher"),
    rooms: normalizeRoomCollection(raw.rooms),
    devices: normalizeCatalogCollection<Device>(raw.devices, "device"),
    passwords: normalizeAndSeedPasswords(raw.passwords),
    maintenanceRecords: normalizeMaintenanceCollection(raw.maintenanceRecords),
    settings: normalizeSettings(raw.settings, base.settings, raw.schemaVersion),
    meta: {
      createdAt: normalizeText(readObjectField(raw.meta, "createdAt")) || base.meta.createdAt,
      updatedAt: nowIso(),
    },
  };

  if (state.devices.length === 0) {
    state.devices = base.devices;
  }

  const routineErrors: string[] = [];
  const routineIds = new Set<string>();
  if (Array.isArray(raw.routines)) {
    raw.routines.forEach((routine, index) => {
      const routineRecord = toRecord(routine);
      const normalized = buildRoutine(routineRecord as unknown as RoutinePayload, {
        id: normalizeText(routineRecord.id) || createId("routine"),
        createdAt: normalizeText(routineRecord.createdAt) || nowIso(),
      });

      if (!normalized.ok) {
        routineErrors.push(`Rotina ${index + 1}: ${normalized.errors.join(" ")}`);
        return;
      }

      let routineId = normalizeText(routineRecord.id) || normalized.value.id;
      if (routineIds.has(routineId)) {
        routineId = createId("routine");
      }
      routineIds.add(routineId);

      state.routines.push({
        ...normalized.value,
        id: routineId,
        createdAt: normalizeText(routineRecord.createdAt) || normalized.value.createdAt,
        updatedAt: normalizeText(routineRecord.updatedAt) || normalized.value.updatedAt,
      });
    });
  }

  if (routineErrors.length > 0) {
    throw new Error(routineErrors.join("\n"));
  }

  return state;
}

export function migrateState(raw: unknown): AppState {
  return normalizeState(raw);
}

export function normalizeCatalogPayload(
  kind: "teachers" | "rooms" | "devices",
  payload: CatalogPayload,
): Result<{ name: string; extra: { studentCount?: number | null } }> {
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

export function singularKind(kind: "teachers" | "rooms" | "devices"): SingularCatalogKind {
  const kinds: Record<"teachers" | "rooms" | "devices", SingularCatalogKind> = {
    teachers: "teacher",
    rooms: "room",
    devices: "device",
  };
  return kinds[kind];
}

function normalizeCatalogCollection<T extends CatalogItem>(
  items: unknown,
  type: SingularCatalogKind,
): T[] {
  if (!Array.isArray(items)) return [];

  const seen = new Set<string>();
  const seenIds = new Set<string>();
  const timestamp = nowIso();

  return items.reduce<T[]>((result, item) => {
    const itemRecord = toRecord(item);
    const name = normalizeText(typeof item === "string" ? item : itemRecord.name);
    const key = normalizeCase(name);
    if (!name || seen.has(key)) return result;
    seen.add(key);
    let id = normalizeText(itemRecord.id) || createId(type);
    if (seenIds.has(id)) {
      id = createId(type);
    }
    seenIds.add(id);

    result.push({
      id,
      name,
      createdAt: normalizeText(itemRecord.createdAt) || timestamp,
      updatedAt: normalizeText(itemRecord.updatedAt) || timestamp,
    } as T);

    return result;
  }, []);
}

function normalizeRoomCollection(items: unknown): Room[] {
  if (!Array.isArray(items)) return [];

  const seen = new Set<string>();
  const seenIds = new Set<string>();
  const timestamp = nowIso();

  return items.reduce<Room[]>((result, item) => {
    const itemRecord = toRecord(item);
    const name = normalizeText(typeof item === "string" ? item : itemRecord.name);
    const key = normalizeCase(name);
    if (!name || seen.has(key)) return result;
    seen.add(key);
    let id = normalizeText(itemRecord.id) || createId("room");
    if (seenIds.has(id)) {
      id = createId("room");
    }
    seenIds.add(id);

    const count = validateRoomCount(itemRecord.studentCount);

    result.push({
      id,
      name,
      studentCount: count.ok ? count.value : null,
      createdAt: normalizeText(itemRecord.createdAt) || timestamp,
      updatedAt: normalizeText(itemRecord.updatedAt) || timestamp,
    });

    return result;
  }, []);
}

function normalizeSettings(settings: unknown, defaults: Settings, _schemaVersion: unknown): Settings {
  const settingsRecord = toRecord(settings);
  const sortBy = SORT_OPTIONS.some((option) => option.value === settingsRecord.sortBy)
    ? (settingsRecord.sortBy as SortOption)
    : defaults.sortBy;

  return {
    sortBy,
    filterText: normalizeText(settingsRecord.filterText),
  };
}

function readObjectField(value: unknown, key: string): unknown {
  return toRecord(value)[key];
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function normalizeAndSeedPasswords(raw: unknown): Password[] {
  const parsed = normalizePasswordCollection(raw);
  const existingIds = new Set(parsed.map((p) => p.id));
  const missing = DEFAULT_PASSWORDS.filter((seed) => !existingIds.has(seed.id));
  return [...parsed, ...missing];
}

function normalizePasswordCollection(items: unknown): Password[] {
  if (!Array.isArray(items)) return [];
  const timestamp = nowIso();
  const seenIds = new Set<string>();

  return items.reduce<Password[]>((result, item) => {
    const rec = toRecord(item);
    const id = normalizeText(rec.id);
    if (!id || seenIds.has(id)) return result;
    seenIds.add(id);

    result.push({
      id,
      title: normalizeText(rec.title),
      username: normalizeText(rec.username),
      secret: normalizeText(rec.secret),
      description: normalizeText(rec.description),
      createdAt: normalizeText(rec.createdAt) || timestamp,
      updatedAt: normalizeText(rec.updatedAt) || timestamp,
    });
    return result;
  }, []);
}

export function isMaintenancePriority(value: unknown): value is MaintenancePriority {
  return MAINTENANCE_PRIORITIES.some((p) => p.value === value);
}

export function isMaintenanceStatus(value: unknown): value is MaintenanceStatus {
  return MAINTENANCE_STATUSES.some((s) => s.value === value);
}

export function getMaintenancePriorityLabel(value: unknown): string {
  return MAINTENANCE_PRIORITIES.find((p) => p.value === value)?.label ?? "";
}

export function getMaintenanceStatusLabel(value: unknown): string {
  return MAINTENANCE_STATUSES.find((s) => s.value === value)?.label ?? "";
}

export function getMaintenanceStatusTone(value: unknown): string {
  return MAINTENANCE_STATUSES.find((s) => s.value === value)?.tone ?? "neutral";
}

export function buildMaintenanceRecord(
  payload: MaintenancePayload,
  existingRecords: MaintenanceRecord[],
  existing: Pick<MaintenanceRecord, "id" | "createdAt" | "history"> | null = null,
): Result<MaintenanceRecord> {
  const errors: string[] = [];
  const equipmentId = normalizeText(payload.equipmentId);
  const type = normalizeText(payload.type);
  const brandModel = normalizeText(payload.brandModel);
  const location = normalizeText(payload.location);
  const mainProblem = normalizeText(payload.mainProblem);
  const technicalDescription = normalizeText(payload.technicalDescription);
  const priority = normalizeText(payload.priority);
  const status = normalizeText(payload.status);
  const ticketNumber = normalizeText(payload.ticketNumber);
  const responsibleContact = normalizeText(payload.responsibleContact);
  const actionsTaken = normalizeText(payload.actionsTaken);
  const notes = normalizeText(payload.notes);

  if (!equipmentId) {
    errors.push("Informe o número/identificador do equipamento.");
  } else if (equipmentId.length > 60) {
    errors.push("O identificador deve ter no máximo 60 caracteres.");
  }

  if (!type) {
    errors.push("Informe o tipo do equipamento.");
  }

  if (!mainProblem) {
    errors.push("Descreva o problema principal.");
  }

  if (!isMaintenancePriority(priority)) {
    errors.push("Escolha uma prioridade válida.");
  }

  if (!isMaintenanceStatus(status)) {
    errors.push("Escolha um status válido.");
  }

  if (equipmentId) {
    const key = normalizeCase(equipmentId);
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
  const history = existing?.history ? [...existing.history] : [];

  return {
    ok: true,
    value: {
      id: existing?.id ?? createId("maintenance"),
      equipmentId,
      type,
      brandModel,
      location,
      mainProblem,
      technicalDescription,
      priority: priority as MaintenancePriority,
      status: status as MaintenanceStatus,
      ticketNumber,
      responsibleContact,
      actionsTaken,
      notes,
      history,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    },
  };
}

export function appendMaintenanceHistory(
  record: MaintenanceRecord,
  message: string,
): MaintenanceRecord {
  const text = normalizeText(message);
  if (!text) return record;

  const entry: MaintenanceHistoryEntry = {
    id: createId("history"),
    at: nowIso(),
    message: text,
  };

  return { ...record, history: [...record.history, entry] };
}

export function describeMaintenanceChanges(
  previous: MaintenanceRecord,
  next: MaintenanceRecord,
): string[] {
  const messages: string[] = [];

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
  if (previous.status !== next.status && next.status === "resolvido") {
    messages.push("Marcado como resolvido.");
  }

  return messages;
}

export function filterMaintenance(
  records: MaintenanceRecord[],
  query: unknown,
): MaintenanceRecord[] {
  const normalizedQuery = normalizeCase(query);
  if (!normalizedQuery) return records;

  return records.filter((record) => {
    const haystack = [
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
    ]
      .join(" ")
      .toLocaleLowerCase("pt-BR");

    return haystack.includes(normalizedQuery);
  });
}

function normalizeMaintenanceCollection(items: unknown): MaintenanceRecord[] {
  if (!Array.isArray(items)) return [];

  const result: MaintenanceRecord[] = [];
  const timestamp = nowIso();
  const seenIds = new Set<string>();
  const seenEquipmentIds = new Set<string>();

  items.forEach((item) => {
    const rec = toRecord(item);
    const equipmentId = normalizeText(rec.equipmentId);
    if (!equipmentId) return;
    const equipmentKey = normalizeCase(equipmentId);
    if (seenEquipmentIds.has(equipmentKey)) return;
    seenEquipmentIds.add(equipmentKey);

    let id = normalizeText(rec.id) || createId("maintenance");
    if (seenIds.has(id)) id = createId("maintenance");
    seenIds.add(id);

    const priority = isMaintenancePriority(rec.priority) ? rec.priority : "media";
    const status = isMaintenanceStatus(rec.status) ? rec.status : "com-problema";

    result.push({
      id,
      equipmentId,
      type: normalizeText(rec.type),
      brandModel: normalizeText(rec.brandModel),
      location: normalizeText(rec.location),
      mainProblem: normalizeText(rec.mainProblem),
      technicalDescription: normalizeText(rec.technicalDescription),
      priority,
      status,
      ticketNumber: normalizeText(rec.ticketNumber),
      responsibleContact: normalizeText(rec.responsibleContact),
      actionsTaken: normalizeText(rec.actionsTaken),
      notes: normalizeText(rec.notes),
      history: normalizeMaintenanceHistory(rec.history),
      createdAt: normalizeText(rec.createdAt) || timestamp,
      updatedAt: normalizeText(rec.updatedAt) || timestamp,
    });
  });

  return result;
}

function normalizeMaintenanceHistory(value: unknown): MaintenanceHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  const result: MaintenanceHistoryEntry[] = [];
  value.forEach((item) => {
    const rec = toRecord(item);
    const message = normalizeText(rec.message);
    if (!message) return;
    result.push({
      id: normalizeText(rec.id) || createId("history"),
      at: normalizeText(rec.at) || nowIso(),
      message,
    });
  });
  return result;
}

export function validatePasswordPayload(
  payload: PasswordPayload,
  existingId?: string,
  existingCreatedAt?: string,
): Result<Password> {
  const errors: string[] = [];
  const title = normalizeText(payload.title);
  const secret = normalizeText(payload.secret);
  const username = normalizeText(payload.username);
  const description = normalizeText(payload.description);

  if (!title) errors.push("Informe o título da senha.");
  if (title.length > 120) errors.push("O título deve ter no máximo 120 caracteres.");
  if (!secret) errors.push("Informe a senha.");

  if (errors.length > 0) return resultFailure(errors);

  const timestamp = nowIso();
  return {
    ok: true,
    value: {
      id: existingId ?? createId("password"),
      title,
      username,
      secret,
      description,
      createdAt: existingCreatedAt ?? timestamp,
      updatedAt: timestamp,
    },
  };
}
