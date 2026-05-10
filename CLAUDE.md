# Sales Copilot — Outlook Add-in POC

> Project context for Claude Code. Read this first on every session.

## What this project is

An Outlook custom add-in for sales reps, built as a partner POC for **Salesforce Connections 2026** (Chicago, June 3–4). The add-in lives in the email reading pane and lets reps act on project-related emails without leaving Outlook — it talks directly to a **Salesforce Agentforce agent** behind the scenes.

**Agentforce Voice is out of scope.** This POC is Outlook only.

## Target environment

- **Salesforce org**: SDO Lite from Partner Learning Camp (Agentforce + Headless 360)
- **Microsoft tenant**: M365 Developer Program tenant (E5 base + 1× M365 Copilot Business add-on)
- **Region**: Canada — Microsoft's prebuilt "Service in M365 Copilot" Salesforce path is blocked; we are building our own add-in instead

## Architecture overview

```
┌─────────────────────────────────────────┐
│         Outlook Add-in                  │
│  (taskpane — TypeScript + React)        │
│                                         │
│  Office.js reads email context          │
│  (subject, body, from, to)              │
└───────────────┬─────────────────────────┘
                │ HTTPS POST
                ▼
┌─────────────────────────────────────────┐
│         Backend (Node/Express)          │
│                                         │
│  • Authenticates to Salesforce via      │
│    Client Credentials flow              │
│  • Forwards messages to the             │
│    Agentforce agent (Sessions API)      │
│  • Returns agent reply to taskpane      │
└───────────────┬─────────────────────────┘
                │ Agentforce Sessions API
                ▼
┌─────────────────────────────────────────┐
│         Salesforce Agentforce           │
│                                         │
│  Agent handles all intelligence:        │
│   • Find project by name                │
│   • Get project summary                 │
│   • Update project end date             │
│   • Log a note on the project           │
│   • Draft reply (stretch)               │
│                                         │
│  Data model:                            │
│   Account (parent)                      │
│     └── Project__c (child)              │
└─────────────────────────────────────────┘
```

The backend is a thin relay — it handles auth and session management but does **not** orchestrate intelligence. All reasoning happens inside the Salesforce agent.

## Data model

- **Account** — standard Salesforce object, parent
- **Project__c** — custom object, child of Account
  - Key fields: `Name`, `End_Date__c`, `Status__c`, `Account__c` (lookup)
  - Notes logged as `Task` or a custom `Project_Note__c` child record (TBD)

## Auth: Client Credentials Flow

The backend authenticates to Salesforce using **OAuth 2.0 Client Credentials** (server-to-server, no user login required).

```
Backend → POST /services/oauth2/token
          grant_type=client_credentials
          client_id=<connected app key>
          client_secret=<connected app secret>
       ← access_token
```

Token is cached and refreshed as needed. No per-user OAuth in scope for this demo.

## Outlook add-in — scope and behavior

### What the user sees

1. Rep opens an email in Outlook about a project — e.g., a customer asking to push a deadline.
2. Rep clicks the **Sales Copilot** icon in the message toolbar.
3. A taskpane opens on the right side of the email.
4. Top of pane shows the email context: subject and sender.
5. Suggestion chips: **[Find the project]** **[Get summary]** **[Update date]** **[Log a note]** **[Draft reply]**
6. Below: a chat input for free-form requests ("push end date by 2 weeks and log scope expansion").
7. Write actions show a **confirm dialog** before executing.
8. Result is shown in the taskpane with a follow-up offer.

### Demo script (~60 seconds)

```
Email open from a customer:
"Hi, just confirming we'll push Northwind go-live by 2 weeks for the
EU compliance review. Can you update your end?"

Rep: [clicks Sales Copilot icon]

Taskpane: "This email mentions Northwind and a 2-week extension.
          Want me to update the project?"

Rep: [clicks Update Date]

Taskpane: "Confirm — move Northwind end date June 15 → June 29,
           and log a note about EU compliance review?"

Rep: [Confirm]

Taskpane: "Done. End date updated, note logged.
           Draft a reply confirming this back to the customer?"

Rep: [Yes]

Compose window opens with AI-drafted reply already written.
```

### Surface-level technical requirements

- Read current email's `body`, `subject`, `from`, `to` via **Office.js**
- HTTPS call to backend `/chat`
- Open compose window with prefilled content via `Office.mailbox.item.displayReplyForm` or `displayNewMessageForm`
- No persistent state in the add-in — every request sends email context fresh

## Tech stack

### Outlook add-in
- **TypeScript + React** for the taskpane
- **Office.js** for email content access
- Manifest: `manifest.xml` (classic) or unified JSON manifest
- Local dev: HTTPS via webpack-dev-server on port 3000, sideloaded via VS Code
- Production: Azure Static Web Apps, Vercel, or Netlify

### Backend
- **Node.js + TypeScript + Express**
- Single primary endpoint: `POST /chat`
  - Input: `{ emailContext: { subject, body, from, to }, userMessage: string, sessionId?: string }`
  - Output: `{ reply: string, requiresConfirm: boolean, proposedAction?: object }`
