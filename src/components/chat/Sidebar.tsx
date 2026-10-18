import { useEffect, useRef } from "react";
import type { Conversation } from "../../lib/chatStore";
import { ChatIcon } from "./ChatIcon";
import styles from "./chat.module.css";
type Props = {
  conversations: Conversation[];
  selectedId: string | null;
  mobileOpen: boolean;
  referenceTime: number;
  onClose: () => void;
  onSelect?: (id: string) => void;
  onNewChat?: () => void;
  onRename?: (id: string) => void;
  onDelete?: (id: string) => void;
  onClearHistory?: () => void;
};
function groupFor(timestamp: number, referenceTime: number) {
  const today = new Date(referenceTime),
    date = new Date(timestamp);
  if (date.toDateString() === today.toDateString()) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  return date.toDateString() === yesterday.toDateString()
    ? "Yesterday"
    : "Earlier";
}
export default function Sidebar({
  conversations,
  selectedId,
  mobileOpen,
  referenceTime,
  onClose,
  onSelect,
  onNewChat,
  onRename,
  onDelete,
  onClearHistory,
}: Props) {
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!mobileOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    return () => previousFocus?.focus();
  }, [mobileOpen]);
  const groups = ["Today", "Yesterday", "Earlier"];
  return (
    <>
      {mobileOpen && (
        <button
          className={styles.backdrop}
          aria-label="Close conversation menu"
          onClick={onClose}
        />
      )}
      <aside
        id="conversation-sidebar"
        className={[styles.sidebar, mobileOpen ? styles.sidebarOpen : ""].join(
          " ",
        )}
        aria-label="Conversation history"
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <div className={styles.sidebarTop}>
          <span className={styles.sidebarTitle}>YOUR CONVERSATIONS</span>
          <button
            ref={closeButton}
            className={styles.closeSidebar}
            aria-label="Close conversation menu"
            onClick={onClose}
          >
            <ChatIcon name="close" />
          </button>
        </div>
        <button
          className={styles.newChat}
          disabled={!onNewChat}
          title={
            onNewChat
              ? "Start a new conversation"
              : "New conversations connect in step 3"
          }
          onClick={onNewChat}
        >
          <ChatIcon name="plus" /> New chat
        </button>
        {conversations.length > 0 && (
          <button className={styles.clearHistory} onClick={onClearHistory}>
            Clear chat history
          </button>
        )}
        <p className={styles.historyNote}>Saved only in this browser.</p>
        <nav aria-label="Past conversations" className={styles.history}>
          {groups.map((group) => {
            const items = conversations
              .filter((c) => groupFor(c.updatedAt, referenceTime) === group)
              .sort((a, b) => b.updatedAt - a.updatedAt);
            return (
              items.length > 0 && (
                <section key={group} className={styles.historyGroup}>
                  <h2>{group}</h2>
                  {items.map((c) => (
                    <div
                      className={[
                        styles.conversation,
                        c.id === selectedId ? styles.selected : "",
                      ].join(" ")}
                      key={c.id}
                    >
                      <button
                        className={styles.conversationButton}
                        title={c.title}
                        disabled={!onSelect}
                        aria-current={c.id === selectedId ? "page" : undefined}
                        onClick={() => onSelect?.(c.id)}
                      >
                        <ChatIcon name="chat" size={15} />
                        <span>{c.title}</span>
                      </button>
                      <details className={styles.conversationMenu}>
                        <summary aria-label={"Options for " + c.title}>
                          •••
                        </summary>
                        <div className={styles.dropdown}>
                          <button
                            disabled={!onRename}
                            onClick={() => onRename?.(c.id)}
                          >
                            Rename
                          </button>
                          <button
                            disabled={!onDelete}
                            onClick={() => onDelete?.(c.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </details>
                    </div>
                  ))}
                </section>
              )
            );
          })}
        </nav>
      </aside>
    </>
  );
}
