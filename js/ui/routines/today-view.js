import { formatDateTime, getTodayWeekdayId, getWeekdayLabel, sortRoutines, timeToMinutes } from "../../domain/model.js";
import { el, icon, replaceChildren, span } from "../dom.js";
import { actionButton, detailLine, metricItem } from "../ui-elements.js";
import {
  getCurrentMinutes,
  getRoutineStartMinutes,
  getVisibleSmartTodayRoutineGroups,
  isRoutineActiveNow,
  isRoutinePendingOrActive,
} from "./smart-today.js";

/** @typedef {import("../../domain/types.js").AppState} AppState */
/** @typedef {import("../../domain/types.js").Routine} Routine */
/** @typedef {import("./smart-today.js").SmartRoutineGroup} SmartRoutineGroup */

/**
 * Painel "Hoje": resumo, métricas e cartões inteligentes das retiradas do dia.
 * @param {{ refs: any, getState: () => AppState, callbacks: { onEdit: (r: Routine) => void, onDuplicate: (id: string) => void, onDelete: (id: string) => void | Promise<void>, onStartNewRoutine: () => void } }} deps
 */
export function createTodayView({ refs, getState, callbacks }) {
  function render() {
    const state = getState();
    const todayId = getTodayWeekdayId();

    if (!todayId) {
      refs.todaySummary.textContent = "Sábado e domingo ficam fora da rotina padrão.";
      replaceChildren(refs.todayRoutines, [todayEmptyState("Nenhuma retirada para o fim de semana.")]);
      return;
    }

    const todayRoutines = sortRoutines(state.routines.filter((routine) => routine.weekday === todayId), "time");
    const currentMinutes = getCurrentMinutes();
    const pendingRoutines = todayRoutines.filter((routine) => isRoutinePendingOrActive(routine, currentMinutes));
    const visibleGroups = getVisibleSmartTodayRoutineGroups(todayRoutines, currentMinutes);

    refs.todaySummary.textContent = todaySummaryText(todayRoutines.length, pendingRoutines, visibleGroups, currentMinutes);

    replaceChildren(
      refs.todayRoutines,
      visibleGroups.length
        ? visibleGroups.map((group) => smartRoutineCard(group))
        : [todayEmptyState(todayRoutines.length ? "Todas as retiradas de hoje já foram concluídas." : "Nenhuma rotina cadastrada para hoje.")],
    );
  }

  function renderMetrics() {
    const state = getState();
    const todayId = getTodayWeekdayId();
    const todayRoutines = todayId ? sortRoutines(state.routines.filter((routine) => routine.weekday === todayId), "time") : [];
    const currentMinutes = getCurrentMinutes();
    const pendingRoutines = todayRoutines.filter((routine) => isRoutinePendingOrActive(routine, currentMinutes));
    const activeRoutine = pendingRoutines.find((routine) => isRoutineActiveNow(routine, currentMinutes));
    const nextRoutine = activeRoutine
      ? { ...activeRoutine, startTime: "Agora" }
      : pendingRoutines.find((routine) => (getRoutineStartMinutes(routine) ?? 0) >= currentMinutes);

    replaceChildren(refs.todayMetrics, [
      metricItem("Retiradas hoje", pendingRoutines.length.toString(), pendingRoutines.length === 1 ? "pendente" : "pendentes"),
      metricItem("Próxima retirada", nextRoutine ? nextRoutine.startTime : "Livre", nextRoutine ? nextRoutine.room : "sem pendência"),
      metricItem("Rotinas na semana", state.routines.length.toString(), state.routines.length === 1 ? "rotina" : "rotinas"),
    ]);
  }

  /** @param {SmartRoutineGroup} group @returns {HTMLElement} */
  function smartRoutineCard(group) {
    if (group.routines.length === 1) {
      return routineCard(group.representative);
    }

    const routine = group.representative;
    const groupedLabel = group.routines.length === 2 ? "2 retiradas agrupadas" : `${group.routines.length} horários agrupados`;

    return el(
      "article",
      { className: "routine-card routine-card-smart" },
      [
        el("div", { className: "routine-card-top" }, [
          el("div", {}, [
            el("strong", { className: "routine-time", text: group.timeLabel }),
            el("span", { className: "routine-day", text: getWeekdayLabel(routine.weekday) }),
          ]),
          el("div", { className: "routine-group-status" }, [el("span", { className: "routine-group-badge", text: "Retiradas agrupadas" })]),
        ]),
        detailLine("user", routine.teacher),
        routine.subject ? detailLine("book-open-check", `Aula: ${routine.subject}`) : null,
        detailLine("map-pin", routine.room),
        detailLine("users", `${routine.studentCount} aluno(s)`),
        detailLine("laptop", routine.devices.join(", ")),
        routine.notes ? detailLine("file-text", routine.notes) : null,
        el("div", { className: "routine-meta" }, [
          el("span", { text: groupedLabel }),
          el("span", { text: `Atualizado em ${formatDateTime(latestRoutineUpdatedAt(group.routines))}` }),
        ]),
        el("p", { className: "routine-group-note" }, [icon("info"), span("Abra a Rotina semanal para editar cada retirada individualmente.")]),
      ].filter(Boolean),
    );
  }

  /** @param {Routine} routine @returns {HTMLElement} */
  function routineCard(routine) {
    const title = `${routine.startTime}${routine.endTime ? `-${routine.endTime}` : ""}`;
    const notifications = getState().settings.notifications;
    const notificationBadge = buildNotificationBadge(routine, notifications.enabled, notifications.defaultLeadMinutes);

    return el(
      "article",
      { className: "routine-card" },
      [
        el("div", { className: "routine-card-top" }, [
          el("div", {}, [
            el("strong", { className: "routine-time", text: title }),
            el("span", { className: "routine-day", text: getWeekdayLabel(routine.weekday) }),
          ]),
          el("div", { className: "routine-actions" }, [
            actionButton("copy", "Duplicar", "Duplicar esta rotina", () => callbacks.onDuplicate(routine.id)),
            actionButton("pencil", "Editar", "Editar esta rotina", () => callbacks.onEdit(routine)),
            actionButton("trash-2", "Excluir", "Excluir esta rotina", () => callbacks.onDelete(routine.id), "danger"),
          ]),
        ]),
        notificationBadge,
        detailLine("user", routine.teacher),
        routine.subject ? detailLine("book-open-check", `Aula: ${routine.subject}`) : null,
        detailLine("map-pin", routine.room),
        detailLine("users", `${routine.studentCount} aluno(s)`),
        detailLine("laptop", routine.devices.join(", ")),
        routine.notes ? detailLine("file-text", routine.notes) : null,
        el("div", { className: "routine-meta" }, [el("span", { text: `Atualizado em ${formatDateTime(routine.updatedAt)}` })]),
      ].filter(Boolean),
    );
  }

  /** @param {string} message @returns {HTMLElement} */
  function todayEmptyState(message) {
    const button = el("button", { className: "button button-primary button-small", attrs: { type: "button" } }, [icon("plus"), span("Cadastrar rotina")]);
    button.addEventListener("click", () => callbacks.onStartNewRoutine());

    return el("div", { className: "empty-state empty-state-action" }, [
      el("strong", { text: message }),
      el("span", { text: "Informe horário, professor, turma, alunos e equipamentos da retirada." }),
      button,
    ]);
  }

  return { render, renderMetrics };
}

