import type { AppActions } from "../../app/controller";
import type { DialogManager } from "../dialogs";
import type { FeedbackPresenter } from "../ui-feedback";
import type { UIRefs } from "../ui-refs";

type SettingsRefs = Pick<
  UIRefs,
  "settingsForm" | "settingsFeedback" | "exportDataButton" | "importDataFile" | "resetDataButton"
>;

interface SettingsView {
  bindEvents(): void;
}

export function createSettingsView({
  refs,
  actions,
  dialogs,
  feedback,
  onResetData,
  onImported,
}: {
  refs: SettingsRefs;
  actions: AppActions;
  dialogs: DialogManager;
  feedback: FeedbackPresenter;
  onResetData: () => void;
  onImported: () => void;
}): SettingsView {
  function bindEvents(): void {
    refs.settingsForm.addEventListener("submit", handleSettingsSubmit);
    refs.exportDataButton.addEventListener("click", handleExport);
    refs.importDataFile.addEventListener("change", handleImport);
    refs.resetDataButton.addEventListener("click", handleResetData);
  }

  function handleSettingsSubmit(event: SubmitEvent): void {
    event.preventDefault();
  }

  function handleExport(): void {
    const blob = new Blob([actions.exportData()], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `kickoff-proati-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function handleImport(event: Event): void {
    const input = event.target instanceof HTMLInputElement ? event.target : refs.importDataFile;
    const [file] = input.files ?? [];
    if (!file) return;

    const reader = new FileReader();
    reader.addEventListener("load", async () => {
      const confirmed = await dialogs.confirm({
        tone: "warning",
        title: "Importar dados?",
        message: "A importação substituirá as rotinas, catálogos e configurações locais deste navegador.",
        confirmLabel: "Importar",
      });
      if (!confirmed) {
        input.value = "";
        return;
      }

      const result = actions.importData(String(reader.result ?? ""));
      feedback.showResult(result, refs.settingsFeedback, "Dados importados.");
      input.value = "";
      onImported();
    });
    reader.addEventListener("error", () => {
      feedback.showResult(
        { ok: false, errors: ["Não foi possível ler o arquivo selecionado."] },
        refs.settingsFeedback,
        "Dados importados.",
      );
      input.value = "";
    });
    reader.readAsText(file);
  }

  async function handleResetData(): Promise<void> {
    const confirmed = await dialogs.textConfirm({
      title: "Apagar dados locais?",
      message:
        "Esta ação remove todas as rotinas, professores, salas, dispositivos e configurações salvas neste navegador.",
      expectedText: "APAGAR",
      confirmLabel: "Apagar dados",
    });
    if (!confirmed) return;

    const result = actions.resetData();
    feedback.showResult(result, refs.settingsFeedback, "Dados locais apagados.");
    onResetData();
  }

  return { bindEvents };
}
