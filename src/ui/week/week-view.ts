import type { AppActions } from "../../app/controller";
import { filterRoutines, sortRoutines } from "../../domain/model";
import { WEEKDAYS, type AppState, type Routine } from "../../domain/types";
import { el, option, qsa, replaceChildren, span } from "../dom";
import { refreshIcons } from "../icons";
import { iconButton, slug } from "../ui-elements";
import type { UIRefs } from "../ui-refs";
import {
  buildWeekSchedule,
  type WeekScheduleCell,
  type WeekScheduleEntry,
  type WeekScheduleSection,
} from "../week-schedule";
import { clearWeekFilters, hasActiveFilters, readWeekFilters } from "./week-filters";

type WeekViewRefs = Pick<
  UIRefs,
  | "routineFilter"
  | "routineSort"
  | "filterTimeStart"
  | "filterTimeEnd"
  | "filterTeacher"
  | "filterRoom"
  | "filterResultsCount"
  | "filterClearAll"
  | "weekRoutines"
>;

interface WeekViewCallbacks {
  onEdit(routine: Routine): void;
  onDuplicate(routineId: string): void;
  onDelete(routineId: string): Promise<void> | void;
}

interface WeekView {
  bindEvents(): void;
  render(): void;
  applyFilters(): void;
}

export function createWeekView({
  refs,
  getState,
  actions,
  callbacks,
}: {
  refs: WeekViewRefs;
  getState: () => AppState;
  actions: AppActions;
  callbacks: WeekViewCallbacks;
}): WeekView {
  function bindEvents(): void {
    refs.routineFilter.addEventListener("input", () => {
      actions.updateUiFilters({ filterText: refs.routineFilter.value });
      applyFilters();
    });
    refs.routineSort.addEventListener("change", () => {
      actions.updateUiFilters({ sortBy: refs.routineSort.value as AppState["settings"]["sortBy"] });
      applyFilters();
    });
    qsa<HTMLInputElement>("#filter-weekday-chips input").forEach((cb) =>
      cb.addEventListener("change", applyFilters),
    );
    refs.filterTimeStart.addEventListener("change", applyFilters);
    refs.filterTimeEnd.addEventListener("change", applyFilters);
    refs.filterTeacher.addEventListener("change", applyFilters);
    refs.filterRoom.addEventListener("change", applyFilters);
    qsa<HTMLInputElement>("#filter-device-chips input").forEach((cb) =>
      cb.addEventListener("change", applyFilters),
    );
    refs.filterClearAll.addEventListener("click", () => {
      clearWeekFilters({ refs, actions });
      applyFilters();
    });
  }

  function render(): void {
    populateFilters();
    applyFilters();
  }

  function populateFilters(): void {
    const state = getState();

    const prevTeacher = refs.filterTeacher.value;
    replaceChildren(refs.filterTeacher, [
      option("", "Todos"),
      ...state.teachers.map((t) => option(t.name, t.name)),
    ]);
    refs.filterTeacher.value = prevTeacher;

    const prevRoom = refs.filterRoom.value;
    replaceChildren(refs.filterRoom, [
      option("", "Todas"),
      ...state.rooms.map((r) => option(r.name, r.name)),
    ]);
    refs.filterRoom.value = prevRoom;

    const startTimes = [...new Set(state.routines.map((r) => r.startTime))].filter(Boolean).sort();
    const prevStart = refs.filterTimeStart.value;
    replaceChildren(refs.filterTimeStart, [option("", "Início"), ...startTimes.map((t) => option(t, t))]);
    refs.filterTimeStart.value = prevStart;

    const endTimes = [...new Set(state.routines.map((r) => r.endTime))].filter(Boolean).sort();
    const prevEnd = refs.filterTimeEnd.value;
    replaceChildren(refs.filterTimeEnd, [option("", "Fim"), ...endTimes.map((t) => option(t, t))]);
    refs.filterTimeEnd.value = prevEnd;
  }

  function applyFilters(): void {
    const state = getState();
    const filters = readWeekFilters(refs);
    let routines = filterRoutines(state.routines, filters.filterText);

    if (filters.weekdays.size > 0) {
      routines = routines.filter((r) => filters.weekdays.has(r.weekday));
    }
    if (filters.timeStart) {
      routines = routines.filter((r) => r.startTime >= filters.timeStart);
    }
    if (filters.timeEnd) {
      routines = routines.filter((r) => !r.endTime || r.endTime <= filters.timeEnd);
    }
    if (filters.teacher) {
      routines = routines.filter((r) => r.teacher === filters.teacher);
    }
    if (filters.room) {
      routines = routines.filter((r) => r.room === filters.room);
    }
    if (filters.devices.size > 0) {
      routines = routines.filter((r) => r.devices.some((d) => filters.devices.has(d)));
    }

    const sorted = sortRoutines(routines, state.settings.sortBy);
    const schedule = buildWeekSchedule(sorted, state.devices);
    const routineById = new Map(sorted.map((r) => [r.id, r]));

    replaceChildren(
      refs.weekRoutines,
      schedule.sections.length
        ? schedule.sections.map((section) => renderEquipmentSection(section, routineById))
        : [weeklyScheduleEmptyState()],
    );

    const total = state.routines.length;
    const shown = routines.length;
    refs.filterResultsCount.textContent =
      shown < total
        ? `${shown} de ${total} rotina${total !== 1 ? "s" : ""}`
        : `${total} rotina${total !== 1 ? "s" : ""}`;

    refs.filterClearAll.hidden = !hasActiveFilters(filters);
    refreshIcons(refs.weekRoutines);
  }

  function renderEquipmentSection(section: WeekScheduleSection, routineById: Map<string, Routine>): HTMLElement {
    const titleId = `schedule-equipment-${slug(section.deviceName)}`;

    return el("section", { className: "equipment-section", attrs: { "aria-labelledby": titleId } }, [
      el("header", { className: "equipment-section-header" }, [
        el("div", {}, [
          el("span", { className: "equipment-kicker", text: "Equipamento" }),
          el("h3", { text: section.deviceName, attrs: { id: titleId } }),
        ]),
        el("span", {
          className: "equipment-count",
          text: section.routineCount === 1 ? "1 reserva" : `${section.routineCount} reservas`,
        }),
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

  function renderScheduleDayCells(cell: WeekScheduleCell, routineById: Map<string, Routine>): HTMLTableCellElement[] {
    return [
      el(
        "td",
        {
          className: cell.entries.length ? "schedule-cell schedule-room-cell" : "schedule-cell schedule-room-cell is-empty",
        },
        cell.entries.length ? cell.entries.map(renderRoomEntry) : [span("")],
      ),
      el(
        "td",
        {
          className: cell.entries.length
            ? "schedule-cell schedule-teacher-cell"
            : "schedule-cell schedule-teacher-cell is-empty",
        },
        cell.entries.length ? cell.entries.map((entry) => renderTeacherEntry(entry, routineById)) : [span("")],
      ),
    ];
  }

  function renderTeacherEntry(entry: WeekScheduleEntry, routineById: Map<string, Routine>): HTMLElement {
    const routine = routineById.get(entry.routineId);

    return el("div", { className: "schedule-cell-entry schedule-teacher-entry" }, [
      el("strong", { text: entry.teacher }),
      entry.subject ? el("small", { text: `Aula: ${entry.subject}` }) : null,
      entry.notes ? el("small", { text: entry.notes }) : null,
      routine ? scheduleEntryActions(routine) : null,
    ]);
  }

  function scheduleEntryActions(routine: Routine): HTMLElement {
    const copyButton = iconButton("copy", "Duplicar reserva", () => callbacks.onDuplicate(routine.id));
    const editButton = iconButton("pencil", "Editar reserva", () => callbacks.onEdit(routine));
    const deleteButton = iconButton("trash-2", "Excluir reserva", () => callbacks.onDelete(routine.id), "danger");

    return el("div", { className: "schedule-entry-actions" }, [copyButton, editButton, deleteButton]);
  }

  return { bindEvents, render, applyFilters };
}

function renderScheduleColgroup(): HTMLTableColElement {
  return el("colgroup", {}, [
    el("col", { className: "schedule-time-col" }),
    ...WEEKDAYS.flatMap(() => [
      el("col", { className: "schedule-room-col" }),
      el("col", { className: "schedule-teacher-col" }),
    ]),
  ]);
}

function renderScheduleHead(): HTMLTableSectionElement {
  return el("thead", {}, [
    el("tr", {}, [
      el("th", {
        className: "schedule-time-header",
        text: "Horário",
        attrs: { scope: "col", rowspan: "2" },
      }),
      ...WEEKDAYS.map((day) =>
        el("th", {
          className: "schedule-day-header",
          text: day.label,
          attrs: { scope: "colgroup", colspan: "2" },
        }),
      ),
    ]),
    el(
      "tr",
      {},
      WEEKDAYS.flatMap(() => [
        el("th", { className: "schedule-subheader", text: "Sala/Turma", attrs: { scope: "col" } }),
        el("th", { className: "schedule-subheader", text: "Professor", attrs: { scope: "col" } }),
      ]),
    ),
  ]);
}

function renderRoomEntry(entry: WeekScheduleEntry): HTMLElement {
  return el("div", { className: "schedule-cell-entry" }, [
    el("strong", { text: entry.room }),
    el("small", { text: `${entry.studentCount} aluno(s)` }),
  ]);
}

function weeklyScheduleEmptyState(): HTMLElement {
  return el("div", { className: "weekly-schedule-empty" }, [
    el("strong", { text: "Nenhuma reserva encontrada." }),
    el("span", { text: "Ajuste o filtro ou cadastre uma rotina para montar a matriz semanal por equipamento." }),
  ]);
}
