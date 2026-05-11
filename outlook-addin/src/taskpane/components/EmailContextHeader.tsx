import React from "react";
import { EmailContext } from "../../shared/office";

interface Props {
  emailContext: EmailContext | null;
  loading: boolean;
}

export function EmailContextHeader({ emailContext, loading }: Props) {
  return (
    <div style={s.header}>
      {/* Brand bar */}
      <div style={s.brand}>
        <div style={s.logoWrap}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="#fff" stroke="#fff" strokeWidth="1" strokeLinejoin="round"/>
          </svg>
        </div>
        <div>
          <div style={s.brandName}>Sales Copilot</div>
          <div style={s.poweredBy}>Claude AI · Salesforce</div>
        </div>
        <div style={s.badge}>BETA</div>
      </div>

      {/* Email context pill */}
      {loading && (
        <div style={s.emailCard}>
          <span style={s.emailIcon}>📧</span>
          <span style={s.emailLoadingText}>Reading email…</span>
        </div>
      )}
      {!loading && emailContext && (
        <div style={s.emailCard}>
          <span style={s.emailIcon}>📧</span>
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
    padding: "14px 16px 12px",
    flexShrink: 0,
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  logoWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    background: "rgba(255,255,255,0.18)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  brandName: {
    color: "#fff",
    fontWeight: 700,
    fontSize: 15,
    lineHeight: 1.2,
    letterSpacing: "-0.2px",
  },
  poweredBy: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 10,
    letterSpacing: "0.2px",
  },
  badge: {
    marginLeft: "auto",
    background: "rgba(255,255,255,0.15)",
    color: "rgba(255,255,255,0.8)",
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: "1px",
    padding: "2px 7px",
    borderRadius: 20,
    border: "1px solid rgba(255,255,255,0.2)",
  },
  emailCard: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    background: "rgba(255,255,255,0.12)",
    borderRadius: 10,
    padding: "8px 12px",
    border: "1px solid rgba(255,255,255,0.1)",
  },
  emailIcon: {
    fontSize: 14,
    flexShrink: 0,
    marginTop: 1,
  },
  emailMeta: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    minWidth: 0,
  },
  subject: {
    color: "#fff",
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: 240,
    display: "block",
  },
  from: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 11,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: 240,
    display: "block",
  },
  emailLoadingText: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 12,
    fontStyle: "italic",
  },
};
