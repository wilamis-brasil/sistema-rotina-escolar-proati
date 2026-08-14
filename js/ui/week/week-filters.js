import { qsa } from "../dom.js";

/** @typedef {import("../ui-refs.js").UIRefs} UIRefs */

/**
 * @typedef {object} WeekFilterState
 * @property {string} filterText
 * @property {Set<string>} weekdays
 * @property {string} timeStart
 * @property {string} timeEnd
 * @property {string} teacher
 * @property {string} room
 * @property {Set<string>} devices
 */

/**
 * Lê o estado atual dos filtros da rotina semanal a partir do DOM.
 * @param {UIRefs} refs
 * @returns {WeekFilterState}
 */
export function readWeekFilters(refs) {
  return {
    filterText: refs.routineFilter.value,
    weekdays: new Set([...qsa("#filter-weekday-chips input:checked")].map((cb) => cb.value)),
    timeStart: refs.filterTimeStart.value,
    timeEnd: refs.filterTimeEnd.value,
    teacher: refs.filterTeacher.value,
    room: refs.filterRoom.value,
    devices: new Set([...qsa("#filter-device-chips input:checked")].map((cb) => cb.value)),
  };
}

/**
 * @param {WeekFilterState} filters
 * @returns {boolean}
 */
export function hasActiveFilters(filters) {
  return (
    !!filters.filterText ||
    filters.weekdays.size > 0 ||
    !!filters.timeStart ||
    !!filters.timeEnd ||
    !!filters.teacher ||
    !!filters.room ||
    filters.devices.size > 0
  );
}

/**
 * Limpa todos os filtros (texto, dias, horários, professor, turma, equipamentos).
 * @param {{ refs: UIRefs, actions: import("../../app/controller.js").AppActions }} options
 */
export function clearWeekFilters({ refs, actions }) {
  refs.routineFilter.value = "";
  actions.updateUiFilters({ filterText: "" });
  qsa("#filter-weekday-chips input").forEach((cb) => {
    cb.checked = false;
  });
  refs.filterTimeStart.value = "";
  refs.filterTimeEnd.value = "";
  refs.filterTeacher.value = "";
  refs.filterRoom.value = "";
  qsa("#filter-device-chips input").forEach((cb) => {
    cb.checked = false;
  });
}
