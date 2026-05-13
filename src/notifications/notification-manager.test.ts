import { describe, expect, it } from "vitest";
import { createEmptyState } from "../domain/model";
import type { AppState, NotificationAdapter, Routine, StorageAdapter } from "../domain/types";
import {
  ALERT_STORAGE_KEY,
  createNotificationManager,
  nextOccurrence,
  type AudioPlayer,
  type NotificationScheduler,
  type RoutineAlert,
} from "./notification-manager";

class ManualScheduler implements NotificationScheduler {
  private intervalCallback: (() => void) | null = null;
  private nextId = 1;

  constructor(private nowMs: number) {}

  setInterval(callback: () => void): number {
    this.intervalCallback = callback;
    return this.nextId++;
  }

  clearInterval(): void {
    this.intervalCallback = null;
  }

  now(): number {
    return this.nowMs;
  }

  advance(ms: number): void {
    this.nowMs += ms;
  }

  runInterval(): void {
    this.intervalCallback?.();
  }
}

class ManualAudio implements AudioPlayer {
  currentTime = 0;
  loop = false;
  pauseCalls = 0;
  playCalls = 0;
  preload = "";
  volume = 0;

  pause(): void {
    this.pauseCalls += 1;
  }

  play(): void {
    this.playCalls += 1;
  }
}

