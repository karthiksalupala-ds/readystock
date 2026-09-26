# Deploy

InteLiDar is two things at once: a static React bundle and a Python API. Both have to be reachable from **the same origin**, because the client posts to `/scene/ingest` with no host in front of it.

Locally that works because the Vite dev server proxies `/scene` and `/health` to `127.0.0.1:8000` ([vite.config.ts](../vite.config.ts)). **That proxy does not exist in a production build.** A static-only deploy loads the page, fails every API call, and shows *Backend unavailable. Start the API on port 8000.* over an empty room. Everything below exists to prevent that.

## Vercel

```bash
vercel --prod
```

That is the whole command. [vercel.json](../vercel.json) supplies the rest:

| Key | Why |
| --- | --- |
| `buildCommand` / `outputDirectory` | `npm run build` → `dist/`, served statically |
| `functions["api/index.py"]` | The API as one Python serverless function |
| `includeFiles: "backend/app/**"` | The function imports `app.main`, which lives outside `api/` |
| `excludeFiles` | Keeps frontend dependencies/assets, native builds, local virtual environments, and tests out of the Python function |
| `rewrites` | `/scene/*` and `/health` → the function, so the client keeps posting to the same paths it does in dev |
| `maxDuration: 30` | Ask can wait on OpenAI |

[api/index.py](../api/index.py) is a shim: it puts `backend/` on `sys.path` and exports the existing FastAPI app. No FastAPI code is duplicated, and nothing about the app changes for deployment.

### Function bundle size

Python packaging includes project files by default; `includeFiles` is additive, not an allowlist. The function's `excludeFiles` removes `node_modules`, Vite output, browser assets, iOS artifacts, local virtual environments, and test artifacts. Keep `backend/app/**`, especially `cafe_scene.json`: the API reads that fixture at runtime. Runtime packages are installed from `api/requirements.txt`.

`.vercelignore` separately prevents local artifacts and environment files from being uploaded. Frontend source, models, public files (including `llms.txt`), and build scripts remain available to Vite and are served from the static build output; they are excluded only from the Python function.

After changing packaging, use a fresh deployment build. The frontend's Three.js chunk-size warning is separate from the function's uncompressed size limit. Do not remove 3D models or split API routes just to fix accidental file inclusion.

### Environment variables

| Variable | Required | Effect |
| --- | --- | --- |
| `OPENAI_API_KEY` | **No** | Set it for LLM ask. Leave it unset and `build_reasoner()` returns the keyword reasoner, which answers all three suggestion chips. |
| `OPENAI_MODEL` | No | Defaults to `gpt-4o-mini`. |
| `OPENAI_BASE_URL` | No | For an OpenAI-compatible endpoint. |

Deploy first, add the key whenever. The demo is complete without it — see [api.md](./api.md#post-sceneask) for exactly what the heuristics cover.

Never expose the key to the browser. It is read server-side in the function; there is no `VITE_` variant and there must not be.

### The path wrapper

A serverless platform picks the function by file route and then rewrites the request to it. Some hosts pass the original path through; some prepend the function's own route, so the app sees `/api/index/scene/ingest` instead of `/scene/ingest`.

Rather than guess, [backend/app/asgi.py](../backend/app/asgi.py) accepts both, and [backend/tests/test_asgi.py](../backend/tests/test_asgi.py) pins the behaviour — including that `/api/indexing/health` is *not* treated as being under `/api/index`.

### What is verified, and what is not

Verified locally, against the real `api/index.py` and a production `npm run build`, served from one origin with the routing `vercel.json` describes:

- the bundle loads, ingest returns nine objects, reconstruct reaches the twin, ask highlights four chairs, no console errors
- both rewrite behaviours above

Not verifiable without deploying: that Vercel's Python builder resolves `includeFiles` and imports the app as expected. If the first deploy 404s or 500s on `/scene/ingest` while the page itself loads, that is where to look — check the function log in the Vercel dashboard.

## Anywhere else

The same-origin requirement is the only hard constraint. Two shapes work:

1. **One host.** Anything that can serve `dist/` and run the ASGI app behind the same domain. Reverse-proxy `/scene` and `/health` to the app; serve `dist/` for everything else.
2. **Two hosts.** Frontend on a static host, API elsewhere. This one needs code: [src/api/scene.ts](../src/api/scene.ts) posts to root-relative paths, so it would need a build-time base URL, and the CORS allow-list in [backend/app/main.py](../backend/app/main.py) would have to name the frontend's domain instead of `localhost:5173`.

Option 2 is not wired up. Do not assume it works because the CORS middleware is present — the allow-list is localhost only.

## Checks before shipping

```bash
npm test          # Vitest + pytest + Playwright
npm run build     # tsc --noEmit + Vite production bundle
```

The build warns that the bundle is over 500 kB. That is Three.js, and it is expected.
