import { describe, expect, it } from "vitest";
import {
  buildNotificationId,
  getDueNotifications,
  getNotificationTypeLabel,
  getRecentMissed,
  planTodayNotifications,
  summarizeNotifications,
} from "./notifications";
import { normalizeState, pruneNotificationLog } from "./model";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  type NotificationLogEntry,
  type NotificationSettings,
  type Routine,
} from "./types";
import {
  MAX_NOTIFICATION_LOG,
  NOTIF_LEAD_MAX,
  NOTIF_SNOOZE_MAX,
  NOTIF_GROUP_MAX,
  NOTIF_RECENT_DELAY_WINDOW,
  NOTIF_TRIGGER_WINDOW,
} from "./limits";

const baseRoutine: Routine = {
  id: "routine-1",
  weekday: "monday",
  startTime: "08:00",
  endTime: "09:00",
  subject: "Matemática",
  teacher: "Ana",
  room: "1A",
  studentCount: 30,
  devices: ["Notebook"],
  notes: "",
  createdAt: "2026-05-13T10:00:00.000Z",
  updatedAt: "2026-05-13T10:00:00.000Z",
};

function routine(overrides: Partial<Routine>): Routine {
  return { ...baseRoutine, ...overrides };
}

function settings(overrides: Partial<NotificationSettings> = {}): NotificationSettings {
  return { ...DEFAULT_NOTIFICATION_SETTINGS, ...overrides };
}

const monday = new Date(2026, 4, 18, 7, 0, 0);

