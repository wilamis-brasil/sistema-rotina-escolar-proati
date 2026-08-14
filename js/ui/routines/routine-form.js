import { getTodayWeekdayId, normalizeText } from "../../domain/model.js";
import { MAX_DEVICES_PER_ROUTINE } from "../../domain/limits.js";
import { WEEKDAYS } from "../../domain/types.js";
import { el, option, replaceChildren, span } from "../dom.js";
import { slug } from "../ui-elements.js";

/** @typedef {import("../../domain/types.js").AppState} AppState */
/** @typedef {import("../../domain/types.js").Room} Room */
/** @typedef {import("../../domain/types.js").Routine} Routine */
/** @typedef {import("../../domain/types.js").RoutinePayload} RoutinePayload */

/** @param {Room[]} rooms @returns {string[]} */
export function buildRoomSelectOptions(rooms) {
  return rooms.map((room) => room.name);
}

/**
 * Formulário de cadastro/edição de rotina, incluindo seleção de equipamentos
 * e turmas, datalists e propagação de alunos por turma.
 * @param {{ refs: any, getState: () => AppState, actions: any, navigation: any, feedback: any, onChange: () => void }} deps
 */
export function createRoutineForm({ refs, getState, actions, navigation, feedback, onChange }) {
  /** @type {string | null} */
  let editingRoutineId = null;
  let selectedDevices = new Set();

  function bindEvents() {
    refs.routineForm.addEventListener("submit", handleRoutineSubmit);
    refs.clearRoutineForm.addEventListener("click", () => {
      reset();
      onChange();
    });
    refs.addDeviceToRoutine.addEventListener("click", addDeviceFromRoutineInput);
    refs.routineRoom.addEventListener("change", fillStudentCountFromRoom);
  }

  /** @param {SubmitEvent} event */
  function handleRoutineSubmit(event) {
    event.preventDefault();
    const payload = collectRoutinePayload();
    const result = editingRoutineId ? actions.updateRoutine(editingRoutineId, payload) : actions.addRoutine(payload);

    if (!result.ok) {
      feedback.showResult(result, refs.routineFeedback, "Rotina salva na agenda semanal.", { errorTitle: "Revise os campos da rotina" });
      return;
    }

    reset();
    feedback.showResult(result, refs.routineFeedback, "Rotina salva na agenda semanal.", { successTitle: "Rotina salva" });
    onChange();
  }

  /** @returns {RoutinePayload} */
  function collectRoutinePayload() {
    const extraDevice = normalizeText(refs.routineNewDevice.value);
    if (extraDevice) selectedDevices.add(extraDevice);

    return {
      weekday: refs.routineWeekday.value,
      startTime: refs.routineStartTime.value,
      endTime: refs.routineEndTime.value,
      subject: refs.routineSubject.value,
      teacher: refs.routineTeacher.value,
      room: refs.routineRoom.value,
      studentCount: refs.routineStudentCount.value,
      devices: [...selectedDevices],
      notes: refs.routineNotes.value,
    };
  }

  function reset() {
    editingRoutineId = null;
    selectedDevices = new Set();
    refs.routineForm.reset();
    refs.routineId.value = "";
    refs.routineFormTitle.textContent = "Nova rotina";
    refs.routineFormModeLabel.textContent = "Cadastrar rotina";
    refs.routineFormPanel.dataset.mode = "create";
    refs.routineWeekday.value = getTodayWeekdayId() ?? WEEKDAYS[0].id;
    refs.routineSubject.value = "";
    refs.routineNewDevice.value = "";
    refs.saveRoutineButton.textContent = "Salvar rotina";
    refs.routineRoomLegacyWarning.hidden = true;
    refs.routineRoomLegacyWarning.textContent = "";
    refs.routineRoom.value = "";
    feedback.setFeedback(refs.routineFeedback, "", "neutral");
    renderDevices();
  }

  /** @param {Routine} routine */
  function fill(routine) {
    editingRoutineId = routine.id;
    selectedDevices = new Set(routine.devices);
    refs.routineFormTitle.textContent = "Editar rotina";
    refs.routineFormModeLabel.textContent = "Editar rotina";
    refs.routineFormPanel.dataset.mode = "edit";
    refs.routineId.value = routine.id;
    refs.routineWeekday.value = routine.weekday;
    refs.routineStartTime.value = routine.startTime;
    refs.routineEndTime.value = routine.endTime;
    refs.routineSubject.value = routine.subject;
    refs.routineTeacher.value = routine.teacher;
    refs.routineStudentCount.value = String(routine.studentCount);
    refs.routineNotes.value = routine.notes;

    const roomInCatalog = getState().rooms.some((r) => r.name === routine.room);
    if (!roomInCatalog) {
      refs.routineRoomLegacyWarning.hidden = false;
      refs.routineRoomLegacyWarning.textContent =
        `A turma "${routine.room}" não está mais no cadastro. ` + "Selecione uma turma existente ou cadastre-a antes de salvar.";
      refs.routineRoom.value = "";
    } else {
      refs.routineRoomLegacyWarning.hidden = true;
      refs.routineRoomLegacyWarning.textContent = "";
      setRoomSelectValue(routine.room);
    }

    refs.saveRoutineButton.textContent = "Atualizar rotina";
    navigation.setView("today");
    renderDevices();
    refs.routineForm.scrollIntoView({ behavior: "smooth", block: "start" });
    refs.routineStartTime.focus();
  }

  /** @param {string} value */
  function setRoomSelectValue(value) {
    const hasOption = [...refs.routineRoom.options].some((o) => o.value === value);
    refs.routineRoom.value = hasOption ? value : "";
  }

  function startNew() {
    reset();
    navigation.setView("today");
    refs.routineFormPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    refs.routineStartTime.focus();
  }

  function addDeviceFromRoutineInput() {
    const name = normalizeText(refs.routineNewDevice.value);
    if (!name) return;
    if (selectedDevices.size >= MAX_DEVICES_PER_ROUTINE) {
      feedback.setFeedback(refs.routineFeedback, `Máximo de ${MAX_DEVICES_PER_ROUTINE} equipamentos por rotina.`, "error");
      return;
    }
    selectedDevices.add(name);
    refs.routineNewDevice.value = "";
    renderDevices();
  }

  function renderDevices() {
    const state = getState();
    const deviceNames = [...state.devices.map((device) => device.name), ...selectedDevices];

    replaceChildren(
      refs.routineDevices,
      [...new Set(deviceNames)].map((name) => {
        const input = el("input", { attrs: { id: `routine-device-${slug(name)}`, type: "checkbox", value: name } });
        input.checked = selectedDevices.has(name);
        input.addEventListener("change", () => {
          if (input.checked) {
            if (selectedDevices.size >= MAX_DEVICES_PER_ROUTINE) {
              input.checked = false;
              feedback.setFeedback(refs.routineFeedback, `Máximo de ${MAX_DEVICES_PER_ROUTINE} equipamentos por rotina.`, "error");
              return;
            }
            selectedDevices.add(name);
          } else {
            selectedDevices.delete(name);
          }
        });
        return el("label", { className: "check-pill" }, [input, span(name)]);
      }),
    );
  }

  function renderDatalists() {
    const state = getState();
    replaceChildren(refs.teachersDatalist, state.teachers.map((teacher) => option(teacher.name, teacher.name)));
    replaceChildren(refs.subjectsDatalist, uniqueRoutineSubjects(state.routines).map((subject) => option(subject, subject)));
    renderRoomSelect();
  }

  function renderRoomSelect() {
    const currentValue = refs.routineRoom.value;
    replaceChildren(refs.routineRoom, [
      option("", "Selecione a turma"),
      ...buildRoomSelectOptions(getState().rooms).map((name) => option(name, name)),
    ]);
    const hasOption = [...refs.routineRoom.options].some((o) => o.value === currentValue);
    refs.routineRoom.value = hasOption ? currentValue : "";
  }

  function fillStudentCountFromRoom() {
    const room = getState().rooms.find((item) => item.name === refs.routineRoom.value);
    if (room?.studentCount && !refs.routineStudentCount.value) {
      refs.routineStudentCount.value = String(room.studentCount);
    }
  }

  return { bindEvents, reset, fill, startNew, renderDevices, renderDatalists };
}

/** @param {Routine[]} routines @returns {string[]} */
function uniqueRoutineSubjects(routines) {
  const seen = new Set();
  const subjects = [];
  routines.forEach((routine) => {
    const subject = normalizeText(routine.subject);
    const key = subject.toLocaleLowerCase("pt-BR");
    if (!subject || seen.has(key)) return;
    seen.add(key);
    subjects.push(subject);
  });
  return subjects.sort((a, b) => a.localeCompare(b, "pt-BR"));
}
