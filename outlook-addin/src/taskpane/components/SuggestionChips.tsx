import React from "react";

export interface Chip {
  id: string;
  label: string;
  icon: string;
  color: string;
  message: string;
}

export const DEFAULT_CHIPS: Chip[] = [
  { id: "find",    label: "Find project",   icon: "🔍", color: "#e8f4ff", message: "Find the project related to this email" },
  { id: "summary", label: "Get summary",    icon: "📋", color: "#e8f4ff", message: "Give me a summary of this project" },
  { id: "all",     label: "All projects",   icon: "📂", color: "#f0f4ff", message: "List all my Salesforce projects with their end dates" },
  { id: "date",    label: "Update date",    icon: "📅", color: "#e8fff0", message: "Update the project end date based on this email" },
  { id: "note",    label: "Log a note",     icon: "📝", color: "#fff8e8", message: "Log a note on the project about this email" },
  { id: "reply",   label: "Draft reply",    icon: "✉️", color: "#f5e8ff", message: "Draft a reply to this email based on the project status" },
];

interface Props {
  onChipClick: (message: string) => void;
  disabled: boolean;
}

export function SuggestionChips({ onChipClick, disabled }: Props) {
  return (
    <div style={s.wrapper}>
      <div style={s.label}>Quick actions</div>
      <div style={s.grid}>
        {DEFAULT_CHIPS.map((chip) => (
          <button
            key={chip.id}
            style={{
              ...s.chip,
              background: chip.color,
              ...(disabled ? s.chipDisabled : {}),
            }}
            onClick={() => onChipClick(chip.message)}
            disabled={disabled}
          >
            <span style={s.icon}>{chip.icon}</span>
            <span style={s.chipLabel}>{chip.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrapper: {
    padding: "10px 14px 8px",
    borderBottom: "1px solid #eef0f4",
    background: "#fafbfc",
    flexShrink: 0,
  },
  label: {
    fontSize: 10,
    color: "#8090a0",
    textTransform: "uppercase",
    letterSpacing: "0.8px",
    fontWeight: 600,
    marginBottom: 8,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 6,
  },
  chip: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    padding: "8px 6px",
    borderRadius: 10,
    border: "1px solid #e0e8f0",
    fontSize: 11,
    fontWeight: 600,
    color: "#032D60",
    cursor: "pointer",
    transition: "transform 0.1s, box-shadow 0.1s",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
  },
  chipDisabled: {
    opacity: 0.45,
    cursor: "not-allowed",
  },
  icon: {
    fontSize: 18,
    lineHeight: 1,
  },
  chipLabel: {
    fontSize: 10,
    lineHeight: 1.2,
    textAlign: "center",
  },
};
