import { describe, expect, it } from "vitest";
import { buildRoomSelectOptions } from "./routine-form";
import type { Room } from "../../domain/types";

function makeRoom(name: string, id = "1"): Room {
  return { id, name, studentCount: null, createdAt: "", updatedAt: "" };
}

describe("buildRoomSelectOptions", () => {
  it("returns empty array when no rooms are registered", () => {
    expect(buildRoomSelectOptions([])).toEqual([]);
  });

  it("returns the name of each registered room", () => {
    const rooms = [makeRoom("6º ano EF - A"), makeRoom("7º ano EF - B", "2")];
    expect(buildRoomSelectOptions(rooms)).toEqual(["6º ano EF - A", "7º ano EF - B"]);
  });

  it("does not include unregistered year/letter combinations", () => {
    const rooms = [makeRoom("6º ano EF - A")];
    const options = buildRoomSelectOptions(rooms);
    expect(options).not.toContain("1º ano EF - A");
    expect(options).not.toContain("3º ano EM - Z");
    expect(options).toHaveLength(1);
  });
});
