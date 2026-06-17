import { el, icon, option, replaceChildren, span } from "../dom.js";
import { labeledInline, uniqueSorted } from "./notifications-helpers.js";
import {
  downloadIcsForRoutines,
  getCalendarExportRoutines,
  getDefaultCalendarExportRange,
  isValidCalendarDateInput,
  parseExcludedDatesInput,
} from "./calendar-export.js";

/** @typedef {import("../../domain/types.js").AppState} AppState */

/**
 * Painel de exportação para calendário (.ics) com filtros e datas excluídas.
 * Mantém um rascunho local entre re-renders.
 * @param {{ container: HTMLElement, getState: () => AppState, toasts: any }} deps
 */
export function createCalendarPanel({ container, getState, toasts }) {
  const defaultRange = getDefaultCalendarExportRange();
  const draft = { teacher: "", room: "", startDate: defaultRange.startDate, endDate: defaultRange.endDate, excludedDatesText: "" };

  function isFocused() {
    return document.activeElement instanceof Node && container.contains(document.activeElement);
  }

  function render() {
    const state = getState();
    if (state.routines.length === 0) {
      replaceChildren(container, [
        el("p", { className: "notice-text", text: "Cadastre ao menos uma rotina semanal para gerar o arquivo .ics do calendário." }),
      ]);
      return;
    }

    const teacherNames = uniqueSorted(state.routines.map((routine) => routine.teacher));
    const roomNames = uniqueSorted(state.routines.map((routine) => routine.room));
    if (draft.teacher && !teacherNames.includes(draft.teacher)) draft.teacher = "";
    if (draft.room && !roomNames.includes(draft.room)) draft.room = "";

    const teacherSelect = el("select", { className: "form-input", attrs: { "aria-label": "Filtrar exportação por professor" } }, [
      option("", "Todos os professores"),
      ...teacherNames.map((name) => option(name, name)),
    ]);
    teacherSelect.value = draft.teacher;
    teacherSelect.addEventListener("change", () => {
      draft.teacher = teacherSelect.value;
      render();
    });

    const roomSelect = el("select", { className: "form-input", attrs: { "aria-label": "Filtrar exportação por turma" } }, [
      option("", "Todas as turmas"),
      ...roomNames.map((name) => option(name, name)),
    ]);
    roomSelect.value = draft.room;
    roomSelect.addEventListener("change", () => {
      draft.room = roomSelect.value;
      render();
    });

    const startInput = el("input", { className: "form-input", attrs: { type: "date", "aria-label": "Data inicial da exportação" } });
    startInput.value = draft.startDate;
    startInput.addEventListener("change", () => {
      draft.startDate = startInput.value;
      render();
    });

    const endInput = el("input", { className: "form-input", attrs: { type: "date", "aria-label": "Data final da exportação" } });
    endInput.value = draft.endDate;
    endInput.addEventListener("change", () => {
      draft.endDate = endInput.value;
      render();
    });

    const excludedDates = el("textarea", {
      className: "form-input notifications-calendar-exdates",
      attrs: { placeholder: "Ex.: 2026-07-09, 2026-10-12", "aria-label": "Datas sem rotina (feriados e recessos)" },
    });
    excludedDates.value = draft.excludedDatesText;
    excludedDates.addEventListener("input", () => {
      draft.excludedDatesText = excludedDates.value;
    });

    const optionsResult = buildOptions(state);
    const exportableCount = optionsResult.ok ? getCalendarExportRoutines(state.routines, optionsResult.value).length : 0;
    const summaryText = optionsResult.ok
      ? `${exportableCount} rotina${exportableCount === 1 ? "" : "s"} ser${exportableCount === 1 ? "á" : "ão"} exportada${exportableCount === 1 ? "" : "s"} com recorrência semanal.`
      : optionsResult.errors.join(" ");

    const icsButton = el("button", { className: "button button-primary button-small notifications-calendar-download", attrs: { type: "button" } }, [
      icon("download"),
      span("Baixar calendário (.ics)"),
    ]);
    icsButton.addEventListener("click", () => {
      const result = buildOptions(state);
      if (!result.ok) {
        toasts.show({ type: "error", title: "Período inválido", message: result.errors.join(" ") });
        return;
      }
      const count = getCalendarExportRoutines(state.routines, result.value).length;
      if (count === 0) {
        toasts.show({ type: "info", title: "Nada a exportar", message: "Nenhuma rotina corresponde aos filtros selecionados. Ajuste-os e tente novamente." });
        return;
      }
      if (!downloadIcsForRoutines(state.routines, result.value)) {
        toasts.show({ type: "error", title: "Não foi possível gerar o calendário", message: "Tente novamente em alguns instantes ou revise os filtros aplicados." });
        return;
      }
      toasts.show({ type: "success", title: "Calendário gerado", message: `${count} rotina${count === 1 ? "" : "s"} exportada${count === 1 ? "" : "s"} no arquivo .ics.` });
    });

    replaceChildren(container, [
      el("div", { className: "notifications-calendar-fields" }, [
        labeledInline("Professor", teacherSelect),
        labeledInline("Turma", roomSelect),
        labeledInline("Início", startInput),
        labeledInline("Fim", endInput),
      ]),
      el("label", { className: "notifications-calendar-exdates-field" }, [el("span", { text: "Datas sem rotina (feriados, recessos)" }), excludedDates]),
      el("div", { className: "notifications-calendar-footer" }, [
        el("p", { className: optionsResult.ok ? "notifications-calendar-count" : "notifications-calendar-count is-error", text: summaryText }),
        el("div", { className: "notifications-calendar-actions" }, [icsButton]),
      ]),
    ]);
  }

  /** @param {AppState} state */
  function buildOptions(state) {
    const errors = [];
    if (!isValidCalendarDateInput(draft.startDate)) errors.push("Informe uma data inicial válida.");
    if (!isValidCalendarDateInput(draft.endDate)) errors.push("Informe uma data final válida.");
    if (isValidCalendarDateInput(draft.startDate) && isValidCalendarDateInput(draft.endDate) && draft.startDate > draft.endDate) {
      errors.push("A data final deve ser igual ou posterior à inicial.");
    }

    const parsedExcludedDates = parseExcludedDatesInput(draft.excludedDatesText);
    if (parsedExcludedDates.invalid.length > 0) {
      errors.push(`Datas excluídas inválidas: ${parsedExcludedDates.invalid.join(", ")}.`);
    }
    if (errors.length > 0) return { ok: false, errors };

    return {
      ok: true,
      value: {
        startDate: draft.startDate,
        endDate: draft.endDate,
        teacher: draft.teacher,
        room: draft.room,
        excludedDates: parsedExcludedDates.dates,
        notificationSettings: state.settings.notifications,
      },
    };
  }

  return { render, isFocused };
}
