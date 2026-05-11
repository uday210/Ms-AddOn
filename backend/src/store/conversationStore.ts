import fs from "fs";
import path from "path";

export interface StoredMessage {
  id: string;
  role: "user" | "agent";
  text: string;
  ts: number;
  draftBody?: string;
}

interface StoredConv {
  messages: StoredMessage[];
  sessionId?: string;
  savedAt: number;
}

const DATA_DIR  = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "conversations.json");
const MAX_AGE   = 7 * 24 * 60 * 60 * 1000; // 7 days

let store: Record<string, StoredConv> = {};

// Load on startup
try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DATA_FILE)) {
    store = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8")) as Record<string, StoredConv>;
  }
} catch (e) {
  console.warn("[conversationStore] Failed to load:", e);
}

function persist() {
  try {
    // Prune entries older than MAX_AGE before writing
    const now = Date.now();
    for (const k of Object.keys(store)) {
      if (now - store[k].savedAt > MAX_AGE) delete store[k];
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(store), "utf-8");
  } catch (e) {
    console.warn("[conversationStore] Failed to save:", e);
  }
}

export function getConv(emailKey: string): { messages: StoredMessage[]; sessionId?: string } | null {
  const conv = store[emailKey];
  if (!conv) return null;
  if (Date.now() - conv.savedAt > MAX_AGE) {
    delete store[emailKey];
    return null;
  }
  return { messages: conv.messages, sessionId: conv.sessionId };
}

export function saveConv(emailKey: string, messages: StoredMessage[], sessionId?: string) {
  store[emailKey] = { messages, sessionId, savedAt: Date.now() };
  persist();
}

export function clearConv(emailKey: string) {
  delete store[emailKey];
  persist();
}
