export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
};

export type Conversation = {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
};

export const CHAT_STORAGE_KEY = "otto.conversations.v1";
const NEW_CHAT_TITLE = "New chat";

// If storage is blocked or full, keep chats usable for this browser session.
let memoryConversations: Conversation[] = [];
let storageFailed = false;

function copyConversation(conversation: Conversation): Conversation {
  return {
    ...conversation,
    messages: conversation.messages.map((message) => ({ ...message })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMessage(value: unknown): value is ChatMessage {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    (value.role === "user" || value.role === "assistant") &&
    typeof value.content === "string" &&
    typeof value.createdAt === "number" &&
    Number.isFinite(value.createdAt)
  );
}

function isConversation(value: unknown): value is Conversation {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.title === "string" &&
    Array.isArray(value.messages) &&
    value.messages.every(isMessage) &&
    typeof value.createdAt === "number" &&
    Number.isFinite(value.createdAt) &&
    typeof value.updatedAt === "number" &&
    Number.isFinite(value.updatedAt)
  );
}

export function uniqueChatTitle(
  title: string,
  others: Pick<Conversation, "title">[],
  createdAt: number,
) {
  const exists = (candidate: string) =>
    others.some(
      (c) => c.title.toLocaleLowerCase() === candidate.toLocaleLowerCase(),
    );
  if (!exists(title)) return title;
  const date = new Date(createdAt);
  const time = new Date(
    Number.isFinite(date.getTime()) ? createdAt : Date.now(),
  ).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
  const timed = `${title} · ${time}`;
  let unique = timed,
    n = 2;
  while (exists(unique)) unique = `${timed} (${n++})`;
  return unique;
}

function readConversations(): Conversation[] {
  // Importing this helper during server rendering must not touch browser storage
  // or share an in-memory conversation between server requests.
  if (typeof window === "undefined") return [];

  if (!storageFailed) {
    let raw: string | null | undefined;
    try {
      raw = window.localStorage.getItem(CHAT_STORAGE_KEY);
    } catch {
      storageFailed = true;
    }

    if (raw !== undefined) {
      try {
        const parsed: unknown = raw === null ? [] : JSON.parse(raw);
        if (!Array.isArray(parsed)) throw new Error("Invalid chat storage.");
        const valid = parsed.filter(isConversation).map(copyConversation);
        const unique: Conversation[] = [];
        for (const conversation of valid) {
          if (conversation.messages.length)
            conversation.title = uniqueChatTitle(
              conversation.title,
              unique,
              conversation.createdAt,
            );
          unique.push(conversation);
        }
        memoryConversations = unique;
      } catch {
        // Keep the last valid copy; the next save can replace corrupted JSON.
      }
    }
  }

  return memoryConversations.map(copyConversation);
}

function writeConversations(conversations: Conversation[]): void {
  if (typeof window === "undefined") return;

  memoryConversations = conversations.map(copyConversation);
  if (storageFailed) return;

  try {
    window.localStorage.setItem(
      CHAT_STORAGE_KEY,
      JSON.stringify(memoryConversations),
    );
  } catch {
    // Stay in memory mode: a later read of old storage must not erase new messages.
    storageFailed = true;
  }
}

function makeId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );
}

function titleFromMessage(content: string): string {
  const characters = Array.from(content.trim().replace(/\s+/g, " "));
  return characters.slice(0, 40).join("") + (characters.length > 40 ? "…" : "");
}

export function listConversations(): Conversation[] {
  return readConversations().sort(
    (a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt,
  );
}

export function getConversation(id: string): Conversation | null {
  return (
    listConversations().find((conversation) => conversation.id === id) ?? null
  );
}

export function createConversation(): Conversation {
  const now = Date.now();
  return saveConversation({
    id: makeId(),
    title: NEW_CHAT_TITLE,
    messages: [],
    createdAt: now,
    updatedAt: now,
  });
}

// The chat UI calls this after every message, and keeps the returned auto-title.
export function saveConversation(conversation: Conversation): Conversation {
  const saved = copyConversation(conversation);
  const firstUserMessage = saved.messages.find(
    (message) => message.role === "user" && message.content.trim(),
  );

  if (
    (!saved.title.trim() || saved.title === NEW_CHAT_TITLE) &&
    firstUserMessage
  ) {
    saved.title = titleFromMessage(firstUserMessage.content);
  }
  if (!saved.title.trim()) saved.title = NEW_CHAT_TITLE;
  saved.updatedAt = Date.now();

  const others = readConversations().filter((item) => item.id !== saved.id);
  if (saved.messages.length)
    saved.title = uniqueChatTitle(saved.title, others, saved.createdAt);
  writeConversations([saved, ...others]);
  return copyConversation(saved);
}

export function renameConversation(
  id: string,
  title: string,
): Conversation | null {
  const conversation = getConversation(id);
  const trimmedTitle = title.trim();
  if (!conversation || !trimmedTitle) return conversation;

  return saveConversation({ ...conversation, title: trimmedTitle });
}

// Confirmation belongs in the UI, before it calls this function.
export function deleteConversation(id: string): void {
  const conversations = readConversations();
  if (!conversations.some((conversation) => conversation.id === id)) return;
  writeConversations(
    conversations.filter((conversation) => conversation.id !== id),
  );
}

// Called only after the user confirms clearing this browser's history.
export function clearConversations(): void {
  writeConversations([]);
}
