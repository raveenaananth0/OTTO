// LOCAL preview adapter. No email is sent, no live model is called, and no banking write is made.
import superjson from "superjson";
import { sanitizeWorkspace } from "./src/helpers/sanitizeWorkspace";
import { mergeManualSubscriptions } from "./src/helpers/manualSubscriptions";
import { fakeMonth } from "./src/helpers/fakeMonth";
import { projectFuture } from "./src/helpers/projectFuture";
import { futureState } from "./src/helpers/futureState";
import { demoOttoReply } from "./src/helpers/demoOttoReply";
import { schema as generalChatSchema } from "./src/endpoints/chat_POST.schema";
import { demoFutureReply } from "./src/helpers/demoFutureReply";
import { changeWorkspace } from "./src/helpers/changeWorkspace";
import { schema as workspaceSchema } from "./src/endpoints/workspace_POST.schema";
import { schema as chatSchema } from "./src/endpoints/future-chat_POST.schema";
import type { Workspace } from "./src/helpers/ottoWorkspace";
const nativeFetch = window.fetch.bind(window);
let bankingState = fakeMonth;
let memory: Workspace = { forks: [], subscriptionRequests: {} };
let storageFailed = false;
function read(): Workspace {
  if (!storageFailed)
    try {
      const raw = localStorage.getItem("otto-preview-workspace");
      if (!raw) memory = { forks: [], subscriptionRequests: {} };
      if (raw) {
        const value = JSON.parse(raw);
        memory = sanitizeWorkspace(value);
      }
    } catch {
      storageFailed = true;
    }
  return structuredClone(memory);
}
window.fetch = async (input, init) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.pathname
        : input.url;
  if (!url.startsWith("/_api/")) return nativeFetch(input, init);
  const route = url.slice(6);
  let data: unknown,
    status = 200;
  try {
    if (route === "nessie") {
      const response = await nativeFetch(input, init);
      if (response.ok) {
        const result = superjson.parse<{ state: typeof fakeMonth }>(
          await response.clone().text(),
        );
        bankingState = result.state;
      }
      return response;
    }
    if (route === "future-chat") {
      if (init?.method === "POST") {
        const body = chatSchema.parse(superjson.parse(String(init.body)));
        data = {
          reply: demoFutureReply(
            fakeMonth,
            body.habits,
            body.messages.at(-1)!.content,
          ),
          mode: "demo",
        };
      } else data = { mode: "demo" };
    } else if (route === "chat" || route === "otto-chat" || route === "grow") {
      return nativeFetch(input, init);
    } else if (route === "actions")
      throw new Error(
        "Direct payments are disabled. Use the approval email preview; no Nessie action was sent.",
      );
    else if (route === "workspace") {
      let workspace = read();
      if (init?.method === "POST") {
        const body = workspaceSchema.parse(superjson.parse(String(init.body)));
        if (body.action === "commit") {
          const fork = workspace.forks.find((f) => f.id === body.id);
          if (
            !fork ||
            !projectFuture(
              futureState(
                mergeManualSubscriptions(
                  fork.source === "nessie" ? bankingState : fakeMonth,
                ),
                fork.source,
              ),
              fork.habits,
            ).feasible
          )
            throw new Error(
              "This plan allocates more than the month provides.",
            );
        }
        workspace = changeWorkspace(
          workspace,
          body,
          crypto.randomUUID(),
          new Date().toISOString(),
        );
        memory = workspace;
        if (!storageFailed)
          try {
            localStorage.setItem(
              "otto-preview-workspace",
              JSON.stringify(workspace),
            );
          } catch {
            storageFailed = true;
          }
      }
      data = workspace;
    } else throw new Error("Unknown route.");
  } catch (error) {
    data = {
      error: error instanceof Error ? error.message : "Local preview error.",
    };
    status = 503;
  }
  return new Response(superjson.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
};
