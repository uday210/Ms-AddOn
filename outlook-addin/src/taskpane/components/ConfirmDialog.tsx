import React from "react";

interface Props {
  description: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ description, onConfirm, onCancel }: Props) {
  return (
    <div style={s.overlay}>
      <div style={s.dialog}>
        <div style={s.iconWrap}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M9 12l2 2 4-4" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="12" cy="12" r="10" stroke="#fff" strokeWidth="2"/>
          </svg>
        </div>
        <p style={s.title}>Confirm Action</p>
        <div style={s.descCard}>
          <p style={s.description}>{description}</p>
        </div>
        <p style={s.hint}>This will update your Salesforce record.</p>
        <div style={s.actions}>
          <button style={s.cancel} onClick={onCancel}>Cancel</button>
          <button style={s.confirm} onClick={onConfirm}>
            <span>✓</span> Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: "absolute",
    inset: 0,
    background: "rgba(3,45,96,0.55)",
    backdropFilter: "blur(3px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    padding: 20,
  },
  dialog: {
    background: "#fff",
    borderRadius: 16,
    padding: "28px 22px 22px",
    width: "100%",
    maxWidth: 320,
    boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
    textAlign: "center",
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #0070d2, #032D60)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 auto 14px",
    boxShadow: "0 4px 16px rgba(0,112,210,0.35)",
  },
  title: {
    margin: "0 0 12px",
    fontWeight: 700,
    fontSize: 17,
    color: "#032D60",
    letterSpacing: "-0.3px",
  },
  descCard: {
    background: "#f0f6ff",
    borderRadius: 10,
    padding: "10px 14px",
    marginBottom: 10,
    border: "1px solid #d6e8ff",
  },
  description: {
    margin: 0,
    fontSize: 13,
    color: "#1a2a40",
    lineHeight: 1.5,
    textAlign: "left",
  },
  hint: {
    margin: "0 0 18px",
    fontSize: 11,
    color: "#8090a0",
  },
  actions: {
    display: "flex",
    gap: 10,
  },
  cancel: {
    flex: 1,
    padding: "11px 0",
    borderRadius: 10,
    border: "1.5px solid #d0d8e4",
    background: "#f5f7fa",
    color: "#445566",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  confirm: {
    flex: 1,
    padding: "11px 0",
    borderRadius: 10,
    border: "none",
    background: "linear-gradient(135deg, #0070d2, #005fb2)",
    color: "#fff",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    boxShadow: "0 4px 12px rgba(0,112,210,0.3)",
  },
};
