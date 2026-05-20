import type { AppActions } from "../../app/controller";
import { getTodayWeekdayId, normalizeText } from "../../domain/model";
import {
  WEEKDAYS,
  type AppState,
  type Routine,
  type RoutinePayload,
} from "../../domain/types";
import { el, option, replaceChildren, span } from "../dom";
import type { Navigation } from "../navigation";
import { slug } from "../ui-elements";
import type { FeedbackPresenter } from "../ui-feedback";
import type { UIRefs } from "../ui-refs";

type RoutineFormRefs = Pick<
  UIRefs,
  | "routineForm"
  | "routineFormPanel"
  | "routineFormTitle"
  | "routineFormModeLabel"
  | "routineId"
  | "routineWeekday"
  | "routineStartTime"
  | "routineEndTime"
  | "routineSubject"
  | "routineTeacher"
  | "routineRoom"
  | "routineStudentCount"
  | "routineDevices"
  | "routineNewDevice"
  | "routineNotes"
  | "routineFeedback"
  | "saveRoutineButton"
  | "clearRoutineForm"
  | "addDeviceToRoutine"
  | "storageStatus"
  | "teachersDatalist"
  | "roomsDatalist"
  | "subjectsDatalist"
>;

interface RoutineForm {
  bindEvents(): void;
  reset(): void;
  fill(routine: Routine): void;
  startNew(): void;
  renderDevices(): void;
  renderDatalists(): void;
}

export function createRoutineForm({
  refs,
  getState,
  actions,
  navigation,
  feedback,
  onChange,
}: {
  refs: RoutineFormRefs;
  getState: () => AppState;
  actions: AppActions;
  navigation: Navigation;
  feedback: FeedbackPresenter;
  onChange: () => void;
}): RoutineForm {
  let editingRoutineId: string | null = null;
  let selectedDevices = new Set<string>();

  function bindEvents(): void {
    refs.routineForm.addEventListener("submit", handleRoutineSubmit);
    refs.clearRoutineForm.addEventListener("click", () => {
      reset();
      onChange();
    });
    refs.addDeviceToRoutine.addEventListener("click", addDeviceFromRoutineInput);
    refs.routineRoom.addEventListener("change", fillStudentCountFromRoom);
  }

  function handleRoutineSubmit(event: SubmitEvent): void {
    event.preventDefault();
    const payload = collectRoutinePayload();
    const result = editingRoutineId
      ? actions.updateRoutine(editingRoutineId, payload)
      : actions.addRoutine(payload);

    if (!result.ok) {
      feedback.showResult(result, refs.routineFeedback, "Rotina salva.", {
        errorTitle: "Revise a rotina",
      });
      return;
    }

    reset();
    feedback.showResult(result, refs.routineFeedback, "Rotina salva.", {
      successTitle: "Rotina salva",
    });
    refs.storageStatus.textContent = "Dados locais salvos.";
    onChange();
  }

  function collectRoutinePayload(): RoutinePayload {
    const extraDevice = normalizeText(refs.routineNewDevice.value);
    if (extraDevice) {
      selectedDevices.add(extraDevice);
    }

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

  function reset(): void {
    editingRoutineId = null;
    selectedDevices = new Set();
    refs.routineForm.reset();
    refs.routineId.value = "";
    refs.routineFormTitle.textContent = "Nova rotina";
    refs.routineFormModeLabel.textContent = "Cadastro rápido";
    refs.routineFormPanel.dataset.mode = "create";
    refs.routineWeekday.value = getTodayWeekdayId() ?? WEEKDAYS[0].id;
    refs.routineSubject.value = "";
    refs.routineNewDevice.value = "";
    refs.saveRoutineButton.textContent = "Salvar rotina";
    feedback.setFeedback(refs.routineFeedback, "", "neutral");
    renderDevices();
  }

  function fill(routine: Routine): void {
    editingRoutineId = routine.id;
    selectedDevices = new Set(routine.devices);
    refs.routineFormTitle.textContent = "Editar rotina";
    refs.routineFormModeLabel.textContent = "Atualizando cadastro";
    refs.routineFormPanel.dataset.mode = "edit";
    refs.routineId.value = routine.id;
    refs.routineWeekday.value = routine.weekday;
    refs.routineStartTime.value = routine.startTime;
    refs.routineEndTime.value = routine.endTime;
    refs.routineSubject.value = routine.subject;
    refs.routineTeacher.value = routine.teacher;
    refs.routineRoom.value = routine.room;
    refs.routineStudentCount.value = String(routine.studentCount);
    refs.routineNotes.value = routine.notes;

    refs.saveRoutineButton.textContent = "Atualizar rotina";
    navigation.setView("today");
    renderDevices();
    refs.routineForm.scrollIntoView({ behavior: "smooth", block: "start" });
    refs.routineStartTime.focus();
  }

  function startNew(): void {
    reset();
    navigation.setView("today");
    refs.routineFormPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    refs.routineStartTime.focus();
  }

  function addDeviceFromRoutineInput(): void {
    const name = normalizeText(refs.routineNewDevice.value);
    if (!name) return;
    selectedDevices.add(name);
    refs.routineNewDevice.value = "";
    renderDevices();
  }

  function renderDevices(): void {
    const state = getState();
    const deviceNames = [...state.devices.map((device) => device.name), ...selectedDevices];

    replaceChildren(
      refs.routineDevices,
      [...new Set(deviceNames)].map((name) => {
        const id = `routine-device-${slug(name)}`;
        const input = el("input", {
          attrs: {
            id,
            type: "checkbox",
            value: name,
          },
        });
        input.checked = selectedDevices.has(name);
        input.addEventListener("change", () => {
          if (input.checked) selectedDevices.add(name);
          else selectedDevices.delete(name);
        });

        return el("label", { className: "check-pill" }, [input, span(name)]);
      }),
    );
  }

  function renderDatalists(): void {
    const state = getState();
    replaceChildren(
      refs.teachersDatalist,
      state.teachers.map((teacher) => option(teacher.name, teacher.name)),
    );
    replaceChildren(
      refs.roomsDatalist,
      state.rooms.map((room) => option(room.name, room.name)),
    );
    replaceChildren(
      refs.subjectsDatalist,
      uniqueRoutineSubjects(state.routines).map((subject) => option(subject, subject)),
    );
  }

  function fillStudentCountFromRoom(): void {
    const room = getState().rooms.find((item) => item.name === refs.routineRoom.value);
    if (room?.studentCount && !refs.routineStudentCount.value) {
      refs.routineStudentCount.value = String(room.studentCount);
    }
  }

  return {
    bindEvents,
    reset,
    fill,
    startNew,
    renderDevices,
    renderDatalists,
  };
}

function uniqueRoutineSubjects(routines: Routine[]): string[] {
  const seen = new Set<string>();
  const subjects: string[] = [];

  routines.forEach((routine) => {
    const subject = normalizeText(routine.subject);
    const key = subject.toLocaleLowerCase("pt-BR");
    if (!subject || seen.has(key)) return;
    seen.add(key);
    subjects.push(subject);
  });

  return subjects.sort((a, b) => a.localeCompare(b, "pt-BR"));
}
