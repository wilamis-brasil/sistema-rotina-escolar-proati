import { filterRoutines, sortRoutines } from "../../domain/model.js";
import { WEEKDAYS } from "../../domain/types.js";
import { el, option, qsa, replaceChildren, span } from "../dom.js";
import { refreshIcons } from "../icons.js";
import { iconButton, slug } from "../ui-elements.js";
import { buildWeekSchedule } from "../week-schedule.js";
import { clearWeekFilters, hasActiveFilters, readWeekFilters } from "./week-filters.js";

/** @typedef {import("../../domain/types.js").AppState} AppState */
/** @typedef {import("../../domain/types.js").Routine} Routine */
/** @typedef {import("../week-schedule.js").WeekScheduleCell} WeekScheduleCell */
/** @typedef {import("../week-schedule.js").WeekScheduleEntry} WeekScheduleEntry */
/** @typedef {import("../week-schedule.js").WeekScheduleSection} WeekScheduleSection */

/**
 * Grade semanal por equipamento, com filtros (texto, dia, horário, professor,
 * turma, equipamento) e ações por rotina.
 * @param {{ refs: any, getState: () => AppState, actions: any, callbacks: { onEdit: (r: Routine) => void, onDuplicate: (id: string) => void, onDelete: (id: string) => void | Promise<void> } }} deps
 */
export function createWeekView({ refs, getState, actions, callbacks }) {
  function bindEvents() {
    refs.routineFilter.addEventListener("input", () => {
      actions.updateUiFilters({ filterText: refs.routineFilter.value });
      applyFilters();
    });
    refs.routineSort.addEventListener("change", () => {
      actions.updateUiFilters({ sortBy: refs.routineSort.value });
      applyFilters();
    });
    qsa("#filter-weekday-chips input").forEach((cb) => cb.addEventListener("change", applyFilters));
    refs.filterTimeStart.addEventListener("change", applyFilters);
    refs.filterTimeEnd.addEventListener("change", applyFilters);
    refs.filterTeacher.addEventListener("change", applyFilters);
    refs.filterRoom.addEventListener("change", applyFilters);
    qsa("#filter-device-chips input").forEach((cb) => cb.addEventListener("change", applyFilters));
    refs.filterClearAll.addEventListener("click", () => {
      clearWeekFilters({ refs, actions });
      applyFilters();
    });
  }

  function render() {
    populateFilters();
    applyFilters();
  }

  function populateFilters() {
    const state = getState();

    const prevTeacher = refs.filterTeacher.value;
    replaceChildren(refs.filterTeacher, [option("", "Todos os professores"), ...state.teachers.map((t) => option(t.name, t.name))]);
    refs.filterTeacher.value = prevTeacher;

    const prevRoom = refs.filterRoom.value;
    replaceChildren(refs.filterRoom, [option("", "Todas as turmas"), ...state.rooms.map((r) => option(r.name, r.name))]);
    refs.filterRoom.value = prevRoom;

    const startTimes = [...new Set(state.routines.map((r) => r.startTime))].filter(Boolean).sort();
    const prevStart = refs.filterTimeStart.value;
    replaceChildren(refs.filterTimeStart, [option("", "Horário inicial"), ...startTimes.map((t) => option(t, t))]);
    refs.filterTimeStart.value = prevStart;

    const endTimes = [...new Set(state.routines.map((r) => r.endTime))].filter(Boolean).sort();
    const prevEnd = refs.filterTimeEnd.value;
    replaceChildren(refs.filterTimeEnd, [option("", "Horário final"), ...endTimes.map((t) => option(t, t))]);
    refs.filterTimeEnd.value = prevEnd;
  }

  function applyFilters() {
    const state = getState();
    const filters = readWeekFilters(refs);
    let routines = filterRoutines(state.routines, filters.filterText);

    if (filters.weekdays.size > 0) routines = routines.filter((r) => filters.weekdays.has(r.weekday));
    if (filters.timeStart) routines = routines.filter((r) => r.startTime >= filters.timeStart);
    if (filters.timeEnd) routines = routines.filter((r) => !r.endTime || r.endTime <= filters.timeEnd);
    if (filters.teacher) routines = routines.filter((r) => r.teacher === filters.teacher);
    if (filters.room) routines = routines.filter((r) => r.room === filters.room);
    if (filters.devices.size > 0) routines = routines.filter((r) => r.devices.some((d) => filters.devices.has(d)));

    const sorted = sortRoutines(routines, state.settings.sortBy);
    const schedule = buildWeekSchedule(sorted, state.devices);
    const routineById = new Map(sorted.map((r) => [r.id, r]));

    replaceChildren(
      refs.weekRoutines,
      schedule.sections.length ? schedule.sections.map((section) => renderEquipmentSection(section, routineById)) : [weeklyScheduleEmptyState()],
    );

    const total = state.routines.length;
    const shown = routines.length;
    refs.filterResultsCount.textContent =
      shown < total ? `${shown} de ${total} rotina${total !== 1 ? "s" : ""}` : `${total} rotina${total !== 1 ? "s" : ""}`;

    refs.filterClearAll.hidden = !hasActiveFilters(filters);
    refreshIcons(refs.weekRoutines);
  }

  /** @param {WeekScheduleSection} section @param {Map<string, Routine>} routineById @returns {HTMLElement} */
  function renderEquipmentSection(section, routineById) {
    const titleId = `schedule-equipment-${slug(section.deviceName)}`;

    return el("section", { className: "equipment-section", attrs: { "aria-labelledby": titleId } }, [
      el("header", { className: "equipment-section-header" }, [
        el("div", {}, [el("span", { className: "equipment-kicker", text: "Equipamento" }), el("h3", { text: section.deviceName, attrs: { id: titleId } })]),
        el("span", { className: "equipment-count", text: section.routineCount === 1 ? "1 retirada" : `${section.routineCount} retiradas` }),
      ]),
      el("div", { className: "schedule-table-wrap" }, [
        el("table", { className: "schedule-table" }, [
          renderScheduleColgroup(),
          renderScheduleHead(),
          el(
            "tbody",
            {},
            section.rows.map((row) =>
              el("tr", {}, [
                el("th", { className: "schedule-time-cell", text: row.timeLabel, attrs: { scope: "row" } }),
                ...row.cells.flatMap((cell) => renderScheduleDayCells(cell, routineById)),
              ]),
            ),
          ),
        ]),
      ]),
    ]);
  }

  /** @param {WeekScheduleCell} cell @param {Map<string, Routine>} routineById @returns {HTMLTableCellElement[]} */
  function renderScheduleDayCells(cell, routineById) {
    return [
      el(
        "td",
        { className: cell.entries.length ? "schedule-cell schedule-room-cell" : "schedule-cell schedule-room-cell is-empty" },
        cell.entries.length ? cell.entries.map(renderRoomEntry) : [span("")],
      ),
      el(
        "td",
        { className: cell.entries.length ? "schedule-cell schedule-teacher-cell" : "schedule-cell schedule-teacher-cell is-empty" },
        cell.entries.length ? cell.entries.map((entry) => renderTeacherEntry(entry, routineById)) : [span("")],
      ),
    ];
  }

  /** @param {WeekScheduleEntry} entry @param {Map<string, Routine>} routineById @returns {HTMLElement} */
  function renderTeacherEntry(entry, routineById) {
    const routine = routineById.get(entry.routineId);
    const notifications = getState().settings.notifications;
    const notificationLabel = routine ? buildNotificationHint(routine, notifications.enabled, notifications.defaultLeadMinutes) : null;

    return el("div", { className: "schedule-cell-entry schedule-teacher-entry" }, [
      el("strong", { text: entry.teacher }),
      entry.subject ? el("small", { text: `Aula: ${entry.subject}` }) : null,
      entry.notes ? el("small", { text: entry.notes }) : null,
      notificationLabel,
      routine ? scheduleEntryActions(routine) : null,
    ]);
  }

  /** @param {Routine} routine @returns {HTMLElement} */
  function scheduleEntryActions(routine) {
    const ariaContext = `${routine.startTime} · ${routine.room} · ${routine.teacher}`;
    return el("div", { className: "schedule-entry-actions" }, [
      iconButton("copy", `Duplicar rotina de ${ariaContext}`, () => callbacks.onDuplicate(routine.id)),
      iconButton("pencil", `Editar rotina de ${ariaContext}`, () => callbacks.onEdit(routine)),
      iconButton("trash-2", `Excluir rotina de ${ariaContext}`, () => callbacks.onDelete(routine.id), "danger"),
    ]);
  }

  return { bindEvents, render, applyFilters };
}

