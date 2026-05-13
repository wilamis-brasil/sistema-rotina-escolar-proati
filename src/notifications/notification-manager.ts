import alarmSoundUrl from "../../assets/sounds/alarme.mp3?url";
import { getWeekdayLabel, timeToMinutes } from "../domain/model";
import { WEEKDAYS, type AppState, type NotificationAdapter, type StorageAdapter } from "../domain/types";

export const ALERT_STORAGE_KEY = "sistema-rotina-escolar-proati-alerts-v1";

const CHECK_INTERVAL_MS = 15_000;
const ALERT_WINDOW_MS = 60_000;
const DISPATCH_HISTORY_RETENTION_MS = 8 * 24 * 60 * 60 * 1000;

export interface AlertDetails {
  label: string;
  value: string;
}

export interface RoutineAlert {
  key: string;
  id: string;
  routineId: string;
  type: "lead" | "exact";
  title: string;
  body: string;
  createdAt: string;
  details: AlertDetails[];
}

export interface NotificationManager {
  acknowledgeAlert(key: string): void;
  clearTimers(): void;
  getStatus(): { type: "disabled" | "unsupported" | "denied" | "enabled" | "pending"; label: string };
  requestPermission(): Promise<{ ok: boolean; message: string }>;
  reschedule(): void;
  stopSound(): void;
}

export interface NotificationScheduler {
  setInterval(callback: () => void, delay: number): number;
  clearInterval(id: number): void;
  now(): number;
}

export interface AudioPlayer {
  pause(): void;
  currentTime: number;
  loop: boolean;
  preload: string;
  volume: number;
  play(): Promise<void> | void;
}

type StoredAlertStatus = "pending" | "acknowledged";

interface StoredAlertRecord {
  key: string;
  status: StoredAlertStatus;
  alert?: RoutineAlert;
  acknowledgedAt?: string;
  updatedAt: string;
}

interface StoredAlertState {
  version: 1;
  records: Record<string, StoredAlertRecord>;
}

interface AlertOccurrence {
  key: string;
  type: "lead" | "exact";
  triggerTime: Date;
  withdrawalDate: string;
  withdrawalTime: string;
}

