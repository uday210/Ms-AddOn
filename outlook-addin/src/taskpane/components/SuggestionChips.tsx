import React, { useState } from "react";

const Icons = {
  find: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  ),
  summary: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  ),
  projects: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
    </svg>
  ),
  calendar: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  ),
  note: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  ),
  reply: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>
    </svg>
  ),
};

export interface Chip {
  id: string;
  label: string;
  icon: keyof typeof Icons;
  message: string;
}

export const DEFAULT_CHIPS: Chip[] = [
  { id: "find",    label: "Find project", icon: "find",     message: "Find the project related to this email" },
  { id: "summary", label: "Get summary",  icon: "summary",  message: "Give me a summary of this project" },
  { id: "all",     label: "All projects", icon: "projects", message: "List all my Salesforce projects with their end dates" },
  { id: "date",    label: "Update date",  icon: "calendar", message: "Update the project end date based on this email" },
  { id: "note",    label: "Log a note",   icon: "note",     message: "Log a note on the project about this email" },
  { id: "reply",   label: "Draft reply",  icon: "reply",    message: "Draft a reply to this email based on the project status" },
];

interface Props {
  onChipClick: (message: string) => void;
  disabled: boolean;
}

export function SuggestionChips({ onChipClick, disabled }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div style={s.wrapper}>
      <div style={s.label}>Quick actions</div>
      <div style={s.row}>
        {DEFAULT_CHIPS.map((chip) => {
          const isHovered = hovered === chip.id && !disabled;
          return (
            <button
              key={chip.id}
              style={{
                ...s.chip,
                ...(disabled ? s.disabled : {}),
                ...(isHovered ? s.chipHover : {}),
              }}
              onClick={() => !disabled && onChipClick(chip.message)}
              onMouseEnter={() => setHovered(chip.id)}
              onMouseLeave={() => setHovered(null)}
              disabled={disabled}
              title={chip.label}
            >
              <span style={{ ...s.iconWrap, ...(isHovered ? s.iconHover : {}) }}>
                {Icons[chip.icon]}
              </span>
              <span style={s.chipLabel}>{chip.label}</span>
            </button>
          );
        })}
      </div>
      <style>{chipAnim}</style>
    </div>
  );
}

const chipAnim = `
@keyframes chipPop {
  0%   { transform: scale(1); }
  40%  { transform: scale(0.94); }
  100% { transform: scale(1); }
}`;

const s: Record<string, React.CSSProperties> = {
  wrapper: {
    padding: "9px 12px 8px",
    borderBottom: "1px solid #eaeff5",
    background: "#fff",
    flexShrink: 0,
  },
  label: {
    fontSize: 9.5,
    color: "#94a3b8",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.8px",
    marginBottom: 8,
  },
  row: {
    display: "flex",
    gap: 6,
    overflowX: "auto",
    paddingBottom: 2,
    scrollbarWidth: "none",
  },
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "5px 11px 5px 9px",
    borderRadius: 20,
    border: "1.5px solid #dbe4f0",
    background: "#f5f8ff",
    color: "#0176D3",
    fontSize: 11.5,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
    flexShrink: 0,
    transition: "all 0.15s cubic-bezier(0.34,1.56,0.64,1)",
    lineHeight: 1,
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  },
  chipHover: {
    background: "#e8f1ff",
    borderColor: "#0176D3",
    transform: "translateY(-2px)",
    boxShadow: "0 4px 12px rgba(1,118,211,0.18)",
  },
  disabled: {
    opacity: 0.4,
    cursor: "not-allowed",
  },
  iconWrap: {
    display: "flex",
    alignItems: "center",
    flexShrink: 0,
    transition: "transform 0.15s ease",
  },
  iconHover: {
    transform: "scale(1.15)",
  },
  chipLabel: {
    fontSize: 11.5,
  },
};
