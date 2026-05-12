export const SCHEMA_VERSION = 1;
export const STORAGE_KEY = "kickoff-proati-state-v1";

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

export interface Routine {
  id: string;
  weekday: WeekdayId;
  startTime: string;
  endTime: string;
  teacher: string;
  room: string;
  studentCount: number;
  devices: string[];
  notes: string;
  notificationEnabled: boolean;
  leadMinutes: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  notificationsEnabled: boolean;
  defaultLeadMinutes: number;
  soundEnabled: boolean;
  sortBy: SortOption;
  filterText: string;
}

export interface AppState {
  schemaVersion: typeof SCHEMA_VERSION;
  routines: Routine[];
  teachers: Teacher[];
  rooms: Room[];
  devices: Device[];
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
  teacher: unknown;
  room: unknown;
  studentCount: unknown;
  devices: unknown;
  notes?: unknown;
  notificationEnabled?: unknown;
  leadMinutes?: unknown;
}

export interface CatalogPayload {
  name: unknown;
  studentCount?: unknown;
}

export type Result<T = void> = { ok: true; value: T } | { ok: false; errors: string[] };

export type EmptyResult = { ok: true } | { ok: false; errors: string[] };

export interface ImportExportResult {
  ok: boolean;
  errors?: string[];
  state?: AppState;
}

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface NotificationAdapter {
  permission(): NotificationPermission | "unsupported";
  requestPermission(): Promise<NotificationPermission | "unsupported">;
  show(title: string, options: NotificationOptions): void;
}

export interface AudioAdapter {
  play(url: string): Promise<{ stop(): void }>;
}