describe("planTodayNotifications", () => {
  it("generates aviso_antecipado, inicio and termino plans for an enabled routine", () => {
    const plans = planTodayNotifications({
      now: monday,
      weekday: "monday",
      todayDate: "2026-05-18",
      settings: settings({ groupingEnabled: false }),
      routines: [routine({})],
      log: [],
    });

    expect(plans.map((plan) => plan.type)).toEqual(["aviso_antecipado", "inicio", "termino"]);
    expect(plans[0]?.time).toBe("07:50");
    expect(plans[1]?.time).toBe("08:00");
    expect(plans[2]?.time).toBe("09:00");
  });

  it("uses routine override lead minutes when present", () => {
    const plans = planTodayNotifications({
      now: monday,
      weekday: "monday",
      todayDate: "2026-05-18",
      settings: settings({ defaultLeadMinutes: 10, groupingEnabled: false }),
      routines: [routine({ notification: { leadMinutes: 25 } })],
      log: [],
    });

    const lead = plans.find((plan) => plan.type === "aviso_antecipado");
    expect(lead?.time).toBe("07:35");
  });

  it("falls back to default lead when routine has no override", () => {
    const plans = planTodayNotifications({
      now: monday,
      weekday: "monday",
      todayDate: "2026-05-18",
      settings: settings({ defaultLeadMinutes: 15, groupingEnabled: false }),
      routines: [routine({})],
      log: [],
    });

    const lead = plans.find((plan) => plan.type === "aviso_antecipado");
    expect(lead?.time).toBe("07:45");
  });

  it("does not generate termino when routine has no endTime", () => {
    const plans = planTodayNotifications({
      now: monday,
      weekday: "monday",
      todayDate: "2026-05-18",
      settings: settings({ groupingEnabled: false }),
      routines: [routine({ endTime: "" })],
      log: [],
    });

    expect(plans.find((plan) => plan.type === "termino")).toBeUndefined();
  });

  it("ignores routines with invalid start time", () => {
    const plans = planTodayNotifications({
      now: monday,
      weekday: "monday",
      todayDate: "2026-05-18",
      settings: settings(),
      routines: [routine({ startTime: "invalid" })],
      log: [],
    });

    expect(plans).toHaveLength(0);
  });

  it("groups routines with the same type and identical fire time", () => {
    const plans = planTodayNotifications({
      now: monday,
      weekday: "monday",
      todayDate: "2026-05-18",
      settings: settings({ groupingEnabled: true, groupingWindowMinutes: 0 }),
      routines: [
        routine({ id: "r1", teacher: "Ana", room: "1A" }),
        routine({ id: "r2", teacher: "Bruno", room: "1B" }),
      ],
      log: [],
    });

    const inicio = plans.find((plan) => plan.type === "inicio");
    expect(inicio?.routineIds.sort()).toEqual(["r1", "r2"]);
  });

  it("does not duplicate IDs across routines and types", () => {
    const plans = planTodayNotifications({
      now: monday,
      weekday: "monday",
      todayDate: "2026-05-18",
      settings: settings({ groupingEnabled: false }),
      routines: [
        routine({ id: "r1" }),
        routine({ id: "r2", startTime: "09:30", endTime: "10:30" }),
      ],
      log: [],
    });

    const ids = plans.map((plan) => plan.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("skips notifications when routine override disables them", () => {
    const plans = planTodayNotifications({
      now: monday,
      weekday: "monday",
      todayDate: "2026-05-18",
      settings: settings(),
      routines: [routine({ notification: { enabled: false } })],
      log: [],
    });

    expect(plans).toHaveLength(0);
  });

  it("respects status from the log", () => {
    const todayDate = "2026-05-18";
    const planId = buildNotificationId(todayDate, "inicio", "08:00", ["routine-1"]);
    const plans = planTodayNotifications({
      now: monday,
      weekday: "monday",
      todayDate,
      settings: settings({ groupingEnabled: false }),
      routines: [routine({})],
      log: [
        {
          id: planId,
          status: "vista",
          date: todayDate,
          type: "inicio",
          time: "08:00",
          routineIds: ["routine-1"],
          updatedAt: "2026-05-18T08:01:00.000Z",
        },
      ],
    });

    const inicio = plans.find((plan) => plan.id === planId);
    expect(inicio?.status).toBe("vista");
  });
});

describe("summarizeNotifications", () => {
  it("counts pending and unseen entries and finds the next fire", () => {
    const plans = planTodayNotifications({
      now: new Date(2026, 4, 18, 7, 30, 0),
      weekday: "monday",
      todayDate: "2026-05-18",
      settings: settings({ groupingEnabled: false }),
      routines: [routine({})],
      log: [],
    });

    const summary = summarizeNotifications(plans, new Date(2026, 4, 18, 7, 30, 0));
    expect(summary.pending).toBeGreaterThan(0);
    expect(summary.nextPending?.type).toBe("aviso_antecipado");
  });
});

describe("state migration", () => {
  it("creates default notification settings when missing", () => {
    const state = normalizeState({
      schemaVersion: 4,
      routines: [],
      teachers: [],
      rooms: [],
      devices: [],
      settings: { sortBy: "weekday-time", filterText: "" },
    });

    expect(state.settings.notifications).toEqual(DEFAULT_NOTIFICATION_SETTINGS);
    expect(state.notificationLog).toEqual([]);
  });

  it("preserves valid notification settings already stored", () => {
    const state = normalizeState({
      schemaVersion: 5,
      routines: [],
      teachers: [],
      rooms: [],
      devices: [],
      settings: {
        sortBy: "weekday-time",
        filterText: "",
        notifications: {
          enabled: false,
          defaultLeadMinutes: 20,
          soundEnabled: true,
          soundName: "bell",
          groupingEnabled: false,
          groupingWindowMinutes: 3,
          allowSnooze: false,
          defaultSnoozeMinutes: 12,
        },
      },
    });

    expect(state.settings.notifications.enabled).toBe(false);
    expect(state.settings.notifications.defaultLeadMinutes).toBe(20);
    expect(state.settings.notifications.soundName).toBe("bell");
  });
});

describe("pruneNotificationLog", () => {
  function makeEntry(id: string, updatedAt: string): NotificationLogEntry {
    return {
      id,
      status: "vista",
      date: "2026-05-25",
      type: "inicio",
      time: "08:00",
      routineIds: ["r1"],
      updatedAt,
    };
  }

  it(`poda entradas acima de ${MAX_NOTIFICATION_LOG}, mantendo as mais recentes`, () => {
    const entries = Array.from({ length: MAX_NOTIFICATION_LOG + 5 }, (_, i) =>
      makeEntry(`notif-${i}`, new Date(2026, 4, 1, 0, 0, i).toISOString()),
    );
    const pruned = pruneNotificationLog(entries);
    expect(pruned).toHaveLength(MAX_NOTIFICATION_LOG);
    const oldest = entries.slice(0, 5).map((e) => e.id);
    const prunedIds = pruned.map((e) => e.id);
    for (const id of oldest) {
      expect(prunedIds).not.toContain(id);
    }
  });

  it("não altera listas abaixo do limite", () => {
    const entries = Array.from({ length: 10 }, (_, i) => makeEntry(`notif-${i}`, new Date(2026, 4, 1, 0, 0, i).toISOString()));
    expect(pruneNotificationLog(entries)).toHaveLength(10);
  });

  it(`resultado de pruneNotificationLog nunca excede ${MAX_NOTIFICATION_LOG}`, () => {
    const entries = Array.from({ length: MAX_NOTIFICATION_LOG + 10 }, (_, i) =>
      makeEntry(`notif-${i}`, new Date(2026, 4, 1, 0, 0, i).toISOString()),
    );
    const pruned = pruneNotificationLog(entries);
    expect(pruned.length).toBeLessThanOrEqual(MAX_NOTIFICATION_LOG);
    expect(pruned.length).toBe(MAX_NOTIFICATION_LOG);
  });
});

describe("Silenciar hoje", () => {
  it("marca todos os planos da rotina como ignorados, inclusive aviso antecipado", () => {
    const todayDate = "2026-05-18";
    const r = baseRoutine;
    const plans = planTodayNotifications({
      now: monday,
      weekday: "monday",
      todayDate,
      settings: settings({ groupingEnabled: false }),
      routines: [r],
      log: [],
    });

    const allIds = plans.map((p) => ({ id: p.id, status: "ignorada" as const, date: p.date, type: p.type, time: p.time, routineIds: p.routineIds }));
    const logEntries: NotificationLogEntry[] = allIds.map((entry) => ({
      ...entry,
      updatedAt: new Date().toISOString(),
    }));

    const plansAfterMute = planTodayNotifications({
      now: monday,
      weekday: "monday",
      todayDate,
      settings: settings({ groupingEnabled: false }),
      routines: [r],
      log: logEntries,
    });

    expect(plansAfterMute.every((p) => p.status === "ignorada")).toBe(true);
    const aviso = plansAfterMute.find((p) => p.type === "aviso_antecipado");
    expect(aviso?.status).toBe("ignorada");
  });
});

describe("constantes de notificação produzem mesmo comportamento", () => {
  it(`lead máximo (${NOTIF_LEAD_MAX} min) gera aviso antecipado correto`, () => {
    const now = new Date(2026, 4, 18, 7, 0, 0);
    const r = routine({ startTime: "08:00", endTime: "09:00" });
    const plans = planTodayNotifications({
      now,
      weekday: "monday",
      todayDate: "2026-05-18",
      settings: settings({ defaultLeadMinutes: NOTIF_LEAD_MAX, groupingEnabled: false }),
      routines: [r],
      log: [],
    });
    const lead = plans.find((p) => p.type === "aviso_antecipado");
    expect(lead).toBeDefined();
    expect(lead?.fireMinutes).toBe(8 * 60 - NOTIF_LEAD_MAX);
  });

  it(`snooze máximo (${NOTIF_SNOOZE_MAX} min) é aceito nas configurações`, () => {
    const s = settings({ defaultSnoozeMinutes: NOTIF_SNOOZE_MAX });
    expect(s.defaultSnoozeMinutes).toBe(NOTIF_SNOOZE_MAX);
  });

  it(`janela de agrupamento máxima (${NOTIF_GROUP_MAX} min) agrupa rotinas distantes`, () => {
    const r1 = routine({ id: "r1", startTime: "08:00", endTime: "09:00" });
    const r2 = routine({ id: "r2", startTime: `${String(Math.floor((8 * 60 + NOTIF_GROUP_MAX) / 60)).padStart(2, "0")}:${String((8 * 60 + NOTIF_GROUP_MAX) % 60).padStart(2, "0")}`, endTime: "" });
    const plans = planTodayNotifications({
      now: monday,
      weekday: "monday",
      todayDate: "2026-05-18",
      settings: settings({ groupingEnabled: true, groupingWindowMinutes: NOTIF_GROUP_MAX }),
      routines: [r1, r2],
      log: [],
    });
    const inicioPlan = plans.find((p) => p.type === "inicio");
    expect(inicioPlan?.routineIds.length).toBeGreaterThanOrEqual(2);
  });

  it(`NOTIF_RECENT_DELAY_WINDOW (${NOTIF_RECENT_DELAY_WINDOW}) determina isOverdue`, () => {
    const todayDate = "2026-05-18";
    const fireMinutes = 8 * 60;
    const now = new Date(2026, 4, 18, Math.floor((fireMinutes + NOTIF_RECENT_DELAY_WINDOW) / 60), (fireMinutes + NOTIF_RECENT_DELAY_WINDOW) % 60, 0);
    const plans = planTodayNotifications({
      now,
      weekday: "monday",
      todayDate,
      settings: settings({ groupingEnabled: false }),
      routines: [routine({ startTime: "08:00", endTime: "09:00" })],
      log: [],
    });
    const inicio = plans.find((p) => p.type === "inicio");
    expect(inicio?.isOverdue).toBe(true);
  });

  it(`NOTIF_TRIGGER_WINDOW (${NOTIF_TRIGGER_WINDOW}) — plano além da janela não aparece em getDueNotifications`, () => {
    const todayDate = "2026-05-18";
    const fireMinutes = 8 * 60;
    const nowMinutes = fireMinutes + NOTIF_TRIGGER_WINDOW + 1;
    const now = new Date(2026, 4, 18, Math.floor(nowMinutes / 60), nowMinutes % 60, 0);
    const plans = planTodayNotifications({
      now,
      weekday: "monday",
      todayDate,
      settings: settings({ groupingEnabled: false }),
      routines: [routine({ startTime: "08:00", endTime: "09:00" })],
      log: [],
    });
    const dueList = getDueNotifications(plans, now);
    expect(dueList.find((p) => p.type === "inicio")).toBeUndefined();
  });
});

describe("getNotificationTypeLabel", () => {
  it("returns human labels", () => {
    expect(getNotificationTypeLabel("aviso_antecipado")).toBe("Aviso antecipado");
    expect(getNotificationTypeLabel("inicio")).toBe("Início da retirada");
    expect(getNotificationTypeLabel("termino")).toBe("Término da retirada");
  });
});

describe("getRecentMissed usa NOTIF_RECENT_DELAY_WINDOW como janela padrão", () => {
  it(`inclui plano pendente dentro da janela de ${NOTIF_RECENT_DELAY_WINDOW} min`, () => {
    const fireMinutes = 8 * 60;
    const nowMinutes = fireMinutes + NOTIF_RECENT_DELAY_WINDOW;
    const now = new Date(2026, 4, 18, Math.floor(nowMinutes / 60), nowMinutes % 60, 0);
    const plans = planTodayNotifications({
      now,
      weekday: "monday",
      todayDate: "2026-05-18",
      settings: settings({ groupingEnabled: false }),
      routines: [routine({ startTime: "08:00", endTime: "09:00" })],
      log: [],
    });
    const missed = getRecentMissed(plans, now);
    expect(missed.find((p) => p.type === "inicio")).toBeDefined();
  });

  it(`exclui plano pendente além da janela de ${NOTIF_RECENT_DELAY_WINDOW} min`, () => {
    const fireMinutes = 8 * 60;
    const nowMinutes = fireMinutes + NOTIF_RECENT_DELAY_WINDOW + 1;
    const now = new Date(2026, 4, 18, Math.floor(nowMinutes / 60), nowMinutes % 60, 0);
    const plans = planTodayNotifications({
      now,
      weekday: "monday",
      todayDate: "2026-05-18",
      settings: settings({ groupingEnabled: false }),
      routines: [routine({ startTime: "08:00", endTime: "09:00" })],
      log: [],
    });
    const missed = getRecentMissed(plans, now);
    expect(missed.find((p) => p.type === "inicio")).toBeUndefined();
  });
});
