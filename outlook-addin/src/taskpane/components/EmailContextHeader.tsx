import React from "react";
import { EmailContext } from "../../shared/office";

interface Props {
  emailContext: EmailContext | null;
  loading: boolean;
}

export function EmailContextHeader({ emailContext, loading }: Props) {
  return (
    <div style={s.header}>
      <div style={s.topRow}>
        <div style={s.logoWrap}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="#fff"/>
          </svg>
        </div>
        <span style={s.tagline}>Claude AI · Salesforce</span>
      </div>

      {loading && (
        <div style={s.emailCard}>
          <span style={s.emailLoadingText}>Reading email…</span>
        </div>
      )}

      {!loading && emailContext && (
        <div style={s.emailCard}>
          <div style={s.emailMeta}>
            <span style={s.subject} title={emailContext.subject}>
              {emailContext.subject || "(no subject)"}
            </span>
            <span style={s.from}>{emailContext.from}</span>
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  header: {
    background: "linear-gradient(145deg, #032D60 0%, #0070d2 100%)",
    padding: "10px 14px 10px",
    flexShrink: 0,
  },
  topRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  logoWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    background: "rgba(255,255,255,0.18)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  tagline: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 11,
    letterSpacing: "0.3px",
  },
  emailCard: {
    background: "rgba(255,255,255,0.13)",
    borderRadius: 8,
    padding: "7px 10px",
    border: "1px solid rgba(255,255,255,0.1)",
  },
  emailMeta: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  subject: {
    color: "#fff",
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    display: "block",
  },
  from: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 11,
    display: "block",
  },
  emailLoadingText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
    fontStyle: "italic",
  },
};
