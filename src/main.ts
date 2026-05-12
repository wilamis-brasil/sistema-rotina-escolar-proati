import "../assets/css/styles.css";
import { createAppController } from "./app/controller";
import { createNotificationManager } from "./notifications/notification-manager";
import { loadState } from "./persistence/store";
import { createUI, type UIApi } from "./ui/create-ui";

const loaded = loadState();

let ui: UIApi | null = null;

const controller = createAppController({
  initialState: loaded.state,
  onStateChange: (options = {}) => {
    if (options.reschedule !== false) {
      notifications.reschedule();
    }
  },
});

const notifications = createNotificationManager({
  getState: controller.getState,
  onAlert: (alert) => ui?.addAlert(alert),
  onAlarm: (alert) => void ui?.showAlarm(alert),
  onSoundBlocked: (message) =>
    ui?.showToast({
      type: "warning",
      title: "Som bloqueado",
      message,
    }),
  onStatusChange: () => ui?.renderNotificationStatus(),
});

ui = createUI({
  getState: controller.getState,
  actions: controller.actions,
  notifications,
  initialNotice: loaded.notice,
});

ui.init();
notifications.reschedule();