export function createNotificationManager({
  getState,
  onAlert,
  onAlarm,
  onSoundBlocked,
  onStatusChange,
  notificationAdapter = createBrowserNotificationAdapter(),
  audioFactory = (url: string) => new Audio(url),
  alertStorage = createBrowserAlertStorage(),
  scheduler = createBrowserScheduler(),
}: {
  getState: () => AppState;
  onAlert?: (alert: RoutineAlert) => void;
  onAlarm?: (alert: RoutineAlert) => void;
  onSoundBlocked?: (message: string) => void;
  onStatusChange?: () => void;
  notificationAdapter?: NotificationAdapter;
  audioFactory?: (url: string) => AudioPlayer;
  alertStorage?: StorageAdapter | null;
  scheduler?: NotificationScheduler;
}): NotificationManager {
  let checkTimerId: number | null = null;
  let activeAudio: AudioPlayer | null = null;
  const dispatchedAlertKeys = new Map<string, number>();

  function clearTimers(): void {
    if (checkTimerId === null) return;
    scheduler.clearInterval(checkTimerId);
    checkTimerId = null;
  }

  function stopSound(): void {
    if (!activeAudio) return;

    try {
      activeAudio.pause();
      activeAudio.currentTime = 0;
    } catch (error) {
      console.debug("Não foi possível interromper o som de alerta.", error);
    } finally {
      activeAudio = null;
    }
  }

  function acknowledgeAlert(key: string): void {
    const timestamp = new Date(scheduler.now()).toISOString();
    const alertState = loadAlertState();
    const current = alertState.records[key];
    alertState.records[key] = {
      ...current,
      key,
      status: "acknowledged",
      acknowledgedAt: timestamp,
      updatedAt: timestamp,
    };
    saveAlertState(alertState);
    stopSound();
  }

  async function requestPermission(): Promise<{ ok: boolean; message: string }> {
    const permission = await notificationAdapter.requestPermission();
    notifyStatus();
    return {
      ok: permission === "granted",
      message:
        permission === "unsupported"
          ? "Este navegador não suporta Notification API. Alertas visuais continuam ativos."
          : permission === "granted"
            ? "Permissão de notificações concedida."
            : "Permissão de notificações não concedida. Alertas visuais continuam ativos.",
    };
  }

  function notifyStatus(): void {
    onStatusChange?.();
  }

  function getStatus(): ReturnType<NotificationManager["getStatus"]> {
    const state = getState();
    const permission = notificationAdapter.permission();

    if (!state.settings.notificationsEnabled) {
      return { type: "disabled", label: "Alertas pausados" };
    }

    if (permission === "unsupported") {
      return { type: "unsupported", label: "Alertas visuais ativos" };
    }

    if (permission === "denied") {
      return { type: "denied", label: "Permissão bloqueada; alertas visuais ativos" };
    }

    if (permission === "granted") {
      return { type: "enabled", label: "Notificações ativas" };
    }

    return { type: "pending", label: "Permitir notificações do navegador" };
  }

  function reschedule(): void {
    clearTimers();
    const state = getState();

    if (!state.settings.notificationsEnabled) {
      notifyStatus();
      return;
    }

    emitStoredPendingAlerts(state);
    checkDueAlerts();
    checkTimerId = scheduler.setInterval(checkDueAlerts, CHECK_INTERVAL_MS);
    notifyStatus();
  }

  function checkDueAlerts(): void {
    const state = getState();
    if (!state.settings.notificationsEnabled) return;

    const now = new Date(scheduler.now());
    pruneDispatchedAlertKeys(now.getTime());

    state.routines.forEach((routine) => {
      if (!routine.notificationEnabled) return;
      emitDueAlert(routine, resolveLeadMinutes(routine, state), now);
    });
  }

  function resolveLeadMinutes(routine: AppState["routines"][number], state: AppState): number {
    return typeof routine.leadMinutes === "number" ? routine.leadMinutes : state.settings.defaultLeadMinutes;
  }

  function emitDueAlert(
    routine: AppState["routines"][number],
    leadMinutes: number,
    now: Date,
  ): void {
    const occurrence = dueAlertOccurrence(routine, leadMinutes, now);
    if (!occurrence) return;

    const record = loadAlertState().records[occurrence.key];
    if (record?.status === "acknowledged") return;
    if (dispatchedAlertKeys.has(occurrence.key)) return;

    const alert = record?.status === "pending" && record.alert
      ? record.alert
      : buildAlert(routine, occurrence.type, leadMinutes, occurrence);

    markAlertPending(alert);
    emitAlert(alert, occurrence.triggerTime);
  }

  function emitStoredPendingAlerts(state: AppState): void {
    const routineIds = new Set(state.routines.map((routine) => routine.id));

    Object.values(loadAlertState().records).forEach((record) => {
      if (record.status !== "pending" || !record.alert) return;
      if (!routineIds.has(record.alert.routineId)) return;
      if (dispatchedAlertKeys.has(record.key)) return;
      emitAlert(record.alert, new Date(scheduler.now()));
    });
  }

  function buildAlert(
    routine: AppState["routines"][number],
    type: "lead" | "exact",
    leadMinutes: number,
    occurrence: AlertOccurrence,
  ): RoutineAlert {
    const title = type === "lead" ? `PROATI: retirada em ${leadMinutes} min` : "PROATI: retirada agora";
    const body = `${getWeekdayLabel(routine.weekday)} ${routine.startTime} - ${routine.teacher}, ${routine.room}, ${routine.studentCount} aluno(s), ${routine.devices.join(", ")}.`;

    return {
      key: occurrence.key,
      id: occurrence.key,
      routineId: routine.id,
      type,
      title,
      body,
      createdAt: new Date(scheduler.now()).toISOString(),
      details: [
        { label: "Dia", value: getWeekdayLabel(routine.weekday) },
        { label: "Data", value: occurrence.withdrawalDate },
        { label: "Horário", value: occurrence.withdrawalTime },
        { label: "Professor", value: routine.teacher },
        { label: "Sala/turma", value: routine.room },
        { label: "Alunos", value: `${routine.studentCount} aluno(s)` },
        { label: "Dispositivos", value: routine.devices.join(", ") },
      ],
    };
  }

  function emitAlert(alert: RoutineAlert, triggerTime: Date): void {
    if (dispatchedAlertKeys.has(alert.key)) return;
    dispatchedAlertKeys.set(alert.key, scheduler.now());

    if (notificationAdapter.permission() === "granted") {
      try {
        notificationAdapter.show(alert.title, {
          body: alert.body,
          tag: `proati-${alert.key}`,
          renotify: true,
        } as NotificationOptions);
      } catch (error) {
        console.error("Falha ao emitir notificação do navegador.", error);
      }
    }

    playAlarmSoundIfEnabled();
    (onAlarm ?? onAlert)?.({
      ...alert,
      createdAt: new Date(Math.max(new Date(alert.createdAt).getTime(), triggerTime.getTime())).toISOString(),
    });
  }

  function markAlertPending(alert: RoutineAlert): void {
    const alertState = loadAlertState();
    const current = alertState.records[alert.key];
    if (current?.status === "acknowledged") return;

    alertState.records[alert.key] = {
      key: alert.key,
      status: "pending",
      alert,
      updatedAt: new Date(scheduler.now()).toISOString(),
    };
    saveAlertState(alertState);
  }

  function loadAlertState(): StoredAlertState {
    if (!alertStorage) return createEmptyAlertState();

    try {
      const raw = alertStorage.getItem(ALERT_STORAGE_KEY);
      if (!raw) return createEmptyAlertState();

      const parsed = JSON.parse(raw) as Partial<StoredAlertState>;
      const records = parsed.records && typeof parsed.records === "object" ? parsed.records : {};

      return {
        version: 1,
        records: Object.values(records).reduce<Record<string, StoredAlertRecord>>((result, record) => {
          if (!isStoredAlertRecord(record)) return result;
          result[record.key] = record;
          return result;
        }, {}),
      };
    } catch (error) {
      console.debug("Não foi possível carregar estado local de alertas.", error);
      return createEmptyAlertState();
    }
  }

  function saveAlertState(alertState: StoredAlertState): void {
    if (!alertStorage) return;

    try {
      alertStorage.setItem(ALERT_STORAGE_KEY, JSON.stringify(pruneStoredAlertState(alertState, scheduler.now())));
    } catch (error) {
      console.debug("Não foi possível salvar estado local de alertas.", error);
    }
  }

  function pruneDispatchedAlertKeys(nowMs: number): void {
    dispatchedAlertKeys.forEach((createdAtMs, key) => {
      if (nowMs - createdAtMs > DISPATCH_HISTORY_RETENTION_MS) {
        dispatchedAlertKeys.delete(key);
      }
    });
  }

  function playAlarmSoundIfEnabled(): void {
    if (!getState().settings.soundEnabled) return;

    try {
      stopSound();
      activeAudio = audioFactory(alarmSoundUrl);
      activeAudio.loop = true;
      activeAudio.preload = "auto";
      activeAudio.volume = 1;

      const playPromise = activeAudio.play();
      if (playPromise?.catch) {
        playPromise.catch((error) => {
          console.debug("Som de alerta bloqueado pelo navegador.", error);
          activeAudio = null;
          onSoundBlocked?.(
            "O navegador bloqueou o alarme sonoro. Clique na página uma vez e mantenha o som ativado para os próximos alertas.",
          );
        });
      }
    } catch (error) {
      console.debug("Som de alerta bloqueado pelo navegador.", error);
      activeAudio = null;
      onSoundBlocked?.("Não foi possível tocar o arquivo alarme.mp3. O alerta visual continua ativo.");
    }
  }

  return {
    acknowledgeAlert,
    clearTimers,
    getStatus,
    requestPermission,
    reschedule,
    stopSound,
  };
}

