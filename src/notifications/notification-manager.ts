import alarmSoundUrl from "../../assets/sounds/alarme.mp3?url";
import {
  getWeekdayLabel,
  timeToMinutes,
} from "../domain/model";
import { WEEKDAYS, type AppState, type NotificationAdapter } from "../domain/types";

const MAX_TIMEOUT_MS = 2_147_483_647;

export interface AlertDetails {
  label: string;
  value: string;
}

export interface RoutineAlert {
  id: string;
  routineId: string;
  type: "lead" | "exact";
  title: string;
  body: string;
  createdAt: string;
  details: AlertDetails[];
}

export interface NotificationManager {
  clearTimers(): void;
  getStatus(): { type: "disabled" | "unsupported" | "denied" | "enabled" | "pending"; label: string };
  requestPermission(): Promise<{ ok: boolean; message: string }>;
  reschedule(): void;
  stopSound(): void;
}

export interface NotificationScheduler {
  setTimeout(callback: () => void, delay: number): number;
  clearTimeout(id: number): void;
  now(): number;
}

export interface AudioPlayer {
  pause(): void;
  currentTime: number;
  preload: string;
  volume: number;
  play(): Promise<void> | void;
}

export function createNotificationManager({
  getState,
  onAlert,
  onAlarm,
  onSoundBlocked,
  onStatusChange,
  notificationAdapter = createBrowserNotificationAdapter(),
  audioFactory = (url: string) => new Audio(url),
  scheduler = createBrowserScheduler(),
}: {
  getState: () => AppState;
  onAlert?: (alert: RoutineAlert) => void;
  onAlarm?: (alert: RoutineAlert) => void;
  onSoundBlocked?: (message: string) => void;
  onStatusChange?: () => void;
  notificationAdapter?: NotificationAdapter;
  audioFactory?: (url: string) => AudioPlayer;
  scheduler?: NotificationScheduler;
}): NotificationManager {
  let timers: number[] = [];
  let activeAudio: AudioPlayer | null = null;

  function clearTimers(): void {
    timers.forEach((timerId) => scheduler.clearTimeout(timerId));
    timers = [];
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

  async function requestPermission(): Promise<{ ok: boolean; message: string }> {
    const permission = await notificationAdapter.requestPermission();
    notifyStatus();
    return {
      ok: permission === "granted",
      message:
        permission === "unsupported"
          ? "Este navegador não suporta Notification API."
          : permission === "granted"
            ? "Permissão de notificações concedida."
            : "Permissão de notificações não concedida.",
    };
  }

  function notifyStatus(): void {
    onStatusChange?.();
  }

  function getStatus(): ReturnType<NotificationManager["getStatus"]> {
    const state = getState();
    const permission = notificationAdapter.permission();

    if (!state.settings.notificationsEnabled) {
      return { type: "disabled", label: "Notificações desativadas" };
    }

    if (permission === "unsupported") {
      return { type: "unsupported", label: "Alertas visuais ativos" };
    }

    if (permission === "denied") {
      return { type: "denied", label: "Permissão bloqueada" };
    }

    if (permission === "granted") {
      return { type: "enabled", label: "Notificações ativas" };
    }

    return { type: "pending", label: "Permissão pendente" };
  }

  function reschedule(): void {
    clearTimers();
    const state = getState();

    if (!state.settings.notificationsEnabled) {
      notifyStatus();
      return;
    }

    state.routines.forEach((routine) => {
      if (!routine.notificationEnabled) return;

      const leadMinutes = typeof routine.leadMinutes === "number"
        ? routine.leadMinutes
        : state.settings.defaultLeadMinutes;

      if (leadMinutes > 0) {
        scheduleRoutineAlert(routine, "lead", leadMinutes);
      }
      scheduleRoutineAlert(routine, "exact", 0);
    });

    notifyStatus();
  }

  function scheduleRoutineAlert(
    routine: AppState["routines"][number],
    type: "lead" | "exact",
    leadMinutes: number,
  ): void {
    const when = nextOccurrence(routine.weekday, routine.startTime, leadMinutes, new Date(scheduler.now()));
    if (!when) return;

    const delay = when.getTime() - scheduler.now();
    if (delay < 0 || delay > MAX_TIMEOUT_MS) return;

    const timerId = scheduler.setTimeout(() => {
      emitAlert(routine, type, leadMinutes);
      scheduleRoutineAlert(routine, type, leadMinutes);
    }, delay);

    timers.push(timerId);
  }

  function emitAlert(
    routine: AppState["routines"][number],
    type: "lead" | "exact",
    leadMinutes: number,
  ): void {
    const title = type === "lead" ? `PROATI: retirada em ${leadMinutes} min` : "PROATI: retirada agora";
    const body = `${getWeekdayLabel(routine.weekday)} ${routine.startTime} - ${routine.teacher}, ${routine.room}, ${routine.studentCount} aluno(s), ${routine.devices.join(", ")}.`;

    if (notificationAdapter.permission() === "granted") {
      try {
        notificationAdapter.show(title, {
          body,
          tag: `proati-${routine.id}-${type}`,
          renotify: true,
        } as NotificationOptions);
      } catch (error) {
        console.error("Falha ao emitir notificação do navegador.", error);
      }
    }

    const alert: RoutineAlert = {
      id: `${routine.id}-${type}-${Date.now()}`,
      routineId: routine.id,
      type,
      title,
      body,
      createdAt: new Date().toISOString(),
      details: [
        { label: "Dia", value: getWeekdayLabel(routine.weekday) },
        { label: "Horário", value: routine.startTime },
        { label: "Professor", value: routine.teacher },
        { label: "Sala/turma", value: routine.room },
        { label: "Alunos", value: `${routine.studentCount} aluno(s)` },
        { label: "Dispositivos", value: routine.devices.join(", ") },
      ],
    };

    if (type === "exact") {
      playAlarmSoundIfEnabled();
      (onAlarm ?? onAlert)?.(alert);
      return;
    }

    onAlert?.(alert);
  }

  function playAlarmSoundIfEnabled(): void {
    if (!getState().settings.soundEnabled) return;

    try {
      stopSound();
      activeAudio = audioFactory(alarmSoundUrl);
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

  const targetMinutes = startMinutes - leadMinutes;
  const hours = Math.floor(targetMinutes / 60);
  const minutes = targetMinutes % 60;
  occurrence.setHours(hours, minutes, 0, 0);

  if (occurrence.getTime() <= now.getTime()) {
    occurrence.setDate(occurrence.getDate() + 7);
  }

  return occurrence;
}

function createBrowserScheduler(): NotificationScheduler {
  return {
    setTimeout(callback, delay) {
      return window.setTimeout(callback, delay);
    },
    clearTimeout(id) {
      window.clearTimeout(id);
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
