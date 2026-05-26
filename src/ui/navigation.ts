import { refreshIcons } from "./icons";
import type { UIRefs } from "./ui-refs";

const NAVIGATION_LABELS: Record<string, string> = {
  today: "Home",
  week: "Semana",
  teachers: "Professores",
  rooms: "Turmas",
  devices: "Dispositivos",
  maintenance: "Manutenção",
  notifications: "Notificações",
  settings: "Configurações",
};

export interface Navigation {
  bindEvents(): void;
  setView(viewId: string): void;
  getActiveView(): string;
}

export function createNavigation({
  refs,
}: {
  refs: Pick<
    UIRefs,
    "mainMenuButton" | "mainMenuPanel" | "mainMenuCurrent" | "navButtons" | "views"
  >;
}): Navigation {
  let activeView = "today";
  let isMainMenuOpen = false;

  function setView(viewId: string): void {
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

  function toggleMainMenu(): void {
    setMainMenuOpen(!isMainMenuOpen);
  }

  function setMainMenuOpen(isOpen: boolean): void {
    isMainMenuOpen = isOpen;
    refs.mainMenuButton.setAttribute("aria-expanded", String(isOpen));
    refs.mainMenuPanel.hidden = !isOpen;
  }

  function closeMainMenu({ focusButton = false }: { focusButton?: boolean } = {}): void {
    if (!isMainMenuOpen) return;
    setMainMenuOpen(false);
    if (focusButton) {
      refs.mainMenuButton.focus();
    }
  }

  function closeMainMenuOnOutsideClick(event: MouseEvent): void {
    if (!isMainMenuOpen || !(event.target instanceof Node)) return;
    if (refs.mainMenuButton.contains(event.target) || refs.mainMenuPanel.contains(event.target)) return;
    closeMainMenu();
  }

  function closeMainMenuOnEscape(event: KeyboardEvent): void {
    if (!isMainMenuOpen || event.key !== "Escape") return;
    event.preventDefault();
    closeMainMenu({ focusButton: true });
  }

  function renderMainMenuCurrent(): void {
    const label = NAVIGATION_LABELS[activeView] ?? "Menu";
    refs.mainMenuCurrent.textContent = label;
    refs.mainMenuButton.setAttribute("aria-label", `Abrir menu de navegação. Seção atual: ${label}.`);
  }

  function bindEvents(): void {
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

  return {
    bindEvents,
    setView,
    getActiveView: () => activeView,
  };
}
