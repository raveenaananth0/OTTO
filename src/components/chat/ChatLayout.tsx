import { chatErrorText } from "../../helpers/chatRequest";
import { readGrowSettings } from "../../helpers/growStore";
import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import * as store from "../../lib/chatStore";
import { streamChat } from "../../helpers/chatClient";
import { useOttoData } from "../../helpers/useOttoData";
import Sidebar from "./Sidebar";
import ChatWindow from "./ChatWindow";
import styles from "./chat.module.css";
export default function ChatLayout() {
  const [params, setParams] = useSearchParams(),
    d = useOttoData();
  const savedChats = () =>
    store.listConversations().filter((c) => c.messages.length > 0);
  const [conversations, setConversations] = useState(savedChats),
    [sidebarOpen, setSidebarOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [mode, setMode] = useState(""),
    [partial, setPartial] = useState(""),
    [editing, setEditing] = useState<{
      id: string;
      action: "rename" | "delete" | "clear";
    } | null>(null),
    [title, setTitle] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    if (editing) node?.showModal();
    return () => node?.close();
  }, [editing]);
  const controller = useRef<AbortController | null>(null),
    lock = useRef(false);
  const selected = conversations.find((c) => c.id === params.get("id"));
  const empty: store.Conversation = {
    id: "",
    title: "Ask Otto anything",
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  function reload() {
    setConversations(savedChats());
  }
  function stop() {
    controller.current?.abort();
  }
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    stop();
    setPartial("");
    setError("");
    setMode("");
  }, [d.source]);
  useEffect(() => {
    window.addEventListener("storage", reload);
    return () => window.removeEventListener("storage", reload);
  }, []);
  function select(id: string) {
    stop();
    setError("");
    setPartial("");
    setParams({ id });
    setSidebarOpen(false);
  }
  function newChat() {
    stop();
    setError("");
    setPartial("");
    setParams({});
    setSidebarOpen(false);
  }
  async function send(question: string, retry = false) {
    if (d.loading || lock.current || (!question.trim() && !retry)) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setPartial("");
    let conv = selected || store.createConversation();
    if (!retry) {
      conv = store.saveConversation({
        ...conv,
        messages: [
          ...conv.messages,
          {
            id: crypto.randomUUID(),
            role: "user",
            content: question.trim(),
            createdAt: Date.now(),
          },
        ],
      });
    }
    reload();
    setParams({ id: conv.id });
    const base = conv,
      assistantId = crypto.randomUUID();
    const abort = new AbortController();
    controller.current = abort;
    try {
      await streamChat(
        {
          source: d.source,
          level: 4,
          day: 0,
          messages: [{ role: "user", content: base.messages.at(-1)!.content }],
          growSettings: readGrowSettings(d.source),
          plannedBills: d.state.bills.filter((b) => b.id.startsWith("manual:")),
        },
        abort.signal,
        (next) => {
          if (abort.signal.aborted || !store.getConversation(base.id)) return;
          setPartial(next);
          store.saveConversation({
            ...base,
            title: store.getConversation(base.id)?.title || base.title,
            messages: [
              ...base.messages,
              {
                id: assistantId,
                role: "assistant",
                content: next,
                createdAt: Date.now(),
              },
            ],
          });
        },
        setMode,
      );
    } catch (e) {
      if (!abort.signal.aborted) {
        setMode("");
        // Retry uses the same user message and replaces any incomplete answer.
        if (store.getConversation(base.id))
          store.saveConversation({
            ...base,
            title: store.getConversation(base.id)!.title,
          });
        setError(chatErrorText(e));
      }
    } finally {
      setPartial("");
      reload();
      setBusy(false);
      lock.current = false;
      controller.current = null;
    }
  }
  return (
    <div className={styles.page}>
      {params.get("id") && !selected && !busy && (
        <p role="status">
          This conversation isn’t saved in this browser. Start a new chat or
          choose one from the sidebar.
        </p>
      )}
      <div className={styles.workspace}>
        <Sidebar
          conversations={conversations}
          selectedId={selected?.id ?? null}
          mobileOpen={sidebarOpen}
          referenceTime={Date.now()}
          onClose={() => setSidebarOpen(false)}
          onNewChat={newChat}
          onSelect={select}
          onRename={(id) => {
            setTitle(store.getConversation(id)?.title || "");
            setEditing({ id, action: "rename" });
          }}
          onDelete={(id) => setEditing({ id, action: "delete" })}
          onClearHistory={() => setEditing({ id: "", action: "clear" })}
        />
        <ChatWindow
          key={selected?.id || "new"}
          conversation={selected || empty}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          sidebarOpen={sidebarOpen}
          busy={busy}
          dataLoading={d.loading}
          partial={partial}
          error={error}
          mode={mode}
          onSend={(q) => void send(q)}
          onStop={stop}
          onRetry={() => {
            if (selected?.messages.at(-1)?.role === "user") void send("", true);
          }}
        />
      </div>
      {editing && (
        <dialog
          ref={dialog}
          className={styles.modal}
          aria-label={
            editing.action === "rename"
              ? "Rename conversation"
              : editing.action === "clear"
                ? "Clear chat history"
                : "Delete conversation"
          }
          onCancel={(e) => {
            e.preventDefault();
            setEditing(null);
          }}
        >
          <h2>
            {editing.action === "rename"
              ? "Rename conversation"
              : editing.action === "clear"
                ? "Clear chat history?"
                : "Delete conversation?"}
          </h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (editing.action === "rename") {
                if (!title.trim()) return;
                store.renameConversation(editing.id, title.trim());
              } else if (editing.action === "clear") {
                stop();
                setParams({});
                setError("");
                setPartial("");
                store.clearConversations();
              } else {
                if (editing.id === selected?.id) {
                  stop();
                  setParams({});
                }
                store.deleteConversation(editing.id);
              }
              reload();
              setEditing(null);
            }}
          >
            {editing.action === "rename" ? (
              <label>
                Title
                <input
                  autoFocus
                  required
                  maxLength={100}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
            ) : (
              <p>
                {editing.action === "clear"
                  ? "This removes all saved conversations from this browser, including earlier test chats. It cannot be undone. Your financial data is unchanged."
                  : "This removes this conversation from this browser. It cannot be undone."}
              </p>
            )}
            <div>
              <button type="button" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={editing.action === "rename" && !title.trim()}
                autoFocus={editing.action !== "rename"}
              >
                {editing.action === "rename"
                  ? "Save name"
                  : editing.action === "clear"
                    ? "Clear history"
                    : "Delete conversation"}
              </button>
            </div>
          </form>
        </dialog>
      )}
    </div>
  );
}
