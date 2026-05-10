import React from "react";

export interface Chip {
  id: string;
  label: string;
  icon: string;
  message: string;
}

export const DEFAULT_CHIPS: Chip[] = [
  { id: "find",    label: "Find project",  icon: "🔍", message: "Find the project related to this email" },
  { id: "summary", label: "Get summary",   icon: "📋", message: "Give me a summary of this project" },
  { id: "date",    label: "Update date",   icon: "📅", message: "Update the project end date based on this email" },
  { id: "note",    label: "Log a note",    icon: "📝", message: "Log a note on the project about this email" },
  { id: "reply",   label: "Draft reply",   icon: "✉️", message: "Draft a reply to this email" },
];

interface Props {
  onChipClick: (message: string) => void;
  disabled: boolean;
}

export function SuggestionChips({ onChipClick, disabled }: Props) {
  return (
    <div style={styles.wrapper}>
      <span style={styles.label}>Quick actions</span>
      <div style={styles.chips}>
        {DEFAULT_CHIPS.map((chip) => (
          <button
            key={chip.id}
            style={{ ...styles.chip, ...(disabled ? styles.chipDisabled : {}) }}
            onClick={() => onChipClick(chip.message)}
            disabled={disabled}
            title={chip.label}
          >
            <span style={styles.chipIcon}>{chip.icon}</span>
            <span style={styles.chipLabel}>{chip.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    padding: "8px 16px 6px",
    borderBottom: "1px solid #e8e8e8",
    flexShrink: 0,
  },
  label: {
    fontSize: 10,
    color: "#999",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    display: "block",
    marginBottom: 6,
  },
  chips: {
    display: "flex",
    gap: 6,
    overflowX: "auto",
    paddingBottom: 2,
  },
  chip: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "5px 10px",
    borderRadius: 20,
    border: "1px solid #0070d2",
    background: "#f0f7ff",
    color: "#0070d2",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
    whiteSpace: "nowrap",
    flexShrink: 0,
    transition: "background 0.15s",
  },
  chipDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  chipIcon: {
    fontSize: 13,
  },
  chipLabel: {
    fontSize: 12,
  },
};
