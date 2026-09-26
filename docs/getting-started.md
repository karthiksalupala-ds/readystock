# Getting started

Run InteLiDar locally: FastAPI on **8000**, Vite on **5173**. The viewer talks to the API through the Vite proxy (`/scene`, `/health`), so you do not need CORS gymnastics in day-to-day development.

Product overview: [README.md](../README.md). Architecture: [architecture.md](./architecture.md).

## Prerequisites

| Tool | Version |
| --- | --- |
| Node.js | 20 or newer (npm is fine) |
| Python | 3.11 or newer |
| Browser | A current Chromium, Firefox, or Safari with WebGL |

Optional: an OpenAI API key for LLM-backed ask. Without it, ask still works via heuristics.

## Install

From the repository root:

```bash
cp .env.example .env
npm install

cd backend
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
cd ..
```

`backend/.venv` is gitignored. Re-run the pip line after pulling dependency changes in `backend/pyproject.toml`.

## Environment

Copy [`.env.example`](../.env.example) to `.env` at the **repo root**. The API also reads `backend/.env` if present; root `.env` is loaded first.

| Variable | Required | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | No | If it starts with `sk-` and is not the placeholder, ask uses OpenAI. Otherwise heuristics. |
| `OPENAI_MODEL` | No | Chat model. Default `gpt-4o-mini`. |
| `OPENAI_BASE_URL` | No | Compatible OpenAI base URL. Leave unset for api.openai.com. |

**Do not** prefix these with `VITE_`. Vite would embed them in the browser bundle. The key belongs on the server.

Restart `npm run backend` after changing `.env`.

## Run

Two processes. Order does not matter, but the HUD shows an error if ingest runs before the API is up (refresh after starting the backend).

**API** — Uvicorn, reload, `127.0.0.1:8000`:

```bash
npm run backend
```

Equivalent:

```bash
cd backend && .venv/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Check:

```bash
curl -s http://127.0.0.1:8000/health
# {"status":"ok"}
```

Interactive OpenAPI: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

**Viewer** — Vite, `http://localhost:5173/`:

```bash
npm run dev
```

The dev server binds `host: true` (see `vite.config.ts`), so phones on the same network can open `http://<your-lan-ip>:5173/` if you need to demo from a device. API calls still go through the Vite proxy to your laptop’s port 8000.

## First-run checklist

1. Open the viewer. Top bar should read **Raw mesh**. Left panel: *Unlabelled scan*, size `7.4 × 5.2 × 2.8 m`.
2. If you see *Backend unavailable. Start the API on port 8000.*, start `npm run backend` and reload.
3. Press **✨ AI Reconstruct**. The HUD lists classification steps, then the status becomes **Semantic twin**.
4. Click a suggestion or type *Show me all the chairs.* Chairs should glow teal.
5. Toggle **Edit** and drag a chair. The door and window should not move.

## Tests

First time on a machine, install Playwright’s Chromium:

```bash
npx playwright install chromium
```

```bash
npm test                 # Vitest + pytest + Playwright
npm run test:frontend    # vitest run
npm run test:backend     # pytest via backend/.venv
npm run test:e2e         # starts API + Vite unless they are already running
```

Frontend tests live in `src/**/*.test.ts{,x}`. Backend tests live in `backend/tests/`. E2E lives in `e2e/`. See [development.md](./development.md) and [tests/AUDIT.md](../tests/AUDIT.md).

## Production-like frontend build

The API is still required; this only typechecks and bundles the SPA.

```bash
npm run build
npm run preview
```

`preview` does not include the Vite `/scene` proxy. Point the built app at the API yourself, or keep using `npm run dev` for the hackathon demo.

## Troubleshooting

**HUD: Backend unavailable**

- Confirm Uvicorn is listening on 8000: `curl http://127.0.0.1:8000/health`.
- Confirm Vite is proxying (dev server, not a static `preview` without a proxy).
- Check the browser network tab: `POST /scene/ingest` should hit 5173 and be proxied.

**`pytest` / `python: command not found`**

Use the venv binary: `backend/.venv/bin/python -m pytest`. `npm run test:backend` does that.

**Reconstruct or Ask failed**

Same as backend unavailable, or a 400 on ask (blank question). Reconstruct expects `{ graph }` with a valid scene.

**Ask answers are generic / keyword-like**

No usable `OPENAI_API_KEY`. Heuristics match words such as chair, table, door, exit, window, equipment, obstruct. Other questions get a room summary and empty highlights.

**OpenAI is configured but answers still look heuristic**

The adapter falls back to heuristics on any OpenAI exception (bad key, quota, JSON parse). Check the backend terminal. Keys that do not start with `sk-` or contain `your-openai-api-key` never call the API.

**CORS errors**

The API allows `http://localhost:5173` and `http://127.0.0.1:5173`. Calling 8000 directly from another origin will fail. Prefer the Vite proxy.

**Python 3.10 or older**

`backend/pyproject.toml` requires `>=3.11`. Create the venv with `python3.11` or `python3.12` if your default `python3` is older.

**Port already in use**

Stop the other process, or change the Uvicorn `--port` **and** the proxy target in `vite.config.ts` together.

**Playwright: browser not found / `npx playwright test` fails to launch**

```bash
npx playwright install chromium
```

E2E expects the API on 8000 and Vite on 5173. Locally it reuses those servers if they are already up. In CI it boots both.

**`npm test` hangs on E2E**

Confirm 8000 and 5173 are free or already serving this app (not some other process). `playwright.config.ts` waits on `/health` and the Vite root.
