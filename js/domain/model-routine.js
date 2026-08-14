// @ts-check

import { resultFailure } from "./errors.js";
import { MAX_DEVICES_PER_ROUTINE, NOTIF_LEAD_MAX, NOTIF_LEAD_MIN } from "./limits.js";
import {
  checkMaxLen,
  createId,
  getWeekdayLabel,
  isValidTime,
  isWeekdayId,
  normalizeCase,
  normalizeText,
  nowIso,
  textMatch,
  timeToMinutes,
  toRecord,
  uniqueNames,
  weekdayIndex,
} from "./model-utils.js";

/** @typedef {import("./types.js").Routine} Routine */
/** @typedef {import("./types.js").RoutinePayload} RoutinePayload */
/** @typedef {import("./types.js").RoutineNotificationOverride} RoutineNotificationOverride */
/** @typedef {import("./types.js").WeekdayId} WeekdayId */
/** @typedef {import("./types.js").SortOption} SortOption */
/** @template T @typedef {import("./types.js").Result<T>} Result */

const ROUTINE_TEACHER_MAX = 80;
const ROUTINE_SUBJECT_MAX = 80;
const ROUTINE_NOTES_MAX = 500;

// Marca de importação legada (folha de reserva de equipamentos fixos) que deve
// ser descartada das observações. Mantida como códigos para evitar problemas de
// codificação no arquivo-fonte.
const LEGACY_IMPORT_NOTE = [
  73, 109, 112, 111, 114, 116, 97, 100, 111, 32, 100, 97, 32, 102, 111, 108, 104, 97, 32, 100, 101,
  32, 114, 101, 115, 101, 114, 118, 97, 32, 100, 101, 32, 101, 113, 117, 105, 112, 97, 109, 101,
  110, 116, 111, 115, 32, 101, 108, 101, 116, 114, 244, 110, 105, 99, 111, 115, 32, 102, 105, 120,
  111, 115, 46,
]
  .map((code) => String.fromCharCode(code))
  .join("");

/**
 * Valida e constrói uma rotina a partir do payload do formulário/importação.
 * @param {RoutinePayload} payload
 * @param {Pick<Routine, "id" | "createdAt"> | null} [existingRoutine]
 * @returns {Result<Routine>}
 */
export function buildRoutine(payload, existingRoutine = null) {
  const errors = [];
  const weekday = normalizeText(payload.weekday);
  const startTime = normalizeText(payload.startTime);
  const endTime = normalizeText(payload.endTime);
  const subject = normalizeText(payload.subject);
  const teacher = normalizeText(payload.teacher);
  const room = normalizeText(payload.room);
  const studentCount = Number(payload.studentCount);
  const devices = uniqueNames(payload.devices);
  const notes = normalizeRoutineNotes(payload.notes);
  const notification = normalizeRoutineNotification(payload.notification);

  if (!isWeekdayId(weekday)) {
    errors.push("Escolha um dia útil entre segunda e sexta-feira.");
  }
  if (!isValidTime(startTime)) {
    errors.push("Informe o horário de retirada no formato HH:MM.");
  }
  if (endTime && !isValidTime(endTime)) {
    errors.push("Informe o horário de término no formato HH:MM ou deixe em branco.");
  }
  if (
    isValidTime(startTime) &&
    isValidTime(endTime) &&
    Number(timeToMinutes(endTime)) <= Number(timeToMinutes(startTime))
  ) {
    errors.push("O horário de término deve ser posterior ao horário de retirada.");
  }

  if (!teacher) {
    errors.push("Informe o professor responsável.");
  } else {
    const error = checkMaxLen(teacher, ROUTINE_TEACHER_MAX, "Nome do professor");
    if (error) errors.push(error);
  }

  if (!room) {
    errors.push("Informe a turma.");
  }

  const subjectError = checkMaxLen(subject, ROUTINE_SUBJECT_MAX, "Aula");
  if (subjectError) errors.push(subjectError);

  const notesError = checkMaxLen(notes, ROUTINE_NOTES_MAX, "Observações");
  if (notesError) errors.push(notesError);

  if (!Number.isInteger(studentCount) || studentCount < 1) {
    errors.push("Informe uma quantidade de alunos maior que zero.");
  }

  if (devices.length === 0) {
    errors.push("Selecione ou cadastre ao menos um equipamento.");
  } else if (devices.length > MAX_DEVICES_PER_ROUTINE) {
    errors.push(`Selecione no máximo ${MAX_DEVICES_PER_ROUTINE} equipamentos por rotina.`);
  }

  if (errors.length > 0) {
    return resultFailure(errors);
  }

  const timestamp = nowIso();
  return {
    ok: true,
    value: {
      id: existingRoutine?.id ?? createId("routine"),
      weekday: /** @type {WeekdayId} */ (weekday),
      startTime,
      endTime,
      subject,
      teacher,
      room,
      studentCount,
      devices,
      notes,
      ...(notification ? { notification } : {}),
      createdAt: existingRoutine?.createdAt ?? timestamp,
      updatedAt: timestamp,
    },
  };
}

