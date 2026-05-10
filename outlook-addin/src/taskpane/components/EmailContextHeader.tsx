import React from "react";
import { EmailContext } from "../../shared/office";

interface Props {
  emailContext: EmailContext | null;
  loading: boolean;
}

export function EmailContextHeader({ emailContext, loading }: Props) {
  return (
    <div style={styles.header}>
      <div style={styles.brand}>
        <span style={styles.logo}>⚡</span>
        <span style={styles.brandName}>Sales Copilot</span>
        <span style={styles.poweredBy}>powered by Agentforce</span>
      </div>

      {loading && (
        <div style={styles.emailRow}>
          <span style={styles.loadingText}>Reading email…</span>
        </div>
      )}

      {!loading && emailContext && (
        <div style={styles.emailRow}>
          <div style={styles.emailMeta}>
            <span style={styles.subject} title={emailContext.subject}>
              {emailContext.subject || "(no subject)"}
            </span>
            <span style={styles.from}>From: {emailContext.from}</span>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    padding: "12px 16px 10px",
    background: "linear-gradient(135deg, #0070d2 0%, #005fb2 100%)",
    borderBottom: "1px solid rgba(255,255,255,0.15)",
    flexShrink: 0,
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  logo: {
    fontSize: 18,
  },
  brandName: {
    color: "#fff",
    fontWeight: 700,
    fontSize: 15,
    letterSpacing: "-0.2px",
  },
  poweredBy: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 10,
    fontStyle: "italic",
    marginLeft: 2,
    alignSelf: "flex-end",
    marginBottom: 1,
  },
  emailRow: {
    background: "rgba(255,255,255,0.12)",
    borderRadius: 8,
    padding: "6px 10px",
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
  },
  from: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 11,
  },
  loadingText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    fontStyle: "italic",
  },
};
