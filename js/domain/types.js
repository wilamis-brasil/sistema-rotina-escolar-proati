// @ts-check

// Constantes de domínio e definições de tipo (via JSDoc) compartilhadas por toda
// a aplicação. Sem dependências: apenas dados e contratos.

export const SCHEMA_VERSION = 8;
export const STORAGE_KEY = "sistema-rotina-escolar-proati-state-v1";
export const LEGACY_STORAGE_KEYS = ["kickoff-proati-state-v1"];

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
  { value: "subject", label: "Aula" },
  { value: "teacher", label: "Professor" },
  { value: "room", label: "Turma" },
  { value: "device", label: "Equipamento" },
];

export const DEFAULT_DEVICE_NAMES = [
  "Notebook",
  "Chromebook",
  "Notebook/Chromebook",
  "Tablet",
  "Headset",
];

export const MAINTENANCE_PRIORITIES = [
  { value: "baixa", label: "Baixa" },
  { value: "media", label: "Média" },
  { value: "alta", label: "Alta" },
  { value: "urgente", label: "Urgente" },
];

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
];

export const NOTIFICATION_SOUNDS = [
  { value: "default", label: "Padrão" },
  { value: "soft", label: "Suave" },
  { value: "alert", label: "Alerta curto" },
  { value: "bell", label: "Sino" },
  { value: "none", label: "Nenhum" },
];

export const NOTIFICATION_LEAD_PRESETS = [5, 10, 15, 20, 30];

export const NOTIFICATION_TYPES = ["aviso_antecipado", "inicio", "termino"];

export const NOTIFICATION_STATUSES = [
  "pendente",
  "exibida",
  "vista",
  "adiada",
  "ignorada",
  "desativada",
];

/** @type {NotificationSettings} */
export const DEFAULT_NOTIFICATION_SETTINGS = {
  enabled: true,
  defaultLeadMinutes: 10,
  soundEnabled: false,
  soundName: "default",
  groupingEnabled: true,
  groupingWindowMinutes: 5,
  allowSnooze: true,
  defaultSnoozeMinutes: 5,
};

/**
 * @template [T=void]
 * @typedef {{ ok: true, value: T } | { ok: false, errors: string[] }} Result
 */

/** @typedef {{ ok: true } | { ok: false, errors: string[] }} EmptyResult */

/** @typedef {"monday" | "tuesday" | "wednesday" | "thursday" | "friday"} WeekdayId */
/** @typedef {"weekday-time" | "time" | "subject" | "teacher" | "room" | "device"} SortOption */
/** @typedef {"baixa" | "media" | "alta" | "urgente"} MaintenancePriority */
/** @typedef {"com-problema" | "em-analise" | "aguardando-chamado" | "chamado-aberto" | "aguardando-atendimento" | "em-manutencao" | "aguardando-peca" | "resolvido" | "sem-conserto" | "descartado"} MaintenanceStatus */
/** @typedef {"default" | "soft" | "alert" | "bell" | "none"} NotificationSoundId */
/** @typedef {"aviso_antecipado" | "inicio" | "termino"} NotificationType */
/** @typedef {"pendente" | "exibida" | "vista" | "adiada" | "ignorada" | "desativada"} NotificationStatus */
/** @typedef {"teachers" | "rooms" | "devices"} CatalogKind */
/** @typedef {"teacher" | "room" | "device"} SingularCatalogKind */

/**
 * @typedef {object} CatalogItem
 * @property {string} id
 * @property {string} name
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/** @typedef {CatalogItem} Teacher */
/** @typedef {CatalogItem} Device */
/** @typedef {CatalogItem & { studentCount: number | null }} Room */

/**
 * @typedef {object} RoutineNotificationOverride
 * @property {boolean} [enabled]
 * @property {number | null} [leadMinutes]
 */

/**
 * @typedef {object} Routine
 * @property {string} id
 * @property {WeekdayId} weekday
 * @property {string} startTime
 * @property {string} endTime
 * @property {string} subject
 * @property {string} teacher
 * @property {string} room
 * @property {number} studentCount
 * @property {string[]} devices
 * @property {string} notes
 * @property {RoutineNotificationOverride} [notification]
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {object} MaintenanceHistoryEntry
 * @property {string} id
 * @property {string} at
 * @property {string} message
 */

/**
 * @typedef {object} MaintenanceRecord
 * @property {string} id
 * @property {string} equipmentId
 * @property {string} type
 * @property {string} brandModel
 * @property {string} location
 * @property {string} mainProblem
 * @property {string} technicalDescription
 * @property {MaintenancePriority} priority
 * @property {MaintenanceStatus} status
 * @property {string} ticketNumber
 * @property {string} responsibleContact
 * @property {string} actionsTaken
 * @property {string} notes
 * @property {MaintenanceHistoryEntry[]} history
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {object} NotificationSettings
 * @property {boolean} enabled
 * @property {number} defaultLeadMinutes
 * @property {boolean} soundEnabled
 * @property {NotificationSoundId} soundName
 * @property {boolean} groupingEnabled
 * @property {number} groupingWindowMinutes
 * @property {boolean} allowSnooze
 * @property {number} defaultSnoozeMinutes
 */

/**
 * @typedef {object} NotificationLogEntry
 * @property {string} id
 * @property {NotificationStatus} status
 * @property {string} date
 * @property {NotificationType} type
 * @property {string} time
 * @property {string[]} routineIds
 * @property {string} updatedAt
 * @property {string} [snoozedUntil]
 */

/**
 * @typedef {object} Settings
 * @property {SortOption} sortBy
 * @property {string} filterText
 * @property {NotificationSettings} notifications
 */

/**
 * @typedef {object} AppState
 * @property {number} schemaVersion
 * @property {Routine[]} routines
 * @property {Teacher[]} teachers
 * @property {Room[]} rooms
 * @property {Device[]} devices
 * @property {MaintenanceRecord[]} maintenanceRecords
 * @property {NotificationLogEntry[]} notificationLog
 * @property {Settings} settings
 * @property {{ createdAt: string, updatedAt: string }} meta
 */

/**
 * @typedef {object} RoutinePayload
 * @property {unknown} weekday
 * @property {unknown} startTime
 * @property {unknown} [endTime]
 * @property {unknown} [subject]
 * @property {unknown} teacher
 * @property {unknown} room
 * @property {unknown} studentCount
 * @property {unknown} devices
 * @property {unknown} [notes]
 * @property {unknown} [notification]
 */

/**
 * @typedef {object} CatalogPayload
 * @property {unknown} name
 * @property {unknown} [studentCount]
 */

/**
 * @typedef {object} MaintenancePayload
 * @property {unknown} equipmentId
 * @property {unknown} type
 * @property {unknown} [brandModel]
 * @property {unknown} [location]
 * @property {unknown} mainProblem
 * @property {unknown} [technicalDescription]
 * @property {unknown} priority
 * @property {unknown} status
 * @property {unknown} [ticketNumber]
 * @property {unknown} [responsibleContact]
 * @property {unknown} [actionsTaken]
 * @property {unknown} [notes]
 */

/**
 * @typedef {object} StorageAdapter
 * @property {(key: string) => string | null} getItem
 * @property {(key: string, value: string) => void} setItem
 * @property {(key: string) => void} removeItem
 */
