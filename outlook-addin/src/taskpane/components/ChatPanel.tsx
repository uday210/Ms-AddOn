import React, { useEffect, useRef, useState } from "react"; // useRef kept for bottomRef scroll
import { sendMessage, attachFile } from "../../shared/api";
import { MarkdownText } from "../../shared/markdown";
import { EmailContext, getAttachmentContent } from "../../shared/office";
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
      text: "Hi! I'm your **Sales Copilot**. I can look up projects, update dates, log notes, and draft replies — all without leaving Outlook. What would you like to do?",
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

    setMessages((prev) => [...prev, {
      id: crypto.randomUUID(), role: "user", text: userMessage.trim(), ts: Date.now(),
    }]);
    setInput("");
    setLoading(true);

    try {
      const res = await sendMessage({ emailContext, userMessage: userMessage.trim(), sessionId });
      setSessionId(res.sessionId);

      if (res.requiresConfirm && res.proposedAction) {
        setPendingConfirm({ description: res.proposedAction.description, payload: res.proposedAction.payload });
      }

      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(), role: "agent", text: res.reply, ts: Date.now(),
      }]);
    } catch (err) {
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(), role: "agent",
        text: `⚠️ Something went wrong: ${(err as Error).message}`,
        ts: Date.now(),
      }]);
    } finally {
      setLoading(false);
    }
  }

  async function confirmAction() {
    if (!pendingConfirm || !emailContext) return;
    const payload = pendingConfirm.payload as Record<string, unknown>;
    setPendingConfirm(null);
    setLoading(true);

    try {
      // Attach-file is handled client-side: fetch base64 from Office.js then POST to /api/attach
      if (payload.action === "attach_file") {
        const base64Content = await getAttachmentContent(payload.attachmentId as string);
        await attachFile({
          projectId:      payload.projectId as string,
          attachmentName: payload.attachmentName as string,
          contentType:    payload.contentType as string,
          base64Content,
        });
        setMessages((prev) => [...prev, {
          id: crypto.randomUUID(), role: "agent",
          text: `Done! **"${payload.attachmentName}"** has been attached to project **${payload.projectName}** in Salesforce.`,
          ts: Date.now(),
        }]);
        return;
      }

      const res = await sendMessage({
        emailContext, userMessage: "", sessionId,
        confirmed: true, proposedAction: payload,
      });
      setSessionId(res.sessionId);
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(), role: "agent", text: res.reply, ts: Date.now(),
      }]);
    } catch (err) {
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(), role: "agent",
        text: `⚠️ Error: ${(err as Error).message}`,
        ts: Date.now(),
      }]);
    } finally {
      setLoading(false);
    }
  }

  const isReady = !!emailContext && !loading;

  return (
    <div style={s.wrapper}>
      <SuggestionChips onChipClick={send} disabled={!isReady} />

      <div style={s.messages}>
        {messages.map((msg) => (
          <div key={msg.id} style={{ ...s.row, justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
            {msg.role === "agent" && <AgentAvatar />}
            <div style={{ ...s.bubble, ...(msg.role === "user" ? s.userBubble : s.agentBubble) }}>
              {msg.role === "agent"
                ? <MarkdownText text={msg.text} />
                : msg.text
              }
              <div style={{ ...s.ts, color: msg.role === "user" ? "rgba(255,255,255,0.55)" : "#b0bac6" }}>
                {new Date(msg.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ ...s.row, justifyContent: "flex-start" }}>
            <AgentAvatar />
            <div style={{ ...s.bubble, ...s.agentBubble, ...s.typingBubble }}>
              <span style={s.dot} />
              <span style={{ ...s.dot, animationDelay: "0.2s" }} />
              <span style={{ ...s.dot, animationDelay: "0.4s" }} />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div style={s.inputBar}>
        <input
          style={s.input}
          placeholder={emailContext ? "Ask me anything about this email…" : "Loading email context…"}
          value={input}
          disabled={!isReady}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send(input)}
        />
        <button
          style={{ ...s.sendBtn, ...(!isReady || !input.trim() ? s.sendBtnOff : {}) }}
          onClick={() => send(input)}
          disabled={!isReady || !input.trim()}
          aria-label="Send"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M22 2L15 22 11 13 2 9l20-7z" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {pendingConfirm && (
        <ConfirmDialog
          description={pendingConfirm.description}
          onConfirm={confirmAction}
          onCancel={() => setPendingConfirm(null)}
        />
      )}

      <style>{dotAnim}</style>
    </div>
  );
}

function AgentAvatar() {
  return (
    <div style={avs.avatar}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="#fff" strokeLinejoin="round"/>
      </svg>
    </div>
  );
}

const avs: Record<string, React.CSSProperties> = {
  avatar: {
    width: 30,
    height: 30,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #0070d2, #032D60)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    boxShadow: "0 2px 8px rgba(0,112,210,0.3)",
  },
};

const dotAnim = `
@keyframes dotPulse {
  0%, 80%, 100% { opacity: 0.2; transform: scale(0.75); }
  40% { opacity: 1; transform: scale(1); }
}`;

const s: Record<string, React.CSSProperties> = {
  wrapper: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    overflow: "hidden",
    position: "relative",
    background: "#f4f6f9",
  },
  messages: {
    flex: 1,
    overflowY: "auto",
    padding: "14px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  row: {
    display: "flex",
    alignItems: "flex-end",
    gap: 8,
  },
  bubble: {
    maxWidth: "82%",
    padding: "10px 13px",
    borderRadius: 16,
    fontSize: 13,
    lineHeight: 1.55,
    wordBreak: "break-word",
  },
  agentBubble: {
    background: "#fff",
    color: "#1a2a40",
    borderBottomLeftRadius: 4,
    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
    border: "1px solid #e8edf2",
  },
  userBubble: {
    background: "linear-gradient(135deg, #0070d2, #005fb2)",
    color: "#fff",
    borderBottomRightRadius: 4,
    boxShadow: "0 2px 8px rgba(0,112,210,0.25)",
  },
  typingBubble: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    padding: "13px 16px",
  },
  dot: {
    display: "inline-block",
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "#0070d2",
    animation: "dotPulse 1.4s ease-in-out infinite",
  },
  ts: {
    fontSize: 10,
    marginTop: 5,
    textAlign: "right",
  },
  inputBar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px",
    borderTop: "1px solid #e0e8f0",
    background: "#fff",
    flexShrink: 0,
    boxShadow: "0 -2px 8px rgba(0,0,0,0.04)",
  },
  input: {
    flex: 1,
    padding: "10px 16px",
    borderRadius: 24,
    border: "1.5px solid #d0dce8",
    fontSize: 13,
    outline: "none",
    background: "#f8fafc",
    color: "#1a2a40",
    transition: "border-color 0.2s",
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: "50%",
    border: "none",
    background: "linear-gradient(135deg, #0070d2, #005fb2)",
    color: "#fff",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    boxShadow: "0 2px 8px rgba(0,112,210,0.35)",
    transition: "opacity 0.15s",
  },
  sendBtnOff: {
    background: "#c0d4e8",
    boxShadow: "none",
    cursor: "not-allowed",
  },
};
