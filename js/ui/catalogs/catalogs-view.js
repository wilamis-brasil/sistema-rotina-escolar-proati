import { el, replaceChildren } from "../dom.js";
import { emptyState, iconButton } from "../ui-elements.js";

/** @typedef {import("../../domain/types.js").AppState} AppState */
/** @typedef {import("../../domain/types.js").CatalogKind} CatalogKind */
/** @typedef {import("../../domain/types.js").EmptyResult} EmptyResult */

/**
 * Catálogos de professores, turmas e equipamentos (CRUD com feedback).
 * @param {{ refs: any, getState: () => AppState, actions: any, dialogs: any, feedback: any, onChange: () => void }} deps
 */
export function createCatalogsView({ refs, getState, actions, dialogs, feedback, onChange }) {
  function bindEvents() {
    refs.teacherForm.addEventListener("submit", handleTeacherSubmit);
    refs.roomForm.addEventListener("submit", handleRoomSubmit);
    refs.deviceForm.addEventListener("submit", handleDeviceSubmit);
  }

  function render() {
    const state = getState();
    renderCatalogList("teachers", state.teachers, refs.teachersListPanel);
    renderCatalogList("rooms", state.rooms, refs.roomsListPanel);
    renderCatalogList("devices", state.devices, refs.devicesListPanel);
  }

  /** @param {CatalogKind} kind @param {any[]} items @param {HTMLElement} container */
  function renderCatalogList(kind, items, container) {
    if (!items.length) {
      replaceChildren(container, [emptyState(catalogEmptyMessage(kind))]);
      return;
    }

    replaceChildren(
      container,
      items.map((item) => {
        const caption =
          kind === "rooms" && "studentCount" in item && item.studentCount ? `${item.studentCount} aluno(s) padrão` : countUsage(kind, item.name);

        return el("article", { className: "catalog-item" }, [
          el("div", {}, [el("strong", { text: item.name }), el("span", { text: caption })]),
          el("div", { className: "routine-actions" }, [
            iconButton("pencil", `Editar ${catalogItemLabel(kind)} ${item.name}`, () => startCatalogEdit(kind, item)),
            iconButton(
              "trash-2",
              `Excluir ${catalogItemLabel(kind)} ${item.name}`,
              async () => {
                const confirmed = await dialogs.dangerConfirm({
                  title: catalogDeleteTitle(kind),
                  message: "As rotinas já salvas mantêm o nome atual nesse item. Apenas o cadastro será removido do catálogo.",
                  confirmLabel: catalogDeleteConfirmLabel(kind),
                });
                if (!confirmed) return;

                const result = actions.deleteCatalogItem(kind, item.id);
                showCatalogResult(kind, result, catalogDeleteSuccess(kind));
                onChange();
              },
              "danger",
            ),
          ]),
        ]);
      }),
    );
  }

  /** @param {CatalogKind} kind @param {string} name @returns {string} */
  function countUsage(kind, name) {
    const count = getState().routines.filter((routine) => {
      if (kind === "teachers") return routine.teacher === name;
      if (kind === "rooms") return routine.room === name;
      return routine.devices.includes(name);
    }).length;
    return count === 1 ? "Usado em 1 rotina" : `Usado em ${count} rotinas`;
  }

  /** @param {CatalogKind} kind @param {any} item */
  function startCatalogEdit(kind, item) {
    if (kind === "teachers") {
      refs.teacherId.value = item.id;
      refs.teacherName.value = item.name;
      refs.teacherName.focus();
      return;
    }
    if (kind === "rooms") {
      refs.roomId.value = item.id;
      refs.roomStudentCount.value = "studentCount" in item && item.studentCount ? String(item.studentCount) : "";
      refs.roomName.value = item.name;
      refs.roomName.focus();
      return;
    }
    refs.deviceId.value = item.id;
    refs.deviceName.value = item.name;
    refs.deviceName.focus();
  }

  /** @param {SubmitEvent} event */
  function handleTeacherSubmit(event) {
    event.preventDefault();
    const result = refs.teacherId.value
      ? actions.updateCatalogItem("teachers", refs.teacherId.value, { name: refs.teacherName.value })
      : actions.addCatalogItem("teachers", { name: refs.teacherName.value });

    showCatalogResult("teachers", result, "Professor salvo no cadastro.");
    if (result.ok) refs.teacherForm.reset();
    onChange();
  }

  /** @param {SubmitEvent} event */
  function handleRoomSubmit(event) {
    event.preventDefault();
    const payload = { name: refs.roomName.value, studentCount: refs.roomStudentCount.value };
    const result = refs.roomId.value
      ? actions.updateCatalogItem("rooms", refs.roomId.value, payload)
      : actions.addCatalogItem("rooms", payload);

    showCatalogResult("rooms", result, "Turma salva no cadastro.");
    if (result.ok) {
      refs.roomForm.reset();
      refs.roomId.value = "";
      render();
    }
    onChange();
  }

  /** @param {SubmitEvent} event */
  function handleDeviceSubmit(event) {
    event.preventDefault();
    const result = refs.deviceId.value
      ? actions.updateCatalogItem("devices", refs.deviceId.value, { name: refs.deviceName.value })
      : actions.addCatalogItem("devices", { name: refs.deviceName.value });

    showCatalogResult("devices", result, "Equipamento salvo no cadastro.");
    if (result.ok) refs.deviceForm.reset();
    onChange();
  }

  /** @param {CatalogKind} kind @param {EmptyResult} result @param {string} successMessage */
  function showCatalogResult(kind, result, successMessage) {
    const feedbackNode = { teachers: refs.teacherFeedback, rooms: refs.roomFeedback, devices: refs.deviceFeedback }[kind];
    feedback.showResult(result, feedbackNode, successMessage);
  }

  return { bindEvents, render };
}

/** @param {CatalogKind} kind @returns {string} */
function catalogItemLabel(kind) {
  if (kind === "teachers") return "professor";
  if (kind === "rooms") return "turma";
  return "equipamento";
}

/** @param {CatalogKind} kind @returns {string} */
function catalogEmptyMessage(kind) {
  if (kind === "teachers") return "Nenhum professor cadastrado. Salve o primeiro nome para reutilizar nas rotinas.";
  if (kind === "rooms") return "Nenhuma turma cadastrada. Salve a primeira turma para vincular às rotinas.";
  return "Nenhum equipamento cadastrado. Salve o primeiro tipo para selecionar nas rotinas.";
}

/** @param {CatalogKind} kind @returns {string} */
function catalogDeleteTitle(kind) {
  if (kind === "teachers") return "Excluir este professor do catálogo?";
  if (kind === "rooms") return "Excluir esta turma do catálogo?";
  return "Excluir este equipamento do catálogo?";
}

/** @param {CatalogKind} kind @returns {string} */
function catalogDeleteConfirmLabel(kind) {
  if (kind === "teachers") return "Excluir professor";
  if (kind === "rooms") return "Excluir turma";
  return "Excluir equipamento";
}

/** @param {CatalogKind} kind @returns {string} */
function catalogDeleteSuccess(kind) {
  if (kind === "teachers") return "Professor removido do catálogo.";
  if (kind === "rooms") return "Turma removida do catálogo.";
  return "Equipamento removido do catálogo.";
}
