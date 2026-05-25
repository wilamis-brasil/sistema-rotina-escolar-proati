import { describe, expect, it } from "vitest";
import {
  buildCanonicalRoomName,
  buildRoutine,
  createEmptyState,
  filterRoutines,
  isCanonicalRoomName,
  normalizeState,
  parseCanonicalRoomName,
  sortRoutines,
} from "./model";
import { CLASS_LETTERS } from "./types";

const validRoutinePayload = {
  weekday: "monday",
  startTime: "08:00",
  endTime: "09:00",
  subject: "Matemática",
  teacher: "Ana",
  room: "1A",
  studentCount: "30",
  devices: ["Notebook"],
  notes: "",
};

const legacyFixedEquipmentImportNote = [
  73, 109, 112, 111, 114, 116, 97, 100, 111, 32, 100, 97, 32, 102, 111, 108, 104, 97, 32, 100, 101,
  32, 114, 101, 115, 101, 114, 118, 97, 32, 100, 101, 32, 101, 113, 117, 105, 112, 97, 109, 101,
  110, 116, 111, 115, 32, 101, 108, 101, 116, 114, 244, 110, 105, 99, 111, 115, 32, 102, 105, 120,
  111, 115, 46,
]
  .map((code) => String.fromCharCode(code))
  .join("");

describe("buildRoutine", () => {
  it("normalizes the class subject as part of the routine", () => {
    const result = buildRoutine({
      ...validRoutinePayload,
      subject: "  Redação  ",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.subject).toBe("Redação");
    }
  });

  it("rejects an end time before the start time", () => {
    const result = buildRoutine({
      ...validRoutinePayload,
      startTime: "10:00",
      endTime: "09:00",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toContain("anterior");
    }
  });

  it("finds routines by class subject", () => {
    const math = buildRoutine({ ...validRoutinePayload, subject: "Matemática" });
    const history = buildRoutine({ ...validRoutinePayload, subject: "História", startTime: "10:00", endTime: "11:00" });

    expect(math.ok).toBe(true);
    expect(history.ok).toBe(true);
    if (math.ok && history.ok) {
      expect(filterRoutines([math.value, history.value], "matemática")).toEqual([math.value]);
    }
  });

  it("sorts routines by class subject with weekday and time fallback", () => {
    const history = buildRoutine({ ...validRoutinePayload, subject: "História", startTime: "10:00", endTime: "11:00" });
    const math = buildRoutine({ ...validRoutinePayload, subject: "Matemática", startTime: "08:00" });

    expect(history.ok).toBe(true);
    expect(math.ok).toBe(true);
    if (history.ok && math.ok) {
      expect(sortRoutines([math.value, history.value], "subject").map((routine) => routine.subject)).toEqual([
        "História",
        "Matemática",
      ]);
    }
  });
});

describe("state normalization", () => {
  it("normalizes old routines without class subject to an empty string", () => {
    const state = normalizeState({
      schemaVersion: 2,
      routines: [
        {
          ...validRoutinePayload,
          subject: undefined,
        },
      ],
      teachers: [],
      rooms: [],
      devices: [],
      settings: {},
    });

    expect(state.routines[0]?.subject).toBe("");
  });

  it("removes the legacy fixed-equipment import note from existing routines", () => {
    const state = normalizeState({
      schemaVersion: 2,
      routines: [
        {
          ...validRoutinePayload,
          notes: legacyFixedEquipmentImportNote,
        },
      ],
      teachers: [],
      rooms: [],
      devices: [],
      settings: {},
    });

    expect(state.routines[0]?.notes).toBe("");
  });
});

describe("buildCanonicalRoomName", () => {
  it("builds a canonical name from year and letter", () => {
    expect(buildCanonicalRoomName("6º ano EF", "B")).toBe("6º ano EF - B");
    expect(buildCanonicalRoomName("1º ano EM", "A")).toBe("1º ano EM - A");
  });

  it("uppercases the letter", () => {
    expect(buildCanonicalRoomName("3º ano EF", "c")).toBe("3º ano EF - C");
  });
});

describe("parseCanonicalRoomName", () => {
  it("parses a valid canonical name", () => {
    expect(parseCanonicalRoomName("6º ano EF - B")).toEqual({ year: "6º ano EF", letter: "B" });
    expect(parseCanonicalRoomName("3º ano EM - A")).toEqual({ year: "3º ano EM", letter: "A" });
  });

  it("returns null for legacy non-canonical names", () => {
    expect(parseCanonicalRoomName("Sala 12")).toBeNull();
    expect(parseCanonicalRoomName("1A")).toBeNull();
    expect(parseCanonicalRoomName("Laboratório")).toBeNull();
  });

  it("returns null for names with valid pattern but invalid year", () => {
    expect(parseCanonicalRoomName("10º ano EF - A")).toBeNull();
    expect(parseCanonicalRoomName("Sala - A")).toBeNull();
  });
});

describe("isCanonicalRoomName", () => {
  it("returns true for a canonical name with allowed letter", () => {
    expect(isCanonicalRoomName("6º ano EF - B", CLASS_LETTERS)).toBe(true);
    expect(isCanonicalRoomName("1º ano EM - A", CLASS_LETTERS)).toBe(true);
    expect(isCanonicalRoomName("6º ano EF - Z", CLASS_LETTERS)).toBe(true);
  });

  it("returns false for a legacy non-canonical name", () => {
    expect(isCanonicalRoomName("Sala 12", CLASS_LETTERS)).toBe(false);
    expect(isCanonicalRoomName("1A", CLASS_LETTERS)).toBe(false);
  });

  it("returns false for names with invalid letters", () => {
    expect(isCanonicalRoomName("6º ano EF - AA", CLASS_LETTERS)).toBe(false);
    expect(isCanonicalRoomName("6º ano EF - Ç", CLASS_LETTERS)).toBe(false);
    expect(isCanonicalRoomName("6º ano EF - 1", CLASS_LETTERS)).toBe(false);
  });

  it("handles non-string input safely", () => {
    expect(isCanonicalRoomName(null, CLASS_LETTERS)).toBe(false);
    expect(isCanonicalRoomName(undefined, CLASS_LETTERS)).toBe(false);
    expect(isCanonicalRoomName(42, CLASS_LETTERS)).toBe(false);
  });
});

describe("CLASS_LETTERS", () => {
  it("contains the full alphabet from A to Z", () => {
    expect(CLASS_LETTERS).toHaveLength(26);
    expect(CLASS_LETTERS[0]).toBe("A");
    expect(CLASS_LETTERS[25]).toBe("Z");
    expect(CLASS_LETTERS).toEqual("ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""));
  });
});

describe("createEmptyState", () => {
  it("does not persist customizable class letters", () => {
    const state = createEmptyState();
    expect("classLetters" in state.settings).toBe(false);
  });
});

describe("normalizeState with classLetters", () => {
  it("ignores legacy saved classLetters without breaking import", () => {
    const state = normalizeState({ routines: [], settings: { classLetters: ["A", "B", "C", "D"] } });
    expect("classLetters" in state.settings).toBe(false);
  });

  it("preserves legacy routines with non-canonical room during import", () => {
    const state = normalizeState({
      routines: [{ ...validRoutinePayload, room: "Sala 12" }],
      settings: {},
    });
    expect(state.routines[0]?.room).toBe("Sala 12");
  });

  it("preserves legacy routines with legacy '1A' room during import", () => {
    const state = normalizeState({
      routines: [{ ...validRoutinePayload, room: "1A" }],
      settings: {},
    });
    expect(state.routines[0]?.room).toBe("1A");
  });
});