export function nextOccurrence(
  weekdayId: string,
  startTime: string,
  leadMinutes: number,
  now = new Date(),
): Date | null {
  const targetDay = WEEKDAYS.find((day) => day.id === weekdayId);
  const startMinutes = timeToMinutes(startTime);
  if (!targetDay || startMinutes === null) return null;

  const currentDay = now.getDay();
  const dayDistance = (targetDay.jsDay - currentDay + 7) % 7;
  const occurrence = new Date(now);
  occurrence.setDate(now.getDate() + dayDistance);
  occurrence.setHours(0, startMinutes, 0, 0);
  occurrence.setMinutes(occurrence.getMinutes() - leadMinutes);

  if (occurrence.getTime() <= now.getTime()) {
    occurrence.setDate(occurrence.getDate() + 7);
  }

  return occurrence;
}

function dueAlertOccurrence(
  routine: AppState["routines"][number],
  leadMinutes: number,
  now: Date,
): AlertOccurrence | null {
  const targetDay = WEEKDAYS.find((day) => day.id === routine.weekday);
  const startMinutes = timeToMinutes(routine.startTime);
  if (!targetDay || startMinutes === null) return null;

  const nowMs = now.getTime();
  for (let dayOffset = -1; dayOffset <= 7; dayOffset += 1) {
    const withdrawalTime = new Date(now);
    withdrawalTime.setHours(0, 0, 0, 0);
    withdrawalTime.setDate(withdrawalTime.getDate() + dayOffset);
    if (withdrawalTime.getDay() !== targetDay.jsDay) continue;

    withdrawalTime.setHours(0, startMinutes, 0, 0);

    const triggerTime = new Date(withdrawalTime);
    triggerTime.setMinutes(triggerTime.getMinutes() - leadMinutes);

    const triggerMs = triggerTime.getTime();
    const endMs = leadMinutes > 0 ? withdrawalTime.getTime() : withdrawalTime.getTime() + ALERT_WINDOW_MS;
    if (nowMs < triggerMs || nowMs > endMs) continue;

    const withdrawalDate = localDateKey(withdrawalTime);
    return {
      key: alertDispatchKey(routine.id, withdrawalDate, routine.startTime),
      type: leadMinutes > 0 ? "lead" : "exact",
      triggerTime,
      withdrawalDate,
      withdrawalTime: routine.startTime,
    };
  }

  return null;
}

