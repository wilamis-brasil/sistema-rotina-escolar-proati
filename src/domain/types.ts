export const SCHEMA_VERSION = 5;
export const STORAGE_KEY = "sistema-rotina-escolar-proati-state-v1";
export const LEGACY_STORAGE_KEYS = ["kickoff-proati-state-v1"] as const;

export const WEEKDAYS = [
  { id: "monday", label: "Segunda-feira", shortLabel: "Seg", jsDay: 1 },
  { id: "tuesday", label: "Terça-feira", shortLabel: "Ter", jsDay: 2 },
  { id: "wednesday", label: "Quarta-feira", shortLabel: "Qua", jsDay: 3 },
  { id: "thursday", label: "Quinta-feira", shortLabel: "Qui", jsDay: 4 },
  { id: "friday", label: "Sexta-feira", shortLabel: "Sex", jsDay: 5 },
] as const;

export type WeekdayId = (typeof WEEKDAYS)[number]["id"];

export const SORT_OPTIONS = [
  { value: "weekday-time", label: "Dia e horário" },
  { value: "time", label: "Horário" },
  { value: "subject", label: "Aula" },
  { value: "teacher", label: "Professor" },
  { value: "room", label: "Sala/turma" },
  { value: "device", label: "Dispositivo" },
] as const;

export type SortOption = (typeof SORT_OPTIONS)[number]["value"];

export const DEFAULT_DEVICE_NAMES = [
  "Notebook",
  "Chromebook",
  "Notebook/Chromebook",
  "Tablet",
  "Headset",
] as const;

export const MAINTENANCE_PRIORITIES = [
  { value: "baixa", label: "Baixa" },
  { value: "media", label: "Média" },
  { value: "alta", label: "Alta" },
  { value: "urgente", label: "Urgente" },
] as const;

export type MaintenancePriority = (typeof MAINTENANCE_PRIORITIES)[number]["value"];

export const MAINTENANCE_STATUSES = [
  { value: "com-problema", label: "Com problema", tone: "warning" },
  { value: "em-analise", label: "Em análise", tone: "info" },
  { value: "aguardando-chamado", label: "Aguardando chamado", tone: "warning" },
  { value: "chamado-aberto", label: "Chamado aberto", tone: "info" },
  { value: "aguardando-atendimento", label: "Aguardando atendimento técnico", tone: "info" },
  { value: "em-manutencao", label: "Em manutenção", tone: "info" },
  { value: "aguardando-peca", label: "Aguardando peça/carregador/bateria", tone: "warning" },
  { value: "resolvido", label: "Resolvido", tone: "success" },
  { value: "sem-conserto", label: "Sem conserto", tone: "danger" },
  { value: "descartado", label: "Descartado/baixado", tone: "neutral" },
] as const;

export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number]["value"];

export interface CatalogItem {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export type Teacher = CatalogItem;

export interface Room extends CatalogItem {
  studentCount: number | null;
}

export type Device = CatalogItem;

export interface Password {
  id: string;
  title: string;
  username: string;
  secret: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface Routine {
  id: string;
  weekday: WeekdayId;
  startTime: string;
  endTime: string;
  subject: string;
  teacher: string;
  room: string;
  studentCount: number;
  devices: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface MaintenanceHistoryEntry {
  id: string;
  at: string;
  message: string;
}

export interface MaintenanceRecord {
  id: string;
  equipmentId: string;
  type: string;
  brandModel: string;
  location: string;
  mainProblem: string;
  technicalDescription: string;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  ticketNumber: string;
  responsibleContact: string;
  actionsTaken: string;
  notes: string;
  history: MaintenanceHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  sortBy: SortOption;
  filterText: string;
}

export interface AppState {
  schemaVersion: typeof SCHEMA_VERSION;
  routines: Routine[];
  teachers: Teacher[];
  rooms: Room[];
  devices: Device[];
  passwords: Password[];
  maintenanceRecords: MaintenanceRecord[];
  settings: Settings;
  meta: {
    createdAt: string;
    updatedAt: string;
  };
}

export type CatalogKind = "teachers" | "rooms" | "devices";
export type SingularCatalogKind = "teacher" | "room" | "device";

export interface RoutinePayload {
  weekday: unknown;
  startTime: unknown;
  endTime?: unknown;
  subject?: unknown;
  teacher: unknown;
  room: unknown;
  studentCount: unknown;
  devices: unknown;
  notes?: unknown;
}

export interface CatalogPayload {
  name: unknown;
  studentCount?: unknown;
}

export interface PasswordPayload {
  title: unknown;
  username?: unknown;
  secret: unknown;
  description?: unknown;
}

export interface MaintenancePayload {
  equipmentId: unknown;
  type: unknown;
  brandModel?: unknown;
  location?: unknown;
  mainProblem: unknown;
  technicalDescription?: unknown;
  priority: unknown;
  status: unknown;
  ticketNumber?: unknown;
  responsibleContact?: unknown;
  actionsTaken?: unknown;
  notes?: unknown;
}

export type Result<T = void> = { ok: true; value: T } | { ok: false; errors: string[] };

export type EmptyResult = { ok: true } | { ok: false; errors: string[] };

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