/**
 * Converte um payload de notificação em uma sobreposição válida, ou undefined
 * quando não há nada relevante a guardar.
 * @param {unknown} value
 * @returns {RoutineNotificationOverride | undefined}
 */
export function normalizeRoutineNotification(value) {
  if (value === null || value === undefined) return undefined;
  const record = toRecord(value);
  if (Object.keys(record).length === 0) return undefined;

  /** @type {RoutineNotificationOverride} */
  const override = {};
  if (record.enabled === true) override.enabled = true;
  else if (record.enabled === false) override.enabled = false;

  if (record.leadMinutes === null) {
    override.leadMinutes = null;
  } else if (record.leadMinutes !== undefined) {
    const lead = Number(record.leadMinutes);
    if (Number.isFinite(lead) && lead >= NOTIF_LEAD_MIN && lead <= NOTIF_LEAD_MAX) {
      override.leadMinutes = Math.round(lead);
    }
  }

  return Object.keys(override).length > 0 ? override : undefined;
}

/**
 * @param {unknown} notes
 * @returns {string}
 */
function normalizeRoutineNotes(notes) {
  const value = normalizeText(notes);
  return value === LEGACY_IMPORT_NOTE ? "" : value;
}

/**
 * Ordena rotinas pelo critério escolhido, com desempates estáveis.
 * @param {Routine[]} routines
 * @param {SortOption} [sortBy]
 * @returns {Routine[]}
 */
export function sortRoutines(routines, sortBy = "weekday-time") {
  const byTime = (a, b) => (timeToMinutes(a.startTime) ?? 0) - (timeToMinutes(b.startTime) ?? 0);
  const byDay = (a, b) => weekdayIndex(a.weekday) - weekdayIndex(b.weekday);
  const byText = (selector) => (a, b) =>
    normalizeCase(selector(a)).localeCompare(normalizeCase(selector(b)), "pt-BR");

  /** @type {Record<SortOption, (a: Routine, b: Routine) => number>} */
  const sorters = {
    "weekday-time": (a, b) => byDay(a, b) || byTime(a, b) || byText((item) => item.teacher)(a, b),
    time: (a, b) => byTime(a, b) || byDay(a, b),
    subject: (a, b) => byText((item) => item.subject)(a, b) || byDay(a, b) || byTime(a, b),
    teacher: (a, b) => byText((item) => item.teacher)(a, b) || byDay(a, b) || byTime(a, b),
    room: (a, b) => byText((item) => item.room)(a, b) || byDay(a, b) || byTime(a, b),
    device: (a, b) => byText((item) => item.devices[0] ?? "")(a, b) || byDay(a, b) || byTime(a, b),
  };

  return [...routines].sort(sorters[sortBy] ?? sorters["weekday-time"]);
}

/**
 * Filtra rotinas por texto livre, buscando em todos os campos relevantes.
 * @param {Routine[]} routines
 * @param {unknown} query
 * @returns {Routine[]}
 */
export function filterRoutines(routines, query) {
  const normalizedQuery = normalizeCase(query);
  if (!normalizedQuery) return routines;

  return routines.filter((routine) =>
    textMatch(
      [
        routine.teacher,
        routine.subject,
        routine.room,
        routine.studentCount,
        routine.weekday,
        getWeekdayLabel(routine.weekday),
        routine.startTime,
        routine.endTime,
        routine.notes,
        ...routine.devices,
      ],
      normalizedQuery,
    ),
  );
}
