import React from "react";

interface Props {
  description: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ description, onConfirm, onCancel }: Props) {
  return (
    <div style={styles.overlay}>
      <div style={styles.dialog}>
        <div style={styles.icon}>⚠️</div>
        <p style={styles.title}>Confirm action</p>
        <p style={styles.description}>{description}</p>
        <div style={styles.actions}>
          <button style={styles.cancel} onClick={onCancel}>
            Cancel
          </button>
          <button style={styles.confirm} onClick={onConfirm}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "absolute",
    inset: 0,
    background: "rgba(0,0,0,0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    padding: 20,
  },
  dialog: {
    background: "#fff",
    borderRadius: 12,
    padding: "24px 20px 20px",
    width: "100%",
    maxWidth: 320,
    boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
    textAlign: "center",
  },
  icon: {
    fontSize: 28,
    marginBottom: 8,
  },
  title: {
    margin: "0 0 8px",
    fontWeight: 700,
    fontSize: 15,
    color: "#1a1a1a",
  },
  description: {
    margin: "0 0 20px",
    fontSize: 13,
    color: "#444",
    lineHeight: 1.5,
  },
  actions: {
    display: "flex",
    gap: 10,
  },
  cancel: {
    flex: 1,
    padding: "10px 0",
    borderRadius: 8,
    border: "1px solid #ddd",
    background: "#f5f5f5",
    color: "#555",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  confirm: {
    flex: 1,
    padding: "10px 0",
    borderRadius: 8,
    border: "none",
    background: "#0070d2",
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
};
