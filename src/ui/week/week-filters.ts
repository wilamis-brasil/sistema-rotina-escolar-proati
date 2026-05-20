import type { AppActions } from "../../app/controller";
import { qsa } from "../dom";
import type { UIRefs } from "../ui-refs";

type WeekFilterRefs = Pick<
  UIRefs,
  "routineFilter" | "filterTimeStart" | "filterTimeEnd" | "filterTeacher" | "filterRoom"
>;

interface WeekFilterState {
  filterText: string;
  weekdays: Set<string>;
  timeStart: string;
  timeEnd: string;
  teacher: string;
  room: string;
  devices: Set<string>;
}

export function readWeekFilters(refs: WeekFilterRefs): WeekFilterState {
  return {
    filterText: refs.routineFilter.value,
    weekdays: new Set(
      [...qsa<HTMLInputElement>("#filter-weekday-chips input:checked")].map((cb) => cb.value),
    ),
    timeStart: refs.filterTimeStart.value,
    timeEnd: refs.filterTimeEnd.value,
    teacher: refs.filterTeacher.value,
    room: refs.filterRoom.value,
    devices: new Set(
      [...qsa<HTMLInputElement>("#filter-device-chips input:checked")].map((cb) => cb.value),
    ),
  };
}

export function hasActiveFilters(filters: WeekFilterState): boolean {
  return (
    !!filters.filterText ||
    filters.weekdays.size > 0 ||
    !!filters.timeStart ||
    !!filters.timeEnd ||
    !!filters.teacher ||
    !!filters.room ||
    filters.devices.size > 0
  );
}

export function clearWeekFilters({
  refs,
  actions,
}: {
  refs: WeekFilterRefs;
  actions: AppActions;
}): void {
  refs.routineFilter.value = "";
  actions.updateUiFilters({ filterText: "" });
  qsa<HTMLInputElement>("#filter-weekday-chips input").forEach((cb) => {
    cb.checked = false;
  });
  refs.filterTimeStart.value = "";
  refs.filterTimeEnd.value = "";
  refs.filterTeacher.value = "";
  refs.filterRoom.value = "";
  qsa<HTMLInputElement>("#filter-device-chips input").forEach((cb) => {
    cb.checked = false;
  });
}
