import { describe, expect, it } from "vitest";
import {
  buildNotificationId,
  getNotificationTypeLabel,
  planTodayNotifications,
  summarizeNotifications,
} from "./notifications";
import { normalizeState } from "./model";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  type NotificationSettings,
  type Routine,
} from "./types";

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

describe("getNotificationTypeLabel", () => {
  it("returns human labels", () => {
    expect(getNotificationTypeLabel("aviso_antecipado")).toBe("Aviso antecipado");
    expect(getNotificationTypeLabel("inicio")).toBe("Início da retirada");
    expect(getNotificationTypeLabel("termino")).toBe("Término da retirada");
  });
});