/**
 * @param {number} totalTodayRoutines
 * @param {Routine[]} pendingRoutines
 * @param {SmartRoutineGroup[]} visibleGroups
 * @param {number} currentMinutes
 * @returns {string}
 */
function todaySummaryText(totalTodayRoutines, pendingRoutines, visibleGroups, currentMinutes) {
  if (pendingRoutines.length === 0) {
    return totalTodayRoutines > 0 ? "Todas as retiradas de hoje já foram concluídas." : "Nenhuma rotina cadastrada para hoje.";
  }

  const activeNow = pendingRoutines.some((routine) => isRoutineActiveNow(routine, currentMinutes));
  const nextRoutine = pendingRoutines.find((routine) => {
    const startMinutes = getRoutineStartMinutes(routine);
    if (startMinutes === null) return false;
    return activeNow ? startMinutes > currentMinutes : startMinutes >= currentMinutes;
  });
  const cardsLabel = visibleGroups.length === 1 ? "1 retirada em destaque." : `${visibleGroups.length} retiradas em destaque.`;
  const pendingLabel = pendingRoutines.length === 1 ? "1 retirada restante hoje." : `${pendingRoutines.length} retiradas restantes hoje.`;
  const nextLabel = activeNow
    ? nextRoutine
      ? `Retirada em andamento. Próxima às ${nextRoutine.startTime}.`
      : "Retirada em andamento."
    : nextRoutine
      ? `Próxima retirada às ${nextRoutine.startTime}.`
      : "";

  return [cardsLabel, pendingLabel, nextLabel].filter(Boolean).join(" ");
}

/** @param {Routine[]} routines @returns {string} */
function latestRoutineUpdatedAt(routines) {
  return routines.reduce((latest, routine) => (routine.updatedAt > latest ? routine.updatedAt : latest), routines[0]?.updatedAt ?? "");
}

/**
 * @param {Routine} routine @param {boolean} globalEnabled @param {number} defaultLead
 * @returns {HTMLElement | null}
 */
function buildNotificationBadge(routine, globalEnabled, defaultLead) {
  if (!globalEnabled) return null;
  if (routine.notification?.enabled === false) return null;
  const lead = typeof routine.notification?.leadMinutes === "number" ? routine.notification.leadMinutes : defaultLead;
  const startMinutes = timeToMinutes(routine.startTime);
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  let label = `Aviso ${lead > 0 ? `${lead} min antes` : "no início"}`;
  if (startMinutes !== null) {
    const fireMinutes = startMinutes - (lead > 0 ? lead : 0);
    if (currentMinutes >= startMinutes && (!routine.endTime || (timeToMinutes(routine.endTime) ?? startMinutes) > currentMinutes)) {
      label = "Retirada em andamento";
    } else if (currentMinutes >= fireMinutes && currentMinutes < startMinutes) {
      label = "Aviso ativo";
    }
  }

  return el("p", { className: "routine-notification-pill" }, [icon("bell-ring"), span(label)]);
}
