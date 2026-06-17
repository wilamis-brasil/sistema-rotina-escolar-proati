// @ts-check

// Limites operacionais da aplicação. Valores centralizados para manter
// validação, importação e notificações coerentes.

// Importação
export const IMPORT_MAX_BYTES = 1_048_576;

// Coleções
export const MAX_ROUTINES = 500;
export const MAX_TEACHERS = 250;
export const MAX_CLASSES = 320;
export const MAX_DEVICES = 200;
export const MAX_MAINTENANCES = 500;
export const MAX_NOTIFICATION_LOG = 1_000;
export const MAX_DEVICES_PER_ROUTINE = 20;
export const MAX_MAINTENANCE_BATCH = 50;

// Notificações
export const NOTIF_LEAD_MIN = 0;
export const NOTIF_LEAD_MAX = 240;
export const NOTIF_GROUP_MIN = 0;
export const NOTIF_GROUP_MAX = 60;
export const NOTIF_SNOOZE_MIN = 1;
export const NOTIF_SNOOZE_MAX = 120;
export const NOTIF_TRIGGER_WINDOW = 60;
export const NOTIF_RECENT_DELAY_WINDOW = 240;
export const NOTIF_TICK_INTERVAL_S = 30;
export const NOTIF_POPUP_FADE_S = 60;
export const NOTIF_POPUP_AUTOCLOSE_S = 90;
