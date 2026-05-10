import React, { useEffect, useRef, useState } from "react";
import { sendMessage } from "../../shared/api";
import { EmailContext } from "../../shared/office";
import { ConfirmDialog } from "./ConfirmDialog";
import { SuggestionChips } from "./SuggestionChips";

export interface Message {
  id: string;
  role: "user" | "agent";
  text: string;
  ts: number;
}

interface Props {
  emailContext: EmailContext | null;
}

export function ChatPanel({ emailContext }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "agent",
      text: "Hi! I'm your Sales Copilot. I can look up projects, update dates, log notes, and draft replies — all from this email. What would you like to do?",
      ts: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [pendingConfirm, setPendingConfirm] = useState<{
    description: string;
    payload: object;
  } | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(userMessage: string) {
    if (!userMessage.trim() || loading || !emailContext) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      text: userMessage.trim(),
      ts: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await sendMessage({
        emailContext,
        userMessage: userMessage.trim(),
        sessionId,
      });

      setSessionId(res.sessionId);

      if (res.requiresConfirm && res.proposedAction) {
        setPendingConfirm({
          description: res.proposedAction.description,
          payload: res.proposedAction.payload,
        });
      }

      const agentMsg: Message = {
        id: crypto.randomUUID(),
        role: "agent",
        text: res.reply,
        ts: Date.now(),
      };
      setMessages((prev) => [...prev, agentMsg]);
    } catch (err) {
      const errMsg: Message = {
        id: crypto.randomUUID(),
        role: "agent",
        text: `Something went wrong: ${(err as Error).message}`,
        ts: Date.now(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  }

  async function confirmAction() {
    if (!pendingConfirm || !emailContext) return;
    setPendingConfirm(null);
    setLoading(true);

    try {
      const res = await sendMessage({
        emailContext,
        userMessage: "",
        sessionId,
        confirmed: true,
        proposedAction: pendingConfirm.payload,
      });

      setSessionId(res.sessionId);

      const agentMsg: Message = {
        id: crypto.randomUUID(),
        role: "agent",
        text: res.reply,
        ts: Date.now(),
      };
      setMessages((prev) => [...prev, agentMsg]);
    } catch (err) {
      const errMsg: Message = {
        id: crypto.randomUUID(),
        role: "agent",
        text: `Error confirming action: ${(err as Error).message}`,
        ts: Date.now(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  }

  const isReady = !!emailContext && !loading;

  return (
    <div style={styles.wrapper}>
      <SuggestionChips onChipClick={send} disabled={!isReady} />

      <div style={styles.messages}>
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              ...styles.row,
              flexDirection: msg.role === "user" ? "row-reverse" : "row",
            }}
          >
            {msg.role === "agent" && (
              <div style={styles.avatar}>⚡</div>
            )}
            <div
              style={{
                ...styles.bubble,
                ...(msg.role === "user" ? styles.userBubble : styles.agentBubble),
              }}
            >
              {msg.text}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ ...styles.row, flexDirection: "row" }}>
            <div style={styles.avatar}>⚡</div>
            <div style={{ ...styles.bubble, ...styles.agentBubble, ...styles.typingBubble }}>
              <span style={styles.dot} />
              <span style={{ ...styles.dot, animationDelay: "0.15s" }} />
              <span style={{ ...styles.dot, animationDelay: "0.3s" }} />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div style={styles.inputBar}>
        <input
          style={styles.input}
          placeholder={emailContext ? "Ask me anything about this email…" : "Loading email…"}
          value={input}
          disabled={!isReady}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
        />
        <button
          style={{ ...styles.sendBtn, ...(!isReady || !input.trim() ? styles.sendBtnDisabled : {}) }}
          onClick={() => send(input)}
          disabled={!isReady || !input.trim()}
          aria-label="Send"
        >
          ➤
        </button>
      </div>

      {pendingConfirm && (
        <ConfirmDialog
          description={pendingConfirm.description}
          onConfirm={confirmAction}
          onCancel={() => setPendingConfirm(null)}
        />
      )}

      <style>{dotAnimation}</style>
    </div>
  );
}

const dotAnimation = `
@keyframes dotPulse {
  0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
  40% { opacity: 1; transform: scale(1); }
}`;

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    overflow: "hidden",
    position: "relative",
  },
  messages: {
    flex: 1,
    overflowY: "auto",
    padding: "16px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  row: {
    display: "flex",
    alignItems: "flex-end",
    gap: 8,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #0070d2, #005fb2)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
    flexShrink: 0,
  },
  bubble: {
    maxWidth: "78%",
    padding: "10px 14px",
    borderRadius: 16,
    fontSize: 13,
    lineHeight: 1.5,
    wordBreak: "break-word",
  },
  agentBubble: {
    background: "#f0f7ff",
    color: "#1a1a1a",
    borderBottomLeftRadius: 4,
    border: "1px solid #d6e8ff",
  },
  userBubble: {
    background: "#0070d2",
    color: "#fff",
    borderBottomRightRadius: 4,
  },
  typingBubble: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "12px 16px",
  },
  dot: {
    display: "inline-block",
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "#0070d2",
    animation: "dotPulse 1.2s ease-in-out infinite",
  },
  inputBar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    borderTop: "1px solid #e8e8e8",
    background: "#fff",
    flexShrink: 0,
  },
  input: {
    flex: 1,
    padding: "9px 14px",
    borderRadius: 22,
    border: "1.5px solid #d0d0d0",
    fontSize: 13,
    outline: "none",
    background: "#fafafa",
    color: "#1a1a1a",
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    border: "none",
    background: "#0070d2",
    color: "#fff",
    fontSize: 15,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  sendBtnDisabled: {
    background: "#c0d8f0",
    cursor: "not-allowed",
  },
};
