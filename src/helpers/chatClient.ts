import { newestChatRequest } from "./chatRequest";
import superjson from "superjson";
import { schema, type InputType } from "../endpoints/chat_POST.schema";
export async function streamChat(
  body: InputType,
  signal: AbortSignal,
  onText: (text: string) => void,
  onMode: (mode: string) => void = () => {},
) {
  const response = await fetch("/_api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: superjson.stringify(newestChatRequest(body)),
    signal,
  });
  if (!response.ok) {
    let message = "Otto couldn't respond, try again";
    try {
      const data = superjson.parse<{ error?: string }>(await response.text());
      if (typeof data.error === "string") message = data.error;
    } catch {}
    throw Error(message);
  }
  if (!response.headers.get("content-type")?.includes("text/event-stream")) {
    const data = superjson.parse<{ reply: unknown }>(await response.text());
    if (typeof data.reply !== "string" || !data.reply.trim())
      throw Error("Invalid chat reply. Try again.");
    onText(data.reply);
    return;
  }
  const reader = response.body?.getReader();
  if (!reader) throw Error("Empty chat response.");
  let buffer = "",
    text = "",
    done = false;
  const decoder = new TextDecoder();
  function consume(frame: string) {
    for (const line of frame.split("\n"))
      if (line.startsWith("data: ")) {
        const data = JSON.parse(line.slice(6));
        if (data.error)
          throw Error(
            typeof data.error === "string" ? data.error : "Chat failed.",
          );
        if (data.mode) onMode(String(data.mode));
        if (data.delta !== undefined) {
          if (typeof data.delta !== "string")
            throw Error("Invalid chat reply.");
          text += data.delta;
          if (text.length > 100000) throw Error("Reply too long.");
          onText(text);
        }
        if (data.done === true) done = true;
      }
  }
  try {
    while (true) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      buffer = buffer.replace(/\r\n/g, "\n");
      if (buffer.length > 200000) throw Error("Reply too long.");
      let index;
      while ((index = buffer.indexOf("\n\n")) >= 0) {
        consume(buffer.slice(0, index));
        buffer = buffer.slice(index + 2);
      }
      if (chunk.done) break;
    }
    if (buffer.trim()) consume(buffer);
    if (!done || !text.trim()) throw Error("Reply interrupted. Try again.");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
