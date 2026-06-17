import { NOTIFICATION_LEAD_PRESETS, NOTIFICATION_SOUNDS } from "../../domain/types.js";
import { NOTIF_LEAD_MAX, NOTIF_LEAD_MIN, NOTIF_SNOOZE_MAX, NOTIF_SNOOZE_MIN } from "../../domain/limits.js";
import { el, replaceChildren } from "../dom.js";
import { labeledInline, optionNode, settingsGroup, settingsRow, toggleRow } from "./notifications-helpers.js";

/** @typedef {import("../../domain/types.js").NotificationSettings} NotificationSettings */

/**
 * Renderiza a grade de configurações de notificação no container informado.
 * @param {{ container: HTMLElement, settings: NotificationSettings, actions: any, toasts: any, refresh: () => void }} deps
 */
export function renderNotificationSettings({ container, settings, actions, toasts, refresh }) {
  /** @param {Partial<NotificationSettings>} patch */
  const update = (patch) => {
    actions.updateNotificationSettings(patch);
    refresh();
  };

  const enabledToggle = toggleRow("Ativar avisos na tela", settings.enabled, (value) => update({ enabled: value }));

  const usesCustomLead = !NOTIFICATION_LEAD_PRESETS.some((value) => value === settings.defaultLeadMinutes);
  const leadSelect = el("select", { className: "form-input notifications-lead-select" }, [
    ...NOTIFICATION_LEAD_PRESETS.map((value) => optionNode(String(value), `${value} min antes`, settings.defaultLeadMinutes === value)),
    optionNode("custom", "Personalizado…", usesCustomLead),
  ]);

  const leadCustom = el("input", {
    className: "form-input notifications-lead-custom",
    attrs: { type: "number", min: String(NOTIF_LEAD_MIN), max: String(NOTIF_LEAD_MAX), step: "1", placeholder: "Minutos antes", "aria-label": "Antecedência personalizada do aviso, em minutos" },
  });
  leadCustom.value = String(settings.defaultLeadMinutes);
  leadCustom.hidden = !usesCustomLead;

  leadSelect.addEventListener("change", () => {
    if (leadSelect.value === "custom") {
      leadCustom.hidden = false;
      leadCustom.focus();
      return;
    }
    const next = Number(leadSelect.value);
    if (Number.isFinite(next)) update({ defaultLeadMinutes: next });
  });
  leadCustom.addEventListener("change", () => {
    const next = Number(leadCustom.value);
    if (!Number.isFinite(next) || next < NOTIF_LEAD_MIN || next > NOTIF_LEAD_MAX) {
      toasts.show({ type: "error", title: "Antecedência inválida", message: `Informe um valor entre ${NOTIF_LEAD_MIN} e ${NOTIF_LEAD_MAX} minutos.` });
      return;
    }
    update({ defaultLeadMinutes: Math.round(next) });
  });

  const soundToggle = toggleRow("Tocar som ao exibir o aviso", settings.soundEnabled, (value) => update({ soundEnabled: value }));
  const soundSelect = el("select", { className: "form-input" }, NOTIFICATION_SOUNDS.map((opt) => optionNode(opt.value, opt.label, settings.soundName === opt.value)));
  soundSelect.addEventListener("change", () => update({ soundName: /** @type {any} */ (soundSelect.value) }));

  const groupingToggle = toggleRow("Agrupar avisos do mesmo horário", settings.groupingEnabled, (value) => update({ groupingEnabled: value }));
  const snoozeToggle = toggleRow("Permitir adiar avisos", settings.allowSnooze, (value) => update({ allowSnooze: value }));

  const snoozeInput = el("input", {
    className: "form-input notifications-snooze-input",
    attrs: { type: "number", min: String(NOTIF_SNOOZE_MIN), max: String(NOTIF_SNOOZE_MAX), step: "1", "aria-label": "Tempo padrão de adiamento, em minutos" },
  });
  snoozeInput.value = String(settings.defaultSnoozeMinutes);
  snoozeInput.addEventListener("change", () => {
    const next = Number(snoozeInput.value);
    if (!Number.isFinite(next) || next < NOTIF_SNOOZE_MIN || next > NOTIF_SNOOZE_MAX) {
      toasts.show({ type: "error", title: "Tempo de adiamento inválido", message: `Informe um valor entre ${NOTIF_SNOOZE_MIN} e ${NOTIF_SNOOZE_MAX} minutos.` });
      return;
    }
    update({ defaultSnoozeMinutes: Math.round(next) });
  });

  replaceChildren(container, [
    el("div", { className: "notifications-settings-grid" }, [
      settingsGroup("Avisos", [
        settingsRow("Estado dos avisos", [enabledToggle]),
        settingsRow("Antecedência padrão", [leadSelect, leadCustom]),
        settingsRow("Agrupamento", [groupingToggle]),
      ]),
      settingsGroup("Resposta", [
        settingsRow("Som", [soundToggle, soundSelect]),
        settingsRow("Adiamento", [snoozeToggle, labeledInline("Padrão (min)", snoozeInput)]),
      ]),
    ]),
  ]);
}
