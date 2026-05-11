import React from "react";
import { EmailContext } from "../../shared/office";

interface Props {
  emailContext: EmailContext | null;
  loading: boolean;
}

export function EmailContextHeader({ emailContext, loading }: Props) {
  return (
    <div style={s.header}>
      <div style={s.accentBar} />

      <div style={s.inner}>
        <div style={s.mailIconWrap}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
        </div>

        <div style={s.emailMeta}>
          {loading ? (
            <span style={s.loadingText}>Reading email…</span>
          ) : emailContext ? (
            <>
              <span style={s.subject} title={emailContext.subject}>
                {emailContext.subject || "(no subject)"}
              </span>
              <span style={s.from}>{emailContext.from}</span>
            </>
          ) : null}
        </div>
      </div>

      <style>{pulse}</style>
    </div>
  );
}

const pulse = `
@keyframes shimmer {
  0%   { opacity: 0.5; }
  50%  { opacity: 1; }
  100% { opacity: 0.5; }
}`;

const s: Record<string, React.CSSProperties> = {
  header: {
    background: "linear-gradient(135deg, #032D60 0%, #0176D3 100%)",
    flexShrink: 0,
    position: "relative",
    overflow: "hidden",
  },
  accentBar: {
    height: 2,
    background: "linear-gradient(90deg, #00A1E0, #7B68EE, #00A1E0)",
    backgroundSize: "200% 100%",
  },
  inner: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px 12px",
  },
  mailIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    background: "rgba(255,255,255,0.12)",
    border: "1px solid rgba(255,255,255,0.18)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    backdropFilter: "blur(4px)",
  },
  emailMeta: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    minWidth: 0,
    flex: 1,
  },
  subject: {
    color: "#fff",
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    display: "block",
    letterSpacing: "0.1px",
  },
  from: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 10.5,
    display: "block",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  loadingText: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
    fontStyle: "italic",
    animation: "shimmer 1.5s ease-in-out infinite",
  },
};
