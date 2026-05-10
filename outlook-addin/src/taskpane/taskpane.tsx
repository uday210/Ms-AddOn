import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { EmailContext, getEmailContext } from "../shared/office";
import { ChatPanel } from "./components/ChatPanel";
import { EmailContextHeader } from "./components/EmailContextHeader";

function App() {
  const [emailContext, setEmailContext] = useState<EmailContext | null>(null);
  const [emailLoading, setEmailLoading] = useState(true);
  const [emailError, setEmailError] = useState<string | null>(null);

  useEffect(() => {
    getEmailContext()
      .then((ctx) => {
        setEmailContext(ctx);
        setEmailLoading(false);
      })
      .catch((err) => {
        setEmailError((err as Error).message);
        setEmailLoading(false);
      });
  }, []);

  return (
    <div style={styles.root}>
      <EmailContextHeader emailContext={emailContext} loading={emailLoading} />

      {emailError && (
        <div style={styles.error}>
          Could not read email context: {emailError}
        </div>
      )}

      <ChatPanel emailContext={emailContext} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    background: "#fff",
    overflow: "hidden",
  },
  error: {
    padding: "8px 16px",
    background: "#fff0f0",
    color: "#c00",
    fontSize: 12,
    borderBottom: "1px solid #fcc",
  },
};

function mount() {
  const container = document.getElementById("root");
  if (!container) return;
  createRoot(container).render(<App />);
}

if (typeof Office !== "undefined" && Office.onReady) {
  Office.onReady(mount);
} else {
  mount();
}