- **Salesforce Client Credentials** auth — backend holds `SF_CLIENT_ID` + `SF_CLIENT_SECRET`, fetches and caches the access token
- **Agentforce Sessions API** — create a session, send messages, stream or poll for the agent reply
- Conversation state: `sessionId` maps to an active Agentforce session (in-memory Map for the demo)

### Salesforce
- **Agentforce agent** configured with actions for: find project, get summary, update end date, log note
- **Project__c** custom object — `Account__c` lookup (Account is the parent)
- Apex actions or Flow-backed agent actions (whichever is already set up in the org)

## Project structure

```
outlookCustomAgent/
├── CLAUDE.md                        # this file
│
├── outlook-addin/                   # Outlook add-in (UI surface)
│   ├── manifest.xml
│   ├── src/
│   │   ├── taskpane/
│   │   │   ├── taskpane.html
│   │   │   ├── taskpane.tsx         # React entry
│   │   │   └── components/
│   │   │       ├── ChatPanel.tsx
│   │   │       ├── SuggestionChips.tsx
│   │   │       ├── ConfirmDialog.tsx
│   │   │       └── EmailContextHeader.tsx
│   │   ├── commands/
│   │   │   └── commands.ts
│   │   └── shared/
│   │       ├── api.ts               # client for backend /chat
│   │       └── office.ts            # Office.js wrapper (for testability)
│   ├── package.json
│   ├── tsconfig.json
│   └── webpack.config.js
│
├── backend/                         # Thin relay to Salesforce agent
│   ├── src/
│   │   ├── server.ts                # Express bootstrap
│   │   ├── routes/
│   │   │   └── chat.ts              # POST /chat handler
│   │   ├── salesforce/
│   │   │   ├── auth.ts              # Client Credentials token fetch + cache
│   │   │   └── agentforce.ts        # Agentforce Sessions API wrapper
│   │   └── types/
│   │       └── chat.ts              # request/response types
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example                 # SF_CLIENT_ID, SF_CLIENT_SECRET, SF_INSTANCE_URL, SF_AGENT_ID
│
└── README.md
```

## Conventions

### Outlook add-in (TypeScript)
- Functional React components, hooks-based
- No global state library — `useState` + a single `ChatContext` is enough
- All API calls through `src/shared/api.ts` — typed request/response
- Office.js access wrapped in `src/shared/office.ts` for testability
- Suggestion chips defined as a typed array, not hardcoded JSX
- Loading and error states on every async action

### Backend (TypeScript)
- Express with `async/await` route handlers
- Token cache: fetch on first request, store in module-level variable, re-fetch on 401
- Agentforce session lifecycle: create session on first message in a conversation, reuse `sessionId` on follow-ups
- Confirmation logic: if the agent proposes a write action, return it as `proposedAction` with `requiresConfirm: true`. Execute only when the add-in sends `confirmed: true` on the next call.
- Keep `.env.example` up to date with every new env var added

## Environment variables

```
SF_INSTANCE_URL=https://your-org.my.salesforce.com
SF_CLIENT_ID=<connected app consumer key>
SF_CLIENT_SECRET=<connected app consumer secret>
SF_AGENT_ID=<Agentforce agent ID from Setup>
PORT=3001
```

## Build sequence (remaining weeks to CNX)

**Now — foundations**
- [ ] Confirm `Project__c` fields + Account relationship in the org
- [ ] Confirm Agentforce agent is live and responding in the org
- [ ] Test Client Credentials token fetch manually (curl)
- [ ] Test Agentforce Sessions API manually — create session, send message, get reply

**Next — backend**
- [ ] Scaffold Express + TypeScript
- [ ] Implement `auth.ts` — Client Credentials flow, token cache
- [ ] Implement `agentforce.ts` — session create + send message
- [ ] Wire `POST /chat` — pass email context + user message → agent → return reply
- [ ] Test end-to-end with Postman

**Then — Outlook add-in**
- [ ] Scaffold add-in (manifest + taskpane shell)
- [ ] Build `EmailContextHeader` — reads subject/from via Office.js
- [ ] Build `SuggestionChips` + `ChatPanel` — wired to backend
- [ ] Build `ConfirmDialog` — for write actions
- [ ] End-to-end: email → chip click → backend → Salesforce agent → reply in taskpane

**Polish**
- [ ] AI-drafted reply integration (stretch)
- [ ] Demo recording as fallback
- [ ] Live run-throughs with timing

## Open questions

1. **Agentforce Sessions API URL format** — confirm the exact endpoint path from the org (varies by API version).
2. **Demo type**: live on stage, recorded video, or both?
3. **Note logging**: `Task` records or a custom `Project_Note__c`?
4. **Backend hosting**: ngrok for local demo, or deploy to a cloud function?
5. **AI-drafted reply**: include or skip? Strong demo moment but adds scope.

---
*Last updated: 2026-05-10. Agentforce Voice removed from scope. Backend is now a thin relay to Salesforce Agentforce agent. Auth is Client Credentials. Data model: Account (parent) → Project__c (child).*