function alertDispatchKey(routineId: string, withdrawalDate: string, startTime: string): string {
  return `${routineId}|${withdrawalDate}|${startTime}`;
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createEmptyAlertState(): StoredAlertState {
  return { version: 1, records: {} };
}

function isStoredAlertRecord(value: unknown): value is StoredAlertRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<StoredAlertRecord>;
  return (
    typeof record.key === "string" &&
    (record.status === "pending" || record.status === "acknowledged") &&
    typeof record.updatedAt === "string"
  );
}

function pruneStoredAlertState(alertState: StoredAlertState, nowMs: number): StoredAlertState {
  return {
    version: 1,
    records: Object.values(alertState.records).reduce<Record<string, StoredAlertRecord>>((records, record) => {
      const updatedAtMs = new Date(record.updatedAt).getTime();
      if (Number.isFinite(updatedAtMs) && nowMs - updatedAtMs > DISPATCH_HISTORY_RETENTION_MS) {
        return records;
      }
      records[record.key] = record;
      return records;
    }, {}),
  };
}

function createBrowserScheduler(): NotificationScheduler {
  return {
    setInterval(callback, delay) {
      return window.setInterval(callback, delay);
    },
    clearInterval(id) {
      window.clearInterval(id);
    },
    now() {
      return Date.now();
    },
  };
}

function createBrowserNotificationAdapter(): NotificationAdapter {
  return {
    permission() {
      if (!("Notification" in window)) return "unsupported";
      return Notification.permission;
    },
    async requestPermission() {
      if (!("Notification" in window)) return "unsupported";
      return Notification.requestPermission();
    },
    show(title, options) {
      new Notification(title, options);
    },
  };
}

function createBrowserAlertStorage(): StorageAdapter | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  return window.localStorage;
}
