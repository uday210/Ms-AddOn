import React from "react";
import { ProposedAction } from "../../shared/api";

interface Props {
  actions: ProposedAction[];
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ actions, onConfirm, onCancel }: Props) {
  const isMulti = actions.length > 1;

  return (
    <div style={s.overlay}>
      <div style={s.dialog}>
        <div style={s.iconWrap}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M9 12l2 2 4-4" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="12" cy="12" r="10" stroke="#fff" strokeWidth="2"/>
          </svg>
        </div>

        <p style={s.title}>{isMulti ? `Confirm ${actions.length} Actions` : "Confirm Action"}</p>

        <div style={s.itemsWrap}>
          {actions.map((action, i) => (
            <div key={i} style={s.item}>
              <span style={s.itemLabel}>{action.label}</span>
              <span style={s.itemDesc}>{action.description}</span>
            </div>
          ))}
        </div>

        <p style={s.hint}>This will update your Salesforce record{isMulti ? "s" : ""}.</p>

        <div style={s.btnRow}>
          <button style={s.cancel} onClick={onCancel}>Cancel</button>
          <button style={s.confirm} onClick={onConfirm}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: "absolute", inset: 0,
    background: "rgba(3,45,96,0.55)",
    backdropFilter: "blur(3px)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 100, padding: 20,
  },
  dialog: {
    background: "#fff", borderRadius: 16,
    padding: "24px 20px 20px", width: "100%", maxWidth: 320,
    boxShadow: "0 20px 60px rgba(0,0,0,0.25)", textAlign: "center",
  },
  iconWrap: {
    width: 48, height: 48, borderRadius: "50%",
    background: "linear-gradient(135deg, #0176D3, #032D60)",
    display: "flex", alignItems: "center", justifyContent: "center",
    margin: "0 auto 12px",
    boxShadow: "0 4px 16px rgba(1,118,211,0.35)",
  },
  title: { margin: "0 0 14px", fontWeight: 700, fontSize: 16, color: "#032D60", letterSpacing: "-0.3px" },
  itemsWrap: { display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 },
  item: {
    background: "#f0f6ff", borderRadius: 10,
    padding: "9px 12px", textAlign: "left",
    border: "1px solid #d6e8ff",
    display: "flex", flexDirection: "column", gap: 3,
  },
  itemLabel: { fontSize: 10, fontWeight: 700, color: "#0176D3", textTransform: "uppercase" as const, letterSpacing: "0.5px" },
  itemDesc:  { fontSize: 12.5, color: "#1a2a40", lineHeight: 1.45 },
  hint: { margin: "0 0 16px", fontSize: 11, color: "#8090a0" },
  btnRow: { display: "flex", gap: 10 },
  cancel: {
    flex: 1, padding: "10px 0", borderRadius: 10,
    border: "1.5px solid #d0d8e4", background: "#f5f7fa",
    color: "#445566", fontSize: 13, fontWeight: 600, cursor: "pointer",
  },
  confirm: {
    flex: 1, padding: "10px 0", borderRadius: 10, border: "none",
    background: "linear-gradient(135deg, #0176D3, #014d94)",
    color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
    boxShadow: "0 4px 12px rgba(1,118,211,0.3)",
  },
};
