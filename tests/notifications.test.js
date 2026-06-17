// @ts-check

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildNotificationId,
  getDueNotifications,
  getNotificationTypeLabel,
  getRecentMissed,
  planTodayNotifications,
  summarizeNotifications,
} from "../js/domain/notifications.js";
import { normalizeState, pruneNotificationLog } from "../js/domain/model.js";
import { DEFAULT_NOTIFICATION_SETTINGS } from "../js/domain/types.js";
import {
  MAX_NOTIFICATION_LOG,
  NOTIF_GROUP_MAX,
  NOTIF_LEAD_MAX,
  NOTIF_RECENT_DELAY_WINDOW,
  NOTIF_SNOOZE_MAX,
  NOTIF_TRIGGER_WINDOW,
} from "../js/domain/limits.js";

const baseRoutine = {
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

const routine = (overrides) => ({ ...baseRoutine, ...overrides });
const settings = (overrides = {}) => ({ ...DEFAULT_NOTIFICATION_SETTINGS, ...overrides });
const monday = new Date(2026, 4, 18, 7, 0, 0);

describe("planTodayNotifications", () => {
  it("gera aviso_antecipado, inicio e termino para uma rotina ativa", () => {
    const plans = planTodayNotifications({
      now: monday, weekday: "monday", todayDate: "2026-05-18",
      settings: settings({ groupingEnabled: false }), routines: [routine({})], log: [],
    });
    assert.deepEqual(plans.map((plan) => plan.type), ["aviso_antecipado", "inicio", "termino"]);
    assert.equal(plans[0]?.time, "07:50");
    assert.equal(plans[1]?.time, "08:00");
    assert.equal(plans[2]?.time, "09:00");
  });

  it("usa o lead da rotina quando presente", () => {
    const plans = planTodayNotifications({
      now: monday, weekday: "monday", todayDate: "2026-05-18",
      settings: settings({ defaultLeadMinutes: 10, groupingEnabled: false }),
      routines: [routine({ notification: { leadMinutes: 25 } })], log: [],
    });
    assert.equal(plans.find((plan) => plan.type === "aviso_antecipado")?.time, "07:35");
  });

  it("usa o lead padrão quando a rotina não tem override", () => {
    const plans = planTodayNotifications({
      now: monday, weekday: "monday", todayDate: "2026-05-18",
      settings: settings({ defaultLeadMinutes: 15, groupingEnabled: false }), routines: [routine({})], log: [],
    });
    assert.equal(plans.find((plan) => plan.type === "aviso_antecipado")?.time, "07:45");
  });

  it("não gera termino quando não há endTime", () => {
    const plans = planTodayNotifications({
      now: monday, weekday: "monday", todayDate: "2026-05-18",
      settings: settings({ groupingEnabled: false }), routines: [routine({ endTime: "" })], log: [],
    });
    assert.equal(plans.find((plan) => plan.type === "termino"), undefined);
  });

  it("ignora rotinas com horário inicial inválido", () => {
    const plans = planTodayNotifications({
      now: monday, weekday: "monday", todayDate: "2026-05-18",
      settings: settings(), routines: [routine({ startTime: "invalid" })], log: [],
    });
    assert.equal(plans.length, 0);
  });

  it("agrupa rotinas com mesmo tipo e horário idêntico", () => {
    const plans = planTodayNotifications({
      now: monday, weekday: "monday", todayDate: "2026-05-18",
      settings: settings({ groupingEnabled: true, groupingWindowMinutes: 0 }),
      routines: [routine({ id: "r1", teacher: "Ana", room: "1A" }), routine({ id: "r2", teacher: "Bruno", room: "1B" })],
      log: [],
    });
    assert.deepEqual(plans.find((plan) => plan.type === "inicio")?.routineIds.sort(), ["r1", "r2"]);
  });

  it("não duplica IDs entre rotinas e tipos", () => {
    const plans = planTodayNotifications({
      now: monday, weekday: "monday", todayDate: "2026-05-18",
      settings: settings({ groupingEnabled: false }),
      routines: [routine({ id: "r1" }), routine({ id: "r2", startTime: "09:30", endTime: "10:30" })], log: [],
    });
    const ids = plans.map((plan) => plan.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("pula notificações quando a rotina as desativa", () => {
    const plans = planTodayNotifications({
      now: monday, weekday: "monday", todayDate: "2026-05-18",
      settings: settings(), routines: [routine({ notification: { enabled: false } })], log: [],
    });
    assert.equal(plans.length, 0);
  });

  it("respeita o status vindo do log", () => {
    const todayDate = "2026-05-18";
    const planId = buildNotificationId(todayDate, "inicio", "08:00", ["routine-1"]);
    const plans = planTodayNotifications({
      now: monday, weekday: "monday", todayDate, settings: settings({ groupingEnabled: false }), routines: [routine({})],
      log: [{ id: planId, status: "vista", date: todayDate, type: "inicio", time: "08:00", routineIds: ["routine-1"], updatedAt: "2026-05-18T08:01:00.000Z" }],
    });
    assert.equal(plans.find((plan) => plan.id === planId)?.status, "vista");
  });
});

describe("summarizeNotifications", () => {
  it("conta pendentes e encontra o próximo disparo", () => {
    const now = new Date(2026, 4, 18, 7, 30, 0);
    const plans = planTodayNotifications({
      now, weekday: "monday", todayDate: "2026-05-18", settings: settings({ groupingEnabled: false }), routines: [routine({})], log: [],
    });
    const summary = summarizeNotifications(plans, now);
    assert.ok(summary.pending > 0);
    assert.equal(summary.nextPending?.type, "aviso_antecipado");
  });
});

describe("migração de estado", () => {
  it("cria configurações de notificação padrão quando ausentes", () => {
    const state = normalizeState({ schemaVersion: 4, routines: [], teachers: [], rooms: [], devices: [], settings: { sortBy: "weekday-time", filterText: "" } });
    assert.deepEqual(state.settings.notifications, DEFAULT_NOTIFICATION_SETTINGS);
    assert.deepEqual(state.notificationLog, []);
  });

  it("preserva configurações de notificação válidas já salvas", () => {
    const state = normalizeState({
      schemaVersion: 5, routines: [], teachers: [], rooms: [], devices: [],
      settings: { sortBy: "weekday-time", filterText: "", notifications: { enabled: false, defaultLeadMinutes: 20, soundEnabled: true, soundName: "bell", groupingEnabled: false, groupingWindowMinutes: 3, allowSnooze: false, defaultSnoozeMinutes: 12 } },
    });
    assert.equal(state.settings.notifications.enabled, false);
    assert.equal(state.settings.notifications.defaultLeadMinutes, 20);
    assert.equal(state.settings.notifications.soundName, "bell");
  });
});

describe("pruneNotificationLog", () => {
  const makeEntry = (id, updatedAt) => ({ id, status: "vista", date: "2026-05-25", type: "inicio", time: "08:00", routineIds: ["r1"], updatedAt });

  it(`poda entradas acima de ${MAX_NOTIFICATION_LOG}, mantendo as mais recentes`, () => {
    const entries = Array.from({ length: MAX_NOTIFICATION_LOG + 5 }, (_, i) => makeEntry(`notif-${i}`, new Date(2026, 4, 1, 0, 0, i).toISOString()));
    const pruned = pruneNotificationLog(entries);
    assert.equal(pruned.length, MAX_NOTIFICATION_LOG);
    const prunedIds = pruned.map((e) => e.id);
    for (const id of entries.slice(0, 5).map((e) => e.id)) {
      assert.ok(!prunedIds.includes(id));
    }
  });

  it("não altera listas abaixo do limite", () => {
    const entries = Array.from({ length: 10 }, (_, i) => makeEntry(`notif-${i}`, new Date(2026, 4, 1, 0, 0, i).toISOString()));
    assert.equal(pruneNotificationLog(entries).length, 10);
  });
});

describe("Silenciar hoje", () => {
  it("marca todos os planos da rotina como ignorados, inclusive aviso antecipado", () => {
    const todayDate = "2026-05-18";
    const plans = planTodayNotifications({
      now: monday, weekday: "monday", todayDate, settings: settings({ groupingEnabled: false }), routines: [baseRoutine], log: [],
    });
    const logEntries = plans.map((p) => ({ id: p.id, status: "ignorada", date: p.date, type: p.type, time: p.time, routineIds: p.routineIds, updatedAt: new Date().toISOString() }));
    const after = planTodayNotifications({
      now: monday, weekday: "monday", todayDate, settings: settings({ groupingEnabled: false }), routines: [baseRoutine], log: logEntries,
    });
    assert.ok(after.every((p) => p.status === "ignorada"));
    assert.equal(after.find((p) => p.type === "aviso_antecipado")?.status, "ignorada");
  });
});

describe("constantes de notificação", () => {
  it(`lead máximo (${NOTIF_LEAD_MAX} min) gera aviso antecipado correto`, () => {
    const plans = planTodayNotifications({
      now: new Date(2026, 4, 18, 7, 0, 0), weekday: "monday", todayDate: "2026-05-18",
      settings: settings({ defaultLeadMinutes: NOTIF_LEAD_MAX, groupingEnabled: false }),
      routines: [routine({ startTime: "08:00", endTime: "09:00" })], log: [],
    });
    const lead = plans.find((p) => p.type === "aviso_antecipado");
    assert.notEqual(lead, undefined);
    assert.equal(lead?.fireMinutes, 8 * 60 - NOTIF_LEAD_MAX);
  });

  it(`snooze máximo (${NOTIF_SNOOZE_MAX} min) é aceito nas configurações`, () => {
    assert.equal(settings({ defaultSnoozeMinutes: NOTIF_SNOOZE_MAX }).defaultSnoozeMinutes, NOTIF_SNOOZE_MAX);
  });

  it(`janela de agrupamento máxima (${NOTIF_GROUP_MAX} min) agrupa rotinas distantes`, () => {
    const r2Start = `${String(Math.floor((8 * 60 + NOTIF_GROUP_MAX) / 60)).padStart(2, "0")}:${String((8 * 60 + NOTIF_GROUP_MAX) % 60).padStart(2, "0")}`;
    const plans = planTodayNotifications({
      now: monday, weekday: "monday", todayDate: "2026-05-18",
      settings: settings({ groupingEnabled: true, groupingWindowMinutes: NOTIF_GROUP_MAX }),
      routines: [routine({ id: "r1", startTime: "08:00", endTime: "09:00" }), routine({ id: "r2", startTime: r2Start, endTime: "" })], log: [],
    });
    assert.ok((plans.find((p) => p.type === "inicio")?.routineIds.length ?? 0) >= 2);
  });

  it(`NOTIF_RECENT_DELAY_WINDOW (${NOTIF_RECENT_DELAY_WINDOW}) determina isOverdue`, () => {
    const fireMinutes = 8 * 60;
    const total = fireMinutes + NOTIF_RECENT_DELAY_WINDOW;
    const plans = planTodayNotifications({
      now: new Date(2026, 4, 18, Math.floor(total / 60), total % 60, 0), weekday: "monday", todayDate: "2026-05-18",
      settings: settings({ groupingEnabled: false }), routines: [routine({ startTime: "08:00", endTime: "09:00" })], log: [],
    });
    assert.equal(plans.find((p) => p.type === "inicio")?.isOverdue, true);
  });

  it(`NOTIF_TRIGGER_WINDOW (${NOTIF_TRIGGER_WINDOW}) — plano além da janela não aparece em getDueNotifications`, () => {
    const nowMinutes = 8 * 60 + NOTIF_TRIGGER_WINDOW + 1;
    const now = new Date(2026, 4, 18, Math.floor(nowMinutes / 60), nowMinutes % 60, 0);
    const plans = planTodayNotifications({
      now, weekday: "monday", todayDate: "2026-05-18", settings: settings({ groupingEnabled: false }), routines: [routine({ startTime: "08:00", endTime: "09:00" })], log: [],
    });
    assert.equal(getDueNotifications(plans, now).find((p) => p.type === "inicio"), undefined);
  });
});

describe("snooze e horário efetivo", () => {
  it("adiamento para o passado recente volta a disparar", () => {
    const todayDate = "2026-05-18";
    const planId = buildNotificationId(todayDate, "inicio", "08:00", ["routine-1"]);
    const now = new Date(2026, 4, 18, 13, 30, 0);
    const plans = planTodayNotifications({
      now, weekday: "monday", todayDate, settings: settings({ groupingEnabled: false }), routines: [routine({})],
      log: [{ id: planId, status: "adiada", date: todayDate, type: "inicio", time: "08:00", routineIds: ["routine-1"], updatedAt: "2026-05-18T08:05:00.000Z", snoozedUntil: "13:30" }],
    });
    const inicio = plans.find((plan) => plan.id === planId);
    assert.equal(inicio?.status, "pendente");
    assert.equal(inicio?.snoozedUntilMinutes, 13 * 60 + 30);
    assert.notEqual(getDueNotifications(plans, now).find((plan) => plan.id === planId), undefined);
  });

  it("adiamento para o futuro continua adiada e não dispara", () => {
    const todayDate = "2026-05-18";
    const planId = buildNotificationId(todayDate, "inicio", "08:00", ["routine-1"]);
    const now = new Date(2026, 4, 18, 13, 30, 0);
    const plans = planTodayNotifications({
      now, weekday: "monday", todayDate, settings: settings({ groupingEnabled: false }), routines: [routine({})],
      log: [{ id: planId, status: "adiada", date: todayDate, type: "inicio", time: "08:00", routineIds: ["routine-1"], updatedAt: "2026-05-18T08:05:00.000Z", snoozedUntil: "15:00" }],
    });
    const inicio = plans.find((plan) => plan.id === planId);
    assert.equal(inicio?.status, "adiada");
    assert.equal(inicio?.snoozedUntilMinutes, 15 * 60);
    assert.equal(getDueNotifications(plans, now).find((plan) => plan.id === planId), undefined);
  });
});

describe("getNotificationTypeLabel", () => {
  it("retorna rótulos legíveis", () => {
    assert.equal(getNotificationTypeLabel("aviso_antecipado"), "Aviso antecipado");
    assert.equal(getNotificationTypeLabel("inicio"), "Início da retirada");
    assert.equal(getNotificationTypeLabel("termino"), "Término da retirada");
  });
});

describe("getRecentMissed usa NOTIF_RECENT_DELAY_WINDOW", () => {
  it(`inclui plano pendente dentro da janela de ${NOTIF_RECENT_DELAY_WINDOW} min`, () => {
    const total = 8 * 60 + NOTIF_RECENT_DELAY_WINDOW;
    const now = new Date(2026, 4, 18, Math.floor(total / 60), total % 60, 0);
    const plans = planTodayNotifications({
      now, weekday: "monday", todayDate: "2026-05-18", settings: settings({ groupingEnabled: false }), routines: [routine({ startTime: "08:00", endTime: "09:00" })], log: [],
    });
    assert.notEqual(getRecentMissed(plans, now).find((p) => p.type === "inicio"), undefined);
  });

  it(`exclui plano pendente além da janela de ${NOTIF_RECENT_DELAY_WINDOW} min`, () => {
    const total = 8 * 60 + NOTIF_RECENT_DELAY_WINDOW + 1;
    const now = new Date(2026, 4, 18, Math.floor(total / 60), total % 60, 0);
    const plans = planTodayNotifications({
      now, weekday: "monday", todayDate: "2026-05-18", settings: settings({ groupingEnabled: false }), routines: [routine({ startTime: "08:00", endTime: "09:00" })], log: [],
    });
    assert.equal(getRecentMissed(plans, now).find((p) => p.type === "inicio"), undefined);
  });
});
