import { useEffect, useRef, useState } from "react";
import type { Conversation } from "../../lib/chatStore";
import MessageBubble from "./MessageBubble";
import { ChatIcon } from "./ChatIcon";
import styles from "./chat.module.css";
import { useOttoData } from "../../helpers/useOttoData";
import { formatMoney } from "../../helpers/formatMoney";
const suggestions = [
  "Can I afford a $60 concert ticket?",
  "Why am I broke by the 20th?",
  "What subscriptions should I cancel?",
  "How much did I spend on food delivery?",
];
export default function ChatWindow({
  conversation,
  onToggleSidebar,
  sidebarOpen,
  busy,
  dataLoading,
  partial,
  error,
  mode,
  onSend,
  onStop,
  onRetry,
}: {
  conversation: Conversation;
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
  busy: boolean;
  dataLoading: boolean;
  partial: string;
  error: string;
  mode: string;
  onSend: (q: string) => void;
  onStop: () => void;
  onRetry: () => void;
}) {
  const banking = useOttoData();
  const [draft, setDraft] = useState(""),
    endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [conversation.messages, partial, busy]);
  function send() {
    if (busy || dataLoading || !draft.trim()) return;
    onSend(draft);
    setDraft("");
  }
  return (
    <section className={styles.chatWindow} aria-label="Chat conversation">
      <header className={styles.conversationHeader}>
        <button
          className={styles.openSidebar}
          onClick={onToggleSidebar}
          aria-label="Open conversation menu"
          aria-controls="conversation-sidebar"
          aria-expanded={sidebarOpen}
        >
          <ChatIcon name="menu" />
        </button>
        <div>
          <span className={styles.headerEyebrow}>OTTO CHAT</span>
          <h1>{conversation.title}</h1>
        </div>
      </header>
      <div className={styles.bankContext} aria-label="Banking context for chat">
        <strong>
          {banking.source === "nessie"
            ? "Connected account context"
            : "Sample banking context"}
        </strong>
        <span>
          Checking {formatMoney(banking.state.checking)} · Savings{" "}
          {formatMoney(banking.state.savings)}
        </span>
      </div>
      <div className={styles.messageScroll}>
        <div className={styles.messageColumn}>
          {!conversation.messages.length && !busy && (
            <div className={styles.emptyState}>
              <h2>Ask Otto anything</h2>
              <p>A little clarity, one question at a time.</p>
              <div className={styles.suggestions}>
                {suggestions.map((q) => (
                  <button
                    key={q}
                    disabled={dataLoading}
                    onClick={() => onSend(q)}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div role="log" aria-label="Conversation messages">
            {conversation.messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {partial && (
              <MessageBubble
                message={{
                  id: "stream",
                  role: "assistant",
                  content: partial,
                  createdAt: 0,
                }}
              />
            )}
            {busy && !partial && <p role="status">Otto is thinking…</p>}
          </div>
          {!busy && !error && conversation.messages.at(-1)?.role === "user" && (
            <button onClick={onRetry} disabled={dataLoading}>
              Retry last message
            </button>
          )}
          {error && (
            <p role="alert">
              {error}{" "}
              <button onClick={onRetry} disabled={busy || dataLoading}>
                Retry
              </button>
            </p>
          )}
          <div ref={endRef} />
        </div>
      </div>
      <div className={styles.composerDock}>
        <div className={styles.composerColumn}>
          <form
            className={styles.composer}
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <label className={styles.srOnly} htmlFor="otto-chat-draft">
              Message Otto
            </label>
            <textarea
              id="otto-chat-draft"
              disabled={dataLoading}
              placeholder="Ask Otto anything…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              maxLength={2000}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <div className={styles.composerBottom}>
              <span>Shift + Enter for a new line</span>
              {busy ? (
                <button type="button" onClick={onStop}>
                  Stop
                </button>
              ) : (
                <button
                  type="submit"
                  className={styles.sendButton}
                  disabled={dataLoading || !draft.trim()}
                  aria-label="Send message"
                >
                  <ChatIcon name="send" size={17} />
                </button>
              )}
            </div>
          </form>
          {dataLoading && <small role="status">Loading financial data…</small>}
          {mode === "fallback" && (
            <small>Free financial assistant · No paid AI calls</small>
          )}
        </div>
      </div>
    </section>
  );
}
