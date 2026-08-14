import { refreshIcons } from "./icons.js";

/** @typedef {import("./ui-refs.js").UIRefs} UIRefs */

/** @type {Record<string, string>} */
const NAVIGATION_LABELS = {
  today: "Hoje",
  week: "Rotina semanal",
  teachers: "Professores",
  rooms: "Turmas",
  devices: "Equipamentos",
  maintenance: "Manutenção",
  notifications: "Avisos",
  settings: "Configurações",
};

/**
 * Controla a navegação entre seções e o menu principal (abrir/fechar,
 * fora-do-clique e Escape).
 * @param {{ refs: UIRefs }} options
 */
export function createNavigation({ refs }) {
  let activeView = "today";
  let isMainMenuOpen = false;

  /** @param {string} viewId */
  function setView(viewId) {
    activeView = viewId;

    refs.navButtons.forEach((button) => {
      const isCurrent = button.dataset.view === viewId;
      button.classList.toggle("is-active", isCurrent);
      if (isCurrent) {
        button.setAttribute("aria-current", "page");
      } else {
        button.removeAttribute("aria-current");
      }
    });

    refs.views.forEach((view) => {
      view.classList.toggle("is-active", view.id === `view-${viewId}`);
    });

    renderMainMenuCurrent();
    refreshIcons();
  }

  function toggleMainMenu() {
    setMainMenuOpen(!isMainMenuOpen);
  }

  /** @param {boolean} isOpen */
  function setMainMenuOpen(isOpen) {
    isMainMenuOpen = isOpen;
    refs.mainMenuButton.setAttribute("aria-expanded", String(isOpen));
    refs.mainMenuPanel.hidden = !isOpen;
  }

  /** @param {{ focusButton?: boolean }} [options] */
  function closeMainMenu({ focusButton = false } = {}) {
    if (!isMainMenuOpen) return;
    setMainMenuOpen(false);
    if (focusButton) refs.mainMenuButton.focus();
  }

  /** @param {MouseEvent} event */
  function closeMainMenuOnOutsideClick(event) {
    if (!isMainMenuOpen || !(event.target instanceof Node)) return;
    if (refs.mainMenuButton.contains(event.target) || refs.mainMenuPanel.contains(event.target)) return;
    closeMainMenu();
  }

  /** @param {KeyboardEvent} event */
  function closeMainMenuOnEscape(event) {
    if (!isMainMenuOpen || event.key !== "Escape") return;
    event.preventDefault();
    closeMainMenu({ focusButton: true });
  }

  function renderMainMenuCurrent() {
    const label = NAVIGATION_LABELS[activeView] ?? "Menu";
    refs.mainMenuCurrent.textContent = label;
    refs.mainMenuButton.setAttribute("aria-label", `Abrir menu de navegação. Seção atual: ${label}.`);
  }

  function bindEvents() {
    refs.mainMenuButton.addEventListener("click", toggleMainMenu);

    refs.navButtons.forEach((button) => {
      button.addEventListener("click", () => {
        setView(button.dataset.view ?? "today");
        closeMainMenu({ focusButton: true });
      });
    });

    document.addEventListener("click", closeMainMenuOnOutsideClick);
    document.addEventListener("keydown", closeMainMenuOnEscape);
  }

  return { bindEvents, setView, getActiveView: () => activeView };
}