/** @returns {HTMLTableColElement} */
function renderScheduleColgroup() {
  return el("colgroup", {}, [
    el("col", { className: "schedule-time-col" }),
    ...WEEKDAYS.flatMap(() => [el("col", { className: "schedule-room-col" }), el("col", { className: "schedule-teacher-col" })]),
  ]);
}

/** @returns {HTMLTableSectionElement} */
function renderScheduleHead() {
  return el("thead", {}, [
    el("tr", {}, [
      el("th", { className: "schedule-time-header", text: "Horário", attrs: { scope: "col", rowspan: "2" } }),
      ...WEEKDAYS.map((day) => el("th", { className: "schedule-day-header", text: day.label, attrs: { scope: "colgroup", colspan: "2" } })),
    ]),
    el(
      "tr",
      {},
      WEEKDAYS.flatMap(() => [
        el("th", { className: "schedule-subheader", text: "Turma", attrs: { scope: "col" } }),
        el("th", { className: "schedule-subheader", text: "Professor", attrs: { scope: "col" } }),
      ]),
    ),
  ]);
}

/** @param {WeekScheduleEntry} entry @returns {HTMLElement} */
function renderRoomEntry(entry) {
  return el("div", { className: "schedule-cell-entry" }, [el("strong", { text: entry.room }), el("small", { text: `${entry.studentCount} aluno(s)` })]);
}

/** @param {Routine} routine @param {boolean} globalEnabled @param {number} defaultLead @returns {HTMLElement | null} */
function buildNotificationHint(routine, globalEnabled, defaultLead) {
  if (!globalEnabled) return null;
  if (routine.notification?.enabled === false) return null;
  const lead = typeof routine.notification?.leadMinutes === "number" ? routine.notification.leadMinutes : defaultLead;
  const label = lead > 0 ? `Aviso ${lead} min antes` : "Aviso no início";
  return el("small", { className: "schedule-notification-hint" }, [
    el("i", { attrs: { "data-lucide": "bell-ring", "aria-hidden": "true" } }),
    el("span", { text: label }),
  ]);
}

/** @returns {HTMLElement} */
function weeklyScheduleEmptyState() {
  return el("div", { className: "weekly-schedule-empty" }, [
    el("strong", { text: "Nenhuma retirada encontrada." }),
    el("span", { text: "Ajuste os filtros ou cadastre uma rotina para montar a agenda semanal por equipamento." }),
  ]);
}
