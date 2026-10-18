import { chatErrorText } from "../helpers/chatRequest";
import { readGrowSettings } from "../helpers/growStore";
import { bankDisplayText } from "../helpers/bankDisplayText";
import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send } from "lucide-react";
import { Button } from "./Button";
import { Textarea } from "./Textarea";
import { streamChat } from "../helpers/chatClient";
import { useOttoData } from "../helpers/useOttoData";
import { getChat } from "../endpoints/chat_GET.schema";
import s from "./OttoChat.module.css";
type Message = { role: "user" | "assistant"; content: string };
export default function OttoChat({
  source,
  level,
  day,
  contextLabel,
}: {
  source: "demo" | "nessie";
  level: 0 | 1 | 2 | 3 | 4;
  day: number;
  contextLabel?: string;
}) {
  const [open, setOpen] = useState(false),
    [messages, setMessages] = useState<Message[]>([]),
    [draft, setDraft] = useState(""),
    [busy, setBusy] = useState(false),
    [retryQuestion, setRetryQuestion] = useState(""),
    [error, setError] = useState(""),
    [mode, setMode] = useState<"checking" | "demo" | "ai" | "unavailable">(
      "checking",
    );
  const d = useOttoData();
  const controller = useRef<AbortController | null>(null);
  const log = useRef<HTMLDivElement>(null),
    lock = useRef(false);
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [messages, busy]);
  useEffect(() => {
    let active = true;
    getChat()
      .then((result) => {
        if (active) setMode(result.configured ? "ai" : "demo");
      })
      .catch(() => {
        if (active) setMode("unavailable");
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    controller.current?.abort();
    controller.current = null;
    lock.current = false;
    setBusy(false);
    setMessages([]);
    setError("");
    setRetryQuestion("");
  }, [source, level, contextLabel]);
  async function send(question: string, retry = false) {
    if (d.loading || lock.current || !question.trim()) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setDraft("");
    const next: Message[] = retry
      ? messages
      : [...messages.slice(-10), { role: "user", content: question.trim() }];
    setMessages(next);
    const abort = new AbortController();
    controller.current = abort;
    try {
      await streamChat(
        {
          source,
          level,
          day,
          messages: [{ role: "user", content: question.trim() }],
          growSettings: readGrowSettings(source),
          plannedBills: d.state.bills.filter((b) => b.id.startsWith("manual:")),
        },
        abort.signal,
        (text) => {
          if (!abort.signal.aborted)
            setMessages([...next, { role: "assistant", content: text }]);
        },
        (value) => {
          if (!abort.signal.aborted) setMode(value === "ai" ? "ai" : "demo");
        },
      );
      setRetryQuestion("");
    } catch (e) {
      if (!abort.signal.aborted) {
        setMessages(next);
        setError(chatErrorText(e));
        setRetryQuestion(question);
      }
    } finally {
      if (controller.current === abort) {
        setBusy(false);
        lock.current = false;
        controller.current = null;
      }
    }
  }
  return (
    <div className={s.widget}>
      {open && (
        <section
          className={s.window}
          role="dialog"
          aria-label="Ask OTTO"
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
        >
          <header>
            <div>
              <strong>Ask OTTO</strong>
              <small>
                {contextLabel || `Day ${day} · Level ${level}`} ·{" "}
                {source === "nessie" ? "Bank sandbox" : "Sample month"}
              </small>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Close chat"
              onClick={() => setOpen(false)}
            >
              <X size={17} />
            </Button>
          </header>
          <div className={s.log} ref={log} role="log" aria-live="polite">
            {messages.length === 0 && (
              <>
                <p>
                  Ask about your balance, a decision, or anything on your mind.
                </p>
                {[
                  "Why move the Pepco bill?",
                  "Explain the autonomy levels.",
                ].map((q) => (
                  <Button
                    key={q}
                    variant="outline"
                    size="sm"
                    onClick={() => void send(q)}
                    disabled={busy || d.loading}
                  >
                    {q}
                  </Button>
                ))}
              </>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? s.user : s.reply}>
                {m.role === "user" ? m.content : bankDisplayText(m.content)}
              </div>
            ))}
            {busy && <p>OTTO is thinking…</p>}
            {error && (
              <p role="alert" className={s.error}>
                {error}{" "}
                <button
                  onClick={() => void send(retryQuestion, true)}
                  disabled={busy || d.loading}
                >
                  Retry
                </button>
              </p>
            )}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(draft);
            }}
          >
            <Textarea
              aria-label="Your question for OTTO"
              disabled={d.loading}
              placeholder="What's on your mind?"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  void send(draft);
                }
              }}
              maxLength={2000}
            />
            {busy && (
              <Button
                type="button"
                size="sm"
                onClick={() => controller.current?.abort()}
              >
                Stop
              </Button>
            )}
            <Button
              type="submit"
              size="icon-sm"
              disabled={busy || d.loading || !draft.trim()}
              aria-label="Send question"
            >
              <Send size={16} />
            </Button>
          </form>
          <footer>
            {mode === "demo"
              ? "Free financial assistant · No paid AI calls"
              : mode === "checking"
                ? "Checking chat connection…"
                : mode === "unavailable"
                  ? "Chat connection unavailable."
                  : "Free financial assistant · No paid AI calls"}
          </footer>
        </section>
      )}
      <Button
        className={s.launcher}
        aria-label="Ask OTTO"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <MessageCircle size={18} />
        <span className={s.launcherText}>Ask OTTO</span>
      </Button>
    </div>
  );
}
