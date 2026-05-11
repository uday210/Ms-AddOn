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
  console.log(`[conversationStore] Data dir: ${DATA_DIR}`);
  if (fs.existsSync(DATA_FILE)) {
    store = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8")) as Record<string, StoredConv>;
    console.log(`[conversationStore] Loaded ${Object.keys(store).length} conversation(s) from disk`);
  } else {
    console.log("[conversationStore] No existing file — starting fresh");
  }
} catch (e) {
  console.warn("[conversationStore] Failed to load:", e);
}

function persist() {
  try {
    const now = Date.now();
    for (const k of Object.keys(store)) {
      if (now - store[k].savedAt > MAX_AGE) delete store[k];
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(store), "utf-8");
    console.log(`[conversationStore] Saved ${Object.keys(store).length} conversation(s) to disk`);
  } catch (e) {
    console.warn("[conversationStore] Failed to save:", e);
  }
}

export function getConv(emailKey: string): { messages: StoredMessage[]; sessionId?: string } | null {
  const conv = store[emailKey];
  if (!conv) {
    console.log(`[conversationStore] load "${emailKey}" → not found`);
    return null;
  }
  if (Date.now() - conv.savedAt > MAX_AGE) {
    console.log(`[conversationStore] load "${emailKey}" → expired`);
    delete store[emailKey];
    return null;
  }
  console.log(`[conversationStore] load "${emailKey}" → ${conv.messages.length} message(s)`);
  return { messages: conv.messages, sessionId: conv.sessionId };
}

export function saveConv(emailKey: string, messages: StoredMessage[], sessionId?: string) {
  console.log(`[conversationStore] save "${emailKey}" → ${messages.length} message(s)`);
  store[emailKey] = { messages, sessionId, savedAt: Date.now() };
  persist();
}

export function clearConv(emailKey: string) {
  console.log(`[conversationStore] clear "${emailKey}"`);
  delete store[emailKey];
  persist();
}

export function storeStatus() {
  return {
    conversations: Object.keys(store).length,
    dataFile: DATA_FILE,
    keys: Object.keys(store).map((k) => ({
      key: k,
      messages: store[k].messages.length,
      savedAt: new Date(store[k].savedAt).toISOString(),
    })),
  };
}
