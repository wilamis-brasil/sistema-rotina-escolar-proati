import type { AppActions } from "../../app/controller";
import type { AppState, Password, PasswordPayload } from "../../domain/types";
import { copyText } from "../clipboard";
import type { DialogManager } from "../dialogs";
import { el, icon, replaceChildren } from "../dom";
import { refreshIcons } from "../icons";
import type { ToastManager } from "../toasts";
import { emptyState, iconButton } from "../ui-elements";
import type { FeedbackPresenter } from "../ui-feedback";
import type { UIRefs } from "../ui-refs";

type PasswordsRefs = Pick<
  UIRefs,
  | "passwordForm"
  | "passwordId"
  | "passwordTitle"
  | "passwordUsername"
  | "passwordSecret"
  | "passwordSecretToggle"
  | "passwordDescription"
  | "passwordFeedback"
  | "passwordsListPanel"
>;

interface PasswordsView {
  bindEvents(): void;
  render(): void;
}

export function createPasswordsView({
  refs,
  getState,
  actions,
  dialogs,
  toasts,
  feedback,
  onChange,
}: {
  refs: PasswordsRefs;
  getState: () => AppState;
  actions: AppActions;
  dialogs: DialogManager;
  toasts: ToastManager;
  feedback: FeedbackPresenter;
  onChange: () => void;
}): PasswordsView {
  function bindEvents(): void {
    refs.passwordForm.addEventListener("submit", handlePasswordSubmit);
    refs.passwordSecretToggle.addEventListener("click", togglePasswordSecretVisibility);
  }

  function togglePasswordSecretVisibility(): void {
    const isPassword = refs.passwordSecret.type === "password";
    refs.passwordSecret.type = isPassword ? "text" : "password";
    refs.passwordSecretToggle.setAttribute("aria-pressed", String(isPassword));
    refs.passwordSecretToggle.setAttribute("aria-label", isPassword ? "Ocultar senha" : "Mostrar senha");
    refs.passwordSecretToggle.title = isPassword ? "Ocultar senha" : "Mostrar/ocultar senha";
    refs.passwordSecretToggle.innerHTML = "";
    refs.passwordSecretToggle.appendChild(icon(isPassword ? "eye-off" : "eye"));
    refreshIcons(refs.passwordSecretToggle);
  }

  function handlePasswordSubmit(event: SubmitEvent): void {
    event.preventDefault();
    const payload: PasswordPayload = {
      title: refs.passwordTitle.value,
      username: refs.passwordUsername.value,
      secret: refs.passwordSecret.value,
      description: refs.passwordDescription.value,
    };
    const result = refs.passwordId.value
      ? actions.updatePassword(refs.passwordId.value, payload)
      : actions.addPassword(payload);

    if (result.ok) {
      refs.passwordForm.reset();
      resetPasswordSecretToggle();
    }

    feedback.showResult(result, refs.passwordFeedback, "Senha salva.");
    onChange();
  }

  function startPasswordEdit(password: Password): void {
    refs.passwordId.value = password.id;
    refs.passwordTitle.value = password.title;
    refs.passwordUsername.value = password.username;
    refs.passwordSecret.value = password.secret;
    refs.passwordDescription.value = password.description;
    resetPasswordSecretToggle();
    refs.passwordTitle.focus();
  }

  function resetPasswordSecretToggle(): void {
    refs.passwordSecret.type = "password";
    refs.passwordSecretToggle.setAttribute("aria-pressed", "false");
    refs.passwordSecretToggle.setAttribute("aria-label", "Mostrar senha");
    refs.passwordSecretToggle.title = "Mostrar/ocultar senha";
    refs.passwordSecretToggle.innerHTML = "";
    refs.passwordSecretToggle.appendChild(icon("eye"));
    refreshIcons(refs.passwordSecretToggle);
  }

  function render(): void {
    const passwords = getState().passwords;

    if (!passwords.length) {
      replaceChildren(refs.passwordsListPanel, [emptyState("Nenhuma senha cadastrada.")]);
      return;
    }

    replaceChildren(refs.passwordsListPanel, passwords.map(passwordListItem));
  }

  function passwordListItem(password: Password): HTMLElement {
    const dots = "•".repeat(9);
    let revealed = false;

    const secretSpan = el("span", { text: dots });
    const copyBtn = el(
      "button",
      {
        className: "icon-button",
        attrs: {
          type: "button",
          "aria-label": "Copiar senha",
          title: "Copiar senha",
        },
      },
      [icon("copy")],
    ) as HTMLButtonElement;
    const revealBtn = el(
      "button",
      {
        className: "icon-button",
        attrs: {
          type: "button",
          "aria-label": "Mostrar senha",
          "aria-pressed": "false",
          title: "Mostrar/ocultar senha",
        },
      },
      [icon("eye")],
    ) as HTMLButtonElement;

    copyBtn.addEventListener("click", async () => {
      try {
        await copyText(password.secret);
        toasts.show({
          type: "success",
          title: "Senha copiada",
          message: "A senha foi copiada para a área de transferência.",
        });
      } catch {
        toasts.show({
          type: "error",
          title: "Não foi possível copiar",
          message: "Copie a senha manualmente após exibi-la.",
        });
      }
    });

    revealBtn.addEventListener("click", () => {
      revealed = !revealed;
      secretSpan.textContent = revealed ? password.secret : dots;
      revealBtn.setAttribute("aria-pressed", String(revealed));
      revealBtn.setAttribute("aria-label", revealed ? "Ocultar senha" : "Mostrar senha");
      revealBtn.title = revealed ? "Ocultar senha" : "Mostrar/ocultar senha";
      revealBtn.innerHTML = "";
      revealBtn.appendChild(icon(revealed ? "eye-off" : "eye"));
      refreshIcons(revealBtn);
    });

    const secondaryEl = document.createElement("span");
    if (password.username) {
      secondaryEl.append(`Usuário: ${password.username} · `);
    }
    secondaryEl.append(secretSpan, " ", copyBtn, " ", revealBtn);
    if (password.description) {
      secondaryEl.append(` · ${password.description}`);
    }

    return el("article", { className: "catalog-item" }, [
      el("div", {}, [el("strong", { text: password.title }), secondaryEl]),
      el("div", { className: "routine-actions" }, [
        iconButton("pencil", "Editar", () => startPasswordEdit(password)),
        iconButton(
          "trash-2",
          "Excluir",
          async () => {
            const confirmed = await dialogs.dangerConfirm({
              title: "Excluir senha?",
              message: "A senha será removida permanentemente do catálogo.",
              confirmLabel: "Excluir",
            });
            if (!confirmed) return;

            const result = actions.deletePassword(password.id);
            feedback.showResult(result, refs.passwordFeedback, "Senha excluída.");
            onChange();
          },
          "danger",
        ),
      ]),
    ]);
  }

  return { bindEvents, render };
}
