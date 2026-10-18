import { bankDisplayText } from "../../helpers/bankDisplayText";
import Markdown from "./Markdown";
import type { ChatMessage } from "../../lib/chatStore";
import { OttoMark } from "./ChatIcon";
import styles from "./chat.module.css";
export default function MessageBubble({ message }: { message: ChatMessage }) {
  const user = message.role === "user";
  return (
    <article
      className={user ? styles.userMessage : styles.assistantMessage}
      aria-label={user ? "Your message" : "Otto's reply"}
    >
      {!user && (
        <span className={styles.avatar}>
          <OttoMark size={29} />
        </span>
      )}
      <div className={styles.messageBody}>
        <span className={styles.speaker}>{user ? "You" : "Otto"}</span>
        <div className={styles.bubble}>
          {user ? message.content : <Markdown text={bankDisplayText(message.content)} />}
        </div>
      </div>
    </article>
  );
}
