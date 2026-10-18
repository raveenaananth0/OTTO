import type { Workspace } from "./ottoWorkspace";
import type { InputType } from "../endpoints/workspace_POST.schema";
// Pure workspace changes; the caller validates affordability before committing.
export function changeWorkspace(
  input: Workspace,
  body: InputType,
  id: string,
  now: string,
): Workspace {
  const data = structuredClone(input);
  switch (body.action) {
    case "fork":
      if (data.forks.filter((f) => f.source === body.source).length >= 3)
        throw new Error(
          "Keep up to three forks. Remove one before saving another.",
        );
      data.forks.push({
        id,
        name: body.name,
        habits: body.habits,
        source: body.source,
        createdAt: now,
      });
      break;
    case "edit": {
      if (data.plan?.forkId === body.id)
        throw new Error("Pause this committed timeline before editing it.");
      const fork = data.forks.find((f) => f.id === body.id);
      if (!fork) throw new Error("Timeline not found.");
      fork.name = body.name;
      fork.habits = body.habits;
      break;
    }
    case "remove":
      if (data.plan?.forkId === body.id)
        throw new Error("Pause this committed timeline before removing it.");
      data.forks = data.forks.filter((f) => f.id !== body.id);
      break;
    case "commit": {
      const fork = data.forks.find((f) => f.id === body.id);
      if (!fork) throw new Error("Timeline not found.");
      data.plan = {
        forkId: fork.id,
        name: fork.name,
        habits: fork.habits,
        source: fork.source,
        committedAt: now,
        paydayEnabled: false,
      };
      break;
    }
    case "pause":
      delete data.plan;
      break;
    case "subscription":
      data.subscriptionRequests[body.id] = body.status;
  }
  return data;
}
