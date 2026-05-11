import React, { useEffect, useRef, useState } from "react";
import { streamChat, sendMessage, attachFile } from "../../shared/api";
import { MarkdownText } from "../../shared/markdown";
import { EmailContext, getAttachmentContent, openMeetingForm, openReplyWithBody } from "../../shared/office";
import { ConfirmDialog } from "./ConfirmDialog";
import { SuggestionChips } from "./SuggestionChips";

export interface Message {
  id: string;
  role: "user" | "agent";
  text: string;
  ts: number;
  draftBody?: string;
}

interface Props {
  emailContext: EmailContext | null;
}

export function ChatPanel({ emailContext }: Props) {
  const [messages, setMessages]           = useState<Message[]>([]);
  const [input, setInput]                 = useState("");
  const [loading, setLoading]             = useState(false);
  const [focused, setFocused]             = useState(false);
  const [sessionId, setSessionId]         = useState<string | undefined>();
  const [streamingText, setStreamingText] = useState("");
  const [statusText, setStatusText]       = useState("");
  const [pendingConfirm, setPendingConfirm] = useState<{
    description: string;
    payload: object;
  } | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, streamingText, statusText]);

  // Auto-analyse whenever this component mounts (email context available or switching emails)
  useEffect(() => {
    if (!emailContext) return;
    runStream(
      "Briefly analyse this email: which Salesforce project does it relate to (if any), what is the sender asking for, and what is the single most helpful action I can take right now? Keep it to 2-3 sentences.",
      true  // silent — no user bubble
    );
  }, []); // intentionally empty deps — fires once on mount (key changes per email)

  // ── Streaming helper ──────────────────────────────────────────────────────
  async function runStream(userMessage: string, silent = false) {
    if (!emailContext) return;

    if (!silent) {
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(), role: "user", text: userMessage.trim(), ts: Date.now(),
      }]);
    }
    setInput("");
    setLoading(true);
    setStreamingText("");
    setStatusText("");

    const msgId = crypto.randomUUID();
    let finalDraftBody: string | undefined;

    try {
      for await (const event of streamChat({ emailContext, userMessage, sessionId })) {
        if (event.type === "delta") {
          setStreamingText((prev) => prev + event.text);
          setStatusText("");
        } else if (event.type === "status") {
          setStatusText(event.text);
        } else if (event.type === "clear") {
          setStreamingText("");
        } else if (event.type === "done") {
          setSessionId(event.sessionId);
          finalDraftBody = event.draftBody;
          if (event.requiresConfirm && event.proposedAction) {
            setPendingConfirm({ description: event.proposedAction.description, payload: event.proposedAction.payload });
          }
          setMessages((prev) => [...prev, {
            id: msgId, role: "agent", text: event.reply, ts: Date.now(), draftBody: event.draftBody,
          }]);
          setStreamingText("");
          setStatusText("");
        } else if (event.type === "error") {
          throw new Error(event.message);
        }
      }
    } catch (err) {
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(), role: "agent",
        text: `Something went wrong: ${(err as Error).message}`,
        ts: Date.now(),
      }]);
      setStreamingText("");
      setStatusText("");
    } finally {
      setLoading(false);
    }
    return finalDraftBody;
  }

  function send(userMessage: string) {
    if (!userMessage.trim() || loading || !emailContext) return;
    runStream(userMessage.trim());
  }

  // ── Confirm handler ───────────────────────────────────────────────────────
  async function confirmAction() {
    if (!pendingConfirm || !emailContext) return;
    const payload = pendingConfirm.payload as Record<string, unknown>;
    setPendingConfirm(null);
    setLoading(true);

    try {
      if (payload.action === "schedule_meeting") {
        openMeetingForm({
          subject:           payload.subject as string,
          requiredAttendees: payload.requiredAttendees as string[],
          optionalAttendees: payload.optionalAttendees as string[] | undefined,
          startDate:         payload.proposedDate as string,
          startTime:         payload.startTime as string,
          durationMinutes:   payload.durationMinutes as number,
          agenda:            payload.agenda as string,
        });
        setMessages((prev) => [...prev, {
          id: crypto.randomUUID(), role: "agent",
          text: `Meeting form opened in Outlook! Review the details and hit **Send** when ready.`,
          ts: Date.now(),
        }]);
        return;
      }

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
          text: `Done! **"${payload.attachmentName}"** attached to **${payload.projectName}** in Salesforce.`,
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
        id: crypto.randomUUID(), role: "agent", text: res.reply, ts: Date.now(), draftBody: res.draftBody,
      }]);
    } catch (err) {
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(), role: "agent",
        text: `Error: ${(err as Error).message}`,
        ts: Date.now(),
      }]);
    } finally {
      setLoading(false);
    }
  }

  const isReady = !!emailContext && !loading;
  const canSend = isReady && !!input.trim();
  const showStreaming = !!(streamingText || statusText) && loading;

  return (
    <div style={s.wrapper}>
      <SuggestionChips onChipClick={send} disabled={!isReady} />

      <div style={s.messages}>
        {messages.map((msg) => (
          <div key={msg.id} style={{ ...s.row, justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
            {msg.role === "agent" && <AgentAvatar />}
            <div style={{ ...s.bubble, ...(msg.role === "user" ? s.userBubble : s.agentBubble) }}>
              {msg.role === "agent" ? <MarkdownText text={msg.text} /> : msg.text}
              {msg.role === "agent" && msg.draftBody && (
                <button
                  style={s.openReplyBtn}
                  onClick={() => openReplyWithBody(msg.draftBody!)}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>
                  </svg>
                  Open draft in Outlook
                </button>
              )}
              <div style={{ ...s.ts, color: msg.role === "user" ? "rgba(255,255,255,0.5)" : "#b8c4d0" }}>
                {new Date(msg.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          </div>
        ))}

        {/* Live streaming bubble */}
        {showStreaming && (
          <div style={{ ...s.row, justifyContent: "flex-start" }}>
            <AgentAvatar pulse />
            <div style={{ ...s.bubble, ...s.agentBubble }}>
              {statusText && !streamingText && (
                <span style={s.statusText}>{statusText}</span>
              )}
              {streamingText && (
                <>
                  <MarkdownText text={streamingText} />
                  <span style={s.cursor} />
                </>
              )}
              {!statusText && !streamingText && (
                <span style={s.statusText}>Thinking…</span>
              )}
            </div>
          </div>
        )}

        {/* Typing dots when loading but no stream yet */}
        {loading && !showStreaming && (
          <div style={{ ...s.row, justifyContent: "flex-start" }}>
            <AgentAvatar pulse />
            <div style={{ ...s.bubble, ...s.agentBubble, ...s.typingBubble }}>
              <span style={s.dot} />
              <span style={{ ...s.dot, animationDelay: "0.18s" }} />
              <span style={{ ...s.dot, animationDelay: "0.36s" }} />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div style={{ ...s.inputBar, ...(focused ? s.inputBarFocused : {}) }}>
        <input
          style={{ ...s.input, ...(focused ? s.inputFocused : {}) }}
          placeholder={emailContext ? "Ask me anything about this email…" : "Loading email…"}
          value={input}
          disabled={!isReady}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send(input)}
        />
        <button
          style={{ ...s.sendBtn, ...(canSend ? s.sendBtnActive : s.sendBtnOff) }}
          onClick={() => send(input)}
          disabled={!canSend}
          aria-label="Send"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
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

      <style>{cssAnimations}</style>
    </div>
  );
}

function AgentAvatar({ pulse }: { pulse?: boolean }) {
  return (
    <div style={{ ...avs.avatar, ...(pulse ? avs.pulse : {}) }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="#fff">
        <path d="M12 2C12 2 13.2 8.8 20 12C13.2 15.2 12 22 12 22C12 22 10.8 15.2 4 12C10.8 8.8 12 2 12 2Z"/>
      </svg>
    </div>
  );
}

const avs: Record<string, React.CSSProperties> = {
  avatar: {
    width: 28, height: 28, borderRadius: "50%",
    background: "linear-gradient(135deg, #0176D3 0%, #032D60 100%)",
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0, boxShadow: "0 2px 8px rgba(1,118,211,0.3)",
  },
  pulse: {
    animation: "avatarPulse 1.5s ease-in-out infinite",
  },
};

const cssAnimations = `
@keyframes msgIn {
  from { opacity: 0; transform: translateY(10px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0)   scale(1);    }
}
@keyframes dotPulse {
  0%, 80%, 100% { opacity: 0.2; transform: scale(0.7); }
  40%           { opacity: 1;   transform: scale(1);   }
}
@keyframes avatarPulse {
  0%, 100% { box-shadow: 0 2px 8px rgba(1,118,211,0.3); }
  50%      { box-shadow: 0 2px 20px rgba(1,118,211,0.7); }
}
@keyframes cursorBlink {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0; }
}`;

const s: Record<string, React.CSSProperties> = {
  wrapper: {
    display: "flex", flexDirection: "column", flex: 1,
    overflow: "hidden", position: "relative", background: "#f0f4f9",
  },
  messages: {
    flex: 1, overflowY: "auto", padding: "14px 12px 10px",
    display: "flex", flexDirection: "column", gap: 12,
  },
  row: {
    display: "flex", alignItems: "flex-end", gap: 8,
    animation: "msgIn 0.25s cubic-bezier(0.22,1,0.36,1) both",
  },
  bubble: {
    maxWidth: "82%", padding: "10px 13px", borderRadius: 18,
    fontSize: 13, lineHeight: 1.6, wordBreak: "break-word",
  },
  agentBubble: {
    background: "#fff", color: "#1a2a40", borderBottomLeftRadius: 5,
    boxShadow: "0 1px 6px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
  },
  userBubble: {
    background: "linear-gradient(135deg, #0176D3 0%, #014d94 100%)",
    color: "#fff", borderBottomRightRadius: 5,
    boxShadow: "0 3px 12px rgba(1,118,211,0.3)",
  },
  typingBubble: {
    display: "flex", alignItems: "center", gap: 5,
    padding: "12px 16px", minWidth: 58,
  },
  dot: {
    display: "inline-block", width: 7, height: 7, borderRadius: "50%",
    background: "#0176D3", animation: "dotPulse 1.3s ease-in-out infinite",
  },
  statusText: {
    color: "#6b7a8d", fontSize: 12, fontStyle: "italic",
  },
  cursor: {
    display: "inline-block", width: 2, height: 14,
    background: "#0176D3", marginLeft: 2, verticalAlign: "middle",
    borderRadius: 1, animation: "cursorBlink 0.8s ease-in-out infinite",
  },
  openReplyBtn: {
    display: "flex", alignItems: "center", gap: 6,
    marginTop: 10, padding: "7px 14px",
    background: "linear-gradient(135deg, #0176D3, #014d94)",
    color: "#fff", border: "none", borderRadius: 20,
    fontSize: 12, fontWeight: 600, cursor: "pointer",
    boxShadow: "0 2px 8px rgba(1,118,211,0.3)",
    transition: "opacity 0.15s ease",
    width: "fit-content",
  },
  ts: {
    fontSize: 9.5, marginTop: 5, textAlign: "right" as const, letterSpacing: "0.2px",
  },
  inputBar: {
    display: "flex", alignItems: "center", gap: 8,
    padding: "10px 12px", borderTop: "1px solid #e2eaf3",
    background: "#fff", flexShrink: 0,
    transition: "box-shadow 0.2s ease",
    boxShadow: "0 -2px 10px rgba(0,0,0,0.04)",
  },
  inputBarFocused: {
    boxShadow: "0 -2px 16px rgba(1,118,211,0.1)",
  },
  input: {
    flex: 1, padding: "10px 16px", borderRadius: 24,
    border: "1.5px solid #d6e2f0", fontSize: 13,
    outline: "none", background: "#f7fafd", color: "#1a2a40",
    transition: "border-color 0.2s ease, box-shadow 0.2s ease",
  },
  inputFocused: {
    borderColor: "#0176D3",
    boxShadow: "0 0 0 3px rgba(1,118,211,0.1)",
    background: "#fff",
  },
  sendBtn: {
    width: 38, height: 38, borderRadius: "50%", border: "none",
    cursor: "pointer", display: "flex", alignItems: "center",
    justifyContent: "center", flexShrink: 0,
    transition: "transform 0.15s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.15s ease",
  },
  sendBtnActive: {
    background: "linear-gradient(135deg, #0176D3, #014d94)",
    color: "#fff", boxShadow: "0 3px 12px rgba(1,118,211,0.4)",
  },
  sendBtnOff: {
    background: "#e2eaf3", color: "#94a3b8",
    boxShadow: "none", cursor: "not-allowed",
  },
};
