import { schema, type InputType } from "../endpoints/chat_POST.schema";
export const LONG_MESSAGE_ERROR =
  "That message is too long, keep it under 2,000 characters.";
// The assistant is rule based. History is only for display, never an API input.
export function newestChatRequest(body: InputType): InputType {
  const latest = body.messages.at(-1);
  if (latest && latest.content.trim().length > 2000)
    throw Error(LONG_MESSAGE_ERROR);
  const result = schema.safeParse({
    ...body,
    messages: latest ? [latest] : [],
  });
  if (!result.success) throw Error("Please enter a valid question.");
  return result.data;
}
export function chatErrorText(error: unknown) {
  const text = error instanceof Error ? error.message : "";
  return text === LONG_MESSAGE_ERROR
    ? text
    : `Otto couldn't respond, try again.${text ? " " + text : ""}`;
}