function createMemoryStorage(initial: Record<string, string> = {}): StorageAdapter {
  const values = new Map(Object.entries(initial));

  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

function createNotificationAdapter(permission: NotificationPermission | "unsupported") {
  const shown: Array<{ title: string; options: NotificationOptions }> = [];
  const adapter: NotificationAdapter = {
    permission: () => permission,
    requestPermission: () => Promise.resolve(permission),
    show(title, options) {
      shown.push({ title, options });
    },
  };

  return { adapter, shown };
}

function routine(overrides: Partial<Routine> = {}): Routine {
  return {
    id: "routine-1",
    weekday: "monday",
    startTime: "09:00",
    endTime: "10:00",
    teacher: "Ana",
    room: "1A",
    studentCount: 30,
    devices: ["Notebook"],
    notes: "",
    notificationEnabled: true,
    leadMinutes: null,
    createdAt: "2026-05-18T08:00:00.000Z",
    updatedAt: "2026-05-18T08:00:00.000Z",
    ...overrides,
  };
}

function stateWithRoutine(routineOverride: Partial<Routine> = {}, stateOverride: Partial<AppState> = {}): AppState {
  const state = createEmptyState();
  return {
    ...state,
    ...stateOverride,
    settings: {
      ...state.settings,
      notificationsEnabled: true,
      defaultLeadMinutes: 10,
      soundEnabled: false,
      ...stateOverride.settings,
    },
    routines: [routine(routineOverride)],
  };
}

function expectLocalDate(
  value: Date | null,
  expected: {
    year: number;
    month: number;
    date: number;
    hours: number;
    minutes: number;
  },
): void {
  expect(value).not.toBeNull();
  expect(value!.getFullYear()).toBe(expected.year);
  expect(value!.getMonth()).toBe(expected.month);
  expect(value!.getDate()).toBe(expected.date);
  expect(value!.getHours()).toBe(expected.hours);
  expect(value!.getMinutes()).toBe(expected.minutes);
  expect(value!.getSeconds()).toBe(0);
  expect(value!.getMilliseconds()).toBe(0);
}

describe("nextOccurrence", () => {
  it("schedules a future alert on the same weekday", () => {
    const now = new Date(2026, 4, 18, 8, 0, 0, 0);

    const occurrence = nextOccurrence("monday", "09:00", 10, now);

    expectLocalDate(occurrence, {
      year: 2026,
      month: 4,
      date: 18,
      hours: 8,
      minutes: 50,
    });
  });

  it("moves to the next week when the target time already passed", () => {
    const now = new Date(2026, 4, 18, 10, 0, 0, 0);

    const occurrence = nextOccurrence("monday", "09:00", 0, now);

    expectLocalDate(occurrence, {
      year: 2026,
      month: 4,
      date: 25,
      hours: 9,
      minutes: 0,
    });
  });

  it("keeps lead alerts on the previous day when lead crosses midnight", () => {
    const now = new Date(2026, 4, 17, 23, 0, 0, 0);

    const occurrence = nextOccurrence("monday", "00:10", 30, now);

    expectLocalDate(occurrence, {
      year: 2026,
      month: 4,
      date: 17,
      hours: 23,
      minutes: 40,
    });
  });
});

describe("createNotificationManager", () => {
  it("emits an internal lead alert using the default lead minutes", () => {
    const state = stateWithRoutine();
    const scheduler = new ManualScheduler(new Date(2026, 4, 18, 8, 50, 5).getTime());
    const { adapter, shown } = createNotificationAdapter("denied");
    const alerts: RoutineAlert[] = [];

    const manager = createNotificationManager({
      getState: () => state,
      notificationAdapter: adapter,
      scheduler,
      onAlert: (alert) => alerts.push(alert),
    });

    manager.reschedule();

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      key: "routine-1|2026-05-18|09:00",
      routineId: "routine-1",
      type: "lead",
      title: "PROATI: retirada em 10 min",
    });
    expect(alerts[0]?.body).toContain("09:00");
    expect(alerts[0]?.body).toContain("Ana");
    expect(alerts[0]?.body).toContain("1A");
    expect(alerts[0]?.body).toContain("Notebook");
    expect(shown).toHaveLength(0);
  });

  it("persists a pending alert when a routine enters the lead window", () => {
    const state = stateWithRoutine();
    const scheduler = new ManualScheduler(new Date(2026, 4, 18, 8, 55, 0).getTime());
    const { adapter } = createNotificationAdapter("denied");
    const alertStorage = createMemoryStorage();

    const manager = createNotificationManager({
      getState: () => state,
      notificationAdapter: adapter,
      scheduler,
      alertStorage,
      onAlarm: () => undefined,
    });

    manager.reschedule();

    const stored = JSON.parse(alertStorage.getItem(ALERT_STORAGE_KEY) ?? "{}") as {
      records?: Record<string, { status?: string }>;
    };
    expect(stored.records?.["routine-1|2026-05-18|09:00"]?.status).toBe("pending");
  });

  it("re-emits a pending alert after reload until it is acknowledged", () => {
    const state = stateWithRoutine();
    const pendingAlert: RoutineAlert = {
      key: "routine-1|2026-05-18|09:00",
      id: "routine-1-2026-05-18-09:00",
      routineId: "routine-1",
      type: "lead",
      title: "PROATI: retirada em 10 min",
      body: "Segunda-feira 09:00 - Ana, 1A, 30 aluno(s), Notebook.",
      createdAt: "2026-05-18T08:55:00.000Z",
      details: [],
    };
    const alertStorage = createMemoryStorage({
      [ALERT_STORAGE_KEY]: JSON.stringify({
        version: 1,
        records: {
          [pendingAlert.key]: {
            key: pendingAlert.key,
            status: "pending",
            alert: pendingAlert,
            updatedAt: "2026-05-18T08:55:00.000Z",
          },
        },
      }),
    });
    const scheduler = new ManualScheduler(new Date(2026, 4, 18, 9, 30, 0).getTime());
    const { adapter } = createNotificationAdapter("denied");
    const alarms: RoutineAlert[] = [];

    const manager = createNotificationManager({
      getState: () => state,
      notificationAdapter: adapter,
      scheduler,
      alertStorage,
      onAlarm: (alert) => alarms.push(alert),
    });

    manager.reschedule();

    expect(alarms).toHaveLength(1);
    expect(alarms[0]?.key).toBe(pendingAlert.key);
  });

  it("does not emit an acknowledged alert again on the same day", () => {
    const state = stateWithRoutine();
    const key = "routine-1|2026-05-18|09:00";
    const alertStorage = createMemoryStorage({
      [ALERT_STORAGE_KEY]: JSON.stringify({
        version: 1,
        records: {
          [key]: {
            key,
            status: "acknowledged",
            updatedAt: "2026-05-18T08:55:00.000Z",
            acknowledgedAt: "2026-05-18T08:56:00.000Z",
          },
        },
      }),
    });
    const scheduler = new ManualScheduler(new Date(2026, 4, 18, 8, 55, 0).getTime());
    const { adapter } = createNotificationAdapter("denied");
    const alarms: RoutineAlert[] = [];

    const manager = createNotificationManager({
      getState: () => state,
      notificationAdapter: adapter,
      scheduler,
      alertStorage,
      onAlarm: (alert) => alarms.push(alert),
    });

    manager.reschedule();

    expect(alarms).toHaveLength(0);
  });

  it("acknowledges a pending alert and stops looped sound", () => {
    const state = stateWithRoutine({}, { settings: { ...createEmptyState().settings, soundEnabled: true } });
    const scheduler = new ManualScheduler(new Date(2026, 4, 18, 8, 55, 0).getTime());
    const { adapter } = createNotificationAdapter("denied");
    const alertStorage = createMemoryStorage();
    const audio = new ManualAudio();

    const manager = createNotificationManager({
      getState: () => state,
      notificationAdapter: adapter,
      scheduler,
      alertStorage,
      audioFactory: () => audio,
      onAlarm: () => undefined,
    });

    manager.reschedule();
    manager.acknowledgeAlert("routine-1|2026-05-18|09:00");

    const stored = JSON.parse(alertStorage.getItem(ALERT_STORAGE_KEY) ?? "{}") as {
      records?: Record<string, { status?: string }>;
    };
    expect(audio.loop).toBe(true);
    expect(audio.playCalls).toBe(1);
    expect(audio.pauseCalls).toBe(1);
    expect(audio.currentTime).toBe(0);
    expect(stored.records?.["routine-1|2026-05-18|09:00"]?.status).toBe("acknowledged");
  });

  it("uses the routine-specific lead minutes before the global default", () => {
    const state = stateWithRoutine({ leadMinutes: 15 });
    const scheduler = new ManualScheduler(new Date(2026, 4, 18, 8, 45, 10).getTime());
    const { adapter } = createNotificationAdapter("denied");
    const alerts: RoutineAlert[] = [];

    const manager = createNotificationManager({
      getState: () => state,
      notificationAdapter: adapter,
      scheduler,
      onAlert: (alert) => alerts.push(alert),
    });

    manager.reschedule();

    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.title).toBe("PROATI: retirada em 15 min");
  });

  it("does not emit duplicate alerts for the same routine and trigger time", () => {
    const state = stateWithRoutine();
    const scheduler = new ManualScheduler(new Date(2026, 4, 18, 8, 50, 15).getTime());
    const { adapter } = createNotificationAdapter("denied");
    const alerts: RoutineAlert[] = [];

    const manager = createNotificationManager({
      getState: () => state,
      notificationAdapter: adapter,
      scheduler,
      onAlert: (alert) => alerts.push(alert),
    });

    manager.reschedule();
    manager.reschedule();
    scheduler.runInterval();

    expect(alerts).toHaveLength(1);
  });

  it("keeps the internal popup path when browser notification permission is denied", () => {
    const state = stateWithRoutine();
    const scheduler = new ManualScheduler(new Date(2026, 4, 18, 8, 50, 20).getTime());
    const { adapter, shown } = createNotificationAdapter("denied");
    const alerts: RoutineAlert[] = [];

    const manager = createNotificationManager({
      getState: () => state,
      notificationAdapter: adapter,
      scheduler,
      onAlert: (alert) => alerts.push(alert),
    });

    manager.reschedule();

    expect(alerts).toHaveLength(1);
    expect(shown).toHaveLength(0);
  });

  it("emits native browser notifications when permission is granted", () => {
    const state = stateWithRoutine();
    const scheduler = new ManualScheduler(new Date(2026, 4, 18, 8, 50, 25).getTime());
    const { adapter, shown } = createNotificationAdapter("granted");

    const manager = createNotificationManager({
      getState: () => state,
      notificationAdapter: adapter,
      scheduler,
      onAlert: () => undefined,
    });

    manager.reschedule();

    expect(shown).toHaveLength(1);
    expect(shown[0]?.title).toBe("PROATI: retirada em 10 min");
    expect(shown[0]?.options.body).toContain("Ana");
  });

  it("checks periodically after reload/reschedule and emits the upcoming alert once", () => {
    const state = stateWithRoutine();
    const scheduler = new ManualScheduler(new Date(2026, 4, 18, 8, 49, 45).getTime());
    const { adapter } = createNotificationAdapter("denied");
    const alerts: RoutineAlert[] = [];

    const manager = createNotificationManager({
      getState: () => state,
      notificationAdapter: adapter,
      scheduler,
      onAlert: (alert) => alerts.push(alert),
    });

    manager.reschedule();
    expect(alerts).toHaveLength(0);

    scheduler.advance(15_000);
    scheduler.runInterval();
    scheduler.runInterval();

    expect(alerts).toHaveLength(1);
  });
});
