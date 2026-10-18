import type { Habits } from "./projectFuture";
import { ottoSchemas } from "./ottoSchemas";
export const habitDraft = {
  read(source: string, fallback: Habits): Habits {
    try {
      const raw = localStorage.getItem("otto-habit-draft:" + source);
      return raw ? ottoSchemas.habits.parse(JSON.parse(raw)) : fallback;
    } catch {
      return fallback;
    }
  },
  save(source: string, habits: Habits) {
    try {
      localStorage.setItem(
        "otto-habit-draft:" + source,
        JSON.stringify(habits),
      );
    } catch {
      /* The current editor stays usable if storage is blocked. */
    }
  },
};
