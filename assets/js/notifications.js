import { WEEKDAYS, getWeekdayLabel, timeToMinutes } from "./model.js";

const MAX_TIMEOUT_MS = 2147483647;
const ALARM_SOUND_URL = "./alarme.mp3";

export function createNotificationManager({ getState, onAlert, onAlarm, onSoundBlocked, onStatusChange }) {
  let timers = [];
  let activeAudio = null;

  function getPermissionState() {
    if (!("Notification" in window)) return "unsupported";
    return Notification.permission;
  }

  function clearTimers() {
    timers.forEach((timerId) => window.clearTimeout(timerId));
    timers = [];
  }

  function stopSound() {
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

  async function requestPermission() {
    if (!("Notification" in window)) {
      notifyStatus();
      return { ok: false, message: "Este navegador não suporta Notification API." };
    }

    const permission = await Notification.requestPermission();
    notifyStatus();
    return {
      ok: permission === "granted",
      message: permission === "granted" ? "Permissão de notificações concedida." : "Permissão de notificações não concedida.",
    };
  }

  function notifyStatus() {
    onStatusChange?.(getStatus());
  }

  function getStatus() {
    const state = getState();
    const permission = getPermissionState();

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

  function reschedule() {
    clearTimers();
    const state = getState();

    if (!state.settings.notificationsEnabled) {
      notifyStatus();
      return;
    }

    state.routines.forEach((routine) => {
      if (!routine.notificationEnabled) return;

      const leadMinutes = Number.isInteger(routine.leadMinutes)
        ? routine.leadMinutes
        : state.settings.defaultLeadMinutes;

      if (leadMinutes > 0) {
        scheduleRoutineAlert(routine, "lead", leadMinutes);
      }
      scheduleRoutineAlert(routine, "exact", 0);
    });

    notifyStatus();
  }

  function scheduleRoutineAlert(routine, type, leadMinutes) {
    const when = nextOccurrence(routine.weekday, routine.startTime, leadMinutes);
    if (!when) return;

    const delay = when.getTime() - Date.now();
    if (delay < 0 || delay > MAX_TIMEOUT_MS) return;

    const timerId = window.setTimeout(() => {
      emitAlert(routine, type, leadMinutes);
      scheduleRoutineAlert(routine, type, leadMinutes);
    }, delay);

    timers.push(timerId);
  }

  function nextOccurrence(weekdayId, startTime, leadMinutes) {
    const targetDay = WEEKDAYS.find((day) => day.id === weekdayId);
    const startMinutes = timeToMinutes(startTime);
    if (!targetDay || startMinutes === null) return null;

    const now = new Date();
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

  function emitAlert(routine, type, leadMinutes) {
    const title = type === "lead"
      ? `PROATI: retirada em ${leadMinutes} min`
      : "PROATI: retirada agora";
    const body = `${getWeekdayLabel(routine.weekday)} ${routine.startTime} - ${routine.teacher}, ${routine.room}, ${routine.studentCount} aluno(s), ${routine.devices.join(", ")}.`;

    if ("Notification" in window && Notification.permission === "granted") {
      try {
        new Notification(title, {
          body,
          tag: `proati-${routine.id}-${type}`,
          renotify: true,
        });
      } catch (error) {
        console.error("Falha ao emitir notificação do navegador.", error);
      }
    }

    const alert = {
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

  function playAlarmSoundIfEnabled() {
    if (!getState().settings.soundEnabled) return;

    try {
      stopSound();
      activeAudio = new Audio(ALARM_SOUND_URL);
      activeAudio.preload = "auto";
      activeAudio.volume = 1;

      const playPromise = activeAudio.play();
      if (playPromise?.catch) {
        playPromise.catch((error) => {
          console.debug("Som de alerta bloqueado pelo navegador.", error);
          activeAudio = null;
          onSoundBlocked?.("O navegador bloqueou o alarme sonoro. Clique na página uma vez e mantenha o som ativado para os próximos alertas.");
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
