# AI Proxy Reverse Proxy Server

This folder contains a lightweight Node.js reverse proxy server that forwards model-specific prompt payloads to Gemini and GitHub Models.

The server also serves static files from this folder for `GET` requests.

## What It Does

- Accepts `POST` requests from browser or test clients
- Forwards provider-shaped request bodies upstream
- Normalizes successful responses to `{ "text": "..." }`
- Normalizes upstream errors to `{ "error": "..." }`
- Handles CORS for browser clients

## Environment Variables

The proxy uses these values:

- `GEMINI_API_KEY`
- `GITHUB_TOKEN`
- `PORT` optional, defaults to `3000`
- `GEMINI_MODEL` Gemini model name used to build the Gemini upstream URL
- `GEMINI_URL` required Gemini upstream URL, typically defined in terms of `GEMINI_MODEL` and `GEMINI_API_KEY`
- `GH_URL` required GitHub Models upstream URL

`start.sh` sources `.env.modelspecs` if it exists, exports the variables above, prompts for missing API keys, and starts `server.cjs`.

Use `.env.modelspecs.example` as the tracked template, then create your local `.env.modelspecs` with real credentials.

Template file:

```bash
cp .env.modelspecs.example .env.modelspecs
```

Example `.env.modelspecs.example`:

```bash
GEMINI_API_KEY=your_gemini_key
GITHUB_TOKEN=your_github_token
GEMINI_MODEL="gemini-2.5-flash"
GEMINI_URL="https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}"
GH_URL="https://models.inference.ai.azure.com/chat/completions"
PORT=3000
```

With that layout, the Gemini model name appears only once in the file, and `GEMINI_URL` is derived from it when the file is sourced by `bash`.

`.env.modelspecs` should stay untracked and contain your real keys. `.env.modelspecs.example` is the safe file to commit and document.

## How To Run

Use a bash shell in this folder:

```bash
bash start.sh
```

That script starts:

```bash
node server.cjs
```

Base URL:

```text
http://localhost:3000
```

Endpoints:

- `POST /api/gemprompt`
- `POST /api/ghprompt`

## Request And Response Contract

The proxy forwards the request body you send as-is to the upstream provider. It does not accept a generic `{ prompt, systemPrompt }` body.

Clients should therefore send provider-shaped JSON:

- Gemini clients send a Gemini `generateContent` style payload
- GitHub Models clients send a chat-completions style payload

Current examples live in these files:

- [/Users/rms/Sites/WY/aiproxy/test/chatmanagers.js](/Users/rms/Sites/WY/aiproxy/test/chatmanagers.js)
- [/Users/rms/Sites/WY/aiproxy/test/endpoints.js](/Users/rms/Sites/WY/aiproxy/test/endpoints.js)

Successful responses are normalized to:

```json
{ "text": "...model output..." }
```

Errors are normalized to:

```json
{ "error": "...message..." }
```

## Testing

The test suite is split into deterministic unit tests and opt-in live integration tests.

### Unit Tests

Run local logic only:

```bash
npm test
```

These tests do not call the network. They cover retry behavior, empty-response handling, rollback of failed user turns, and conversation-history updates. This is the CI-friendly layer because failures here usually mean local code regressed.

### Live Integration Tests

Run the real end-to-end path through the local proxy and upstream providers:

```bash
npm run test:live
```

Requirements:

- `bash start.sh` is already running
- valid provider credentials are available
- upstream providers are reachable

These tests can skip when a provider returns a transient overload response such as Gemini high demand.

### Run Everything

Run both layers:

```bash
npm run test:all
```

## Why The Tests Were Split

The original prompt test mixed two separate concerns:

- local request and conversation-state logic
- real external provider availability

That made failures ambiguous. A red test could mean broken local code, a stopped proxy, missing credentials, or upstream overload.

The split makes failures easier to interpret:

- unit tests answer: did local code break?
- live tests answer: does the full external system work right now?
