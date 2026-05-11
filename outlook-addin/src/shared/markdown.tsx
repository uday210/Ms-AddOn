import React from "react";

function parseBold(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**")
      ? <strong key={i}>{p.slice(2, -2)}</strong>
      : p
  );
}

function parseTableRow(line: string): string[] {
  return line.split("|").map(c => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1);
}

function isSeparator(line: string) {
  return /^\|[\s\-|:]+\|$/.test(line.trim());
}

export function MarkdownText({ text }: { text: string }) {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Table: header row followed by separator
    if (line.startsWith("|") && i + 1 < lines.length && isSeparator(lines[i + 1])) {
      const headers = parseTableRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        rows.push(parseTableRow(lines[i]));
        i++;
      }
      nodes.push(
        <div key={`tbl-${i}`} style={{ overflowX: "auto", margin: "8px 0" }}>
          <table style={tblStyles.table}>
            <thead>
              <tr>
                {headers.map((h, hi) => (
                  <th key={hi} style={tblStyles.th}>{parseBold(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} style={ri % 2 === 1 ? tblStyles.trAlt : {}}>
                  {row.map((cell, ci) => (
                    <td key={ci} style={tblStyles.td}>{parseBold(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Bullet list item
    if (/^[-*•]\s/.test(line)) {
      nodes.push(
        <div key={`li-${i}`} style={{ display: "flex", gap: 6, marginBottom: 2 }}>
          <span style={{ color: "#0070d2", fontWeight: 700 }}>•</span>
          <span>{parseBold(line.replace(/^[-*•]\s/, ""))}</span>
        </div>
      );
      i++;
      continue;
    }

    // Empty line → spacer
    if (!line.trim()) {
      nodes.push(<div key={`sp-${i}`} style={{ height: 6 }} />);
      i++;
      continue;
    }

    // Normal paragraph
    nodes.push(
      <span key={`p-${i}`} style={{ display: "block" }}>
        {parseBold(line)}
      </span>
    );
    i++;
  }

  return <>{nodes}</>;
}

const tblStyles: Record<string, React.CSSProperties> = {
  table: {
    borderCollapse: "collapse",
    fontSize: 12,
    width: "100%",
    background: "#fff",
    borderRadius: 6,
    overflow: "hidden",
    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
  },
  th: {
    background: "#032D60",
    color: "#fff",
    padding: "7px 10px",
    textAlign: "left",
    fontWeight: 600,
    fontSize: 11,
    whiteSpace: "nowrap",
  },
  td: {
    padding: "6px 10px",
    borderBottom: "1px solid #eef0f4",
    color: "#1a1a1a",
    verticalAlign: "top",
  },
  trAlt: {
    background: "#f8f9fb",
  },
};
