# Agent Spec Compiler

Turn a rough app idea into build-ready specification files for AI coding agents. Generate markdown artifacts sequentially, stream them live into the editor, edit them, and download everything as a ZIP.

**Repository:** [github.com/AppleLamps/spec-doc](https://github.com/AppleLamps/spec-doc)

Local/single-user MVP — no auth, payments, database, GitHub export, collaboration, or landing page..

## Stack

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS v4
- OpenRouter API (streaming + JSON)
- JSZip (client-side download)

Workspace state is saved to `localStorage` in the browser.

## Run locally

```bash
npm install
cp .env.example .env.local   # Windows: copy .env.example .env.local
# Add your OPENROUTER_API_KEY to .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Production build:

```bash
npm run build
npm start
```

## Deploy on Vercel

This app is a standard Next.js project and deploys to [Vercel](https://vercel.com) with zero config.

### 1. Push to GitHub

The repo is hosted at `https://github.com/AppleLamps/spec-doc`.

### 2. Import in Vercel

1. Go to [vercel.com/new](https://vercel.com/new) and import **AppleLamps/spec-doc**.
2. Framework preset: **Next.js** (auto-detected).
3. Build command: `npm run build` (default).
4. Output: Next.js default (no override needed).

### 3. Environment variables

Add these in **Project → Settings → Environment Variables**:

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENROUTER_API_KEY` | Yes | Your OpenRouter API key |
| `OPENROUTER_MODEL` | No | Default model when **Custom** preset has an empty model field (fallback: `anthropic/claude-sonnet-4`) |
| `NEXT_PUBLIC_APP_URL` | No | Your production URL, e.g. `https://your-app.vercel.app` (used for OpenRouter referer) |

Redeploy after adding or changing env vars.

### 4. Function duration (important)

The `/api/generate` route streams a multi-file compile and sets `maxDuration = 300` (5 minutes). On **Vercel Pro**, this allows longer compiles. On **Hobby**, serverless functions are limited to **10 seconds** — full compiles will likely timeout.

For production use on Vercel:

- Use **Vercel Pro** for full compiles, or
- Use **Core specs only** / smaller scopes to reduce run time, or
- Run locally for large full-bundle compiles

`/api/enhance-prompt` is a single quick JSON call and works on all plans.

### 5. Verify deployment

After deploy:

1. Open your Vercel URL — the workspace should load.
2. If `OPENROUTER_API_KEY` is missing, you'll see the amber API key banner.
3. Try **Enhance prompt** (1 API call) or a **Core specs only** compile to smoke-test.

## Environment variables (local)

Create `.env.local` in the project root (see `.env.example`):

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENROUTER_API_KEY` | Yes | Your OpenRouter API key |
| `OPENROUTER_MODEL` | No | Server fallback when no preset/custom model is set |
| `NEXT_PUBLIC_APP_URL` | No | App URL for OpenRouter HTTP-Referer (default: `http://localhost:3000`) |

## Enhance prompt

Click **Enhance prompt** under the project idea to:

1. Rewrite a rough idea into an implementation-ready brief (~150–350 words).
2. Auto-fill project name, app type, stack, and target agent.
3. Auto-select generation scope, preflight/review toggles, and model preset.

Uses **1 API call** (fast model). A short rationale explains the chosen settings. Edit any field afterward — the rationale clears on change.

## Generation scopes

Use **Advanced → Generation scope** to control API call count.

| Scope | Compiles | Default preflight | Default quality review |
|-------|----------|-------------------|------------------------|
| **Core specs only** | 11 core markdown files | Off | Off |
| **Core + agent files** | Core files + target agent bundle | Off | Off |
| **Full bundle** | Core + agent files | On | On |

Checkboxes **Include preflight** and **Include quality review** override scope defaults.

Example call counts (Cursor target, default checkboxes):

- Core only: **11 calls**
- Core + agent: **13 calls**
- Full bundle: **15 calls**

Single-file regenerate and **Fix warnings** each use **1 API call**.

## Model presets

Defined in `lib/model-presets.ts`:

- **Fast / cheap** — `google/gemini-2.5-flash` (JSON-capable; used for Enhance prompt)
- **Balanced** — `anthropic/claude-sonnet-4`
- **High quality** — `anthropic/claude-opus-4`
- **Custom** — any OpenRouter model ID; leave blank to use `OPENROUTER_MODEL` from env

## Generated files

**Core (11):** `README.md`, `product-spec.md`, `requirements.md`, `assumptions.md`, `architecture.md`, `data-model.md`, `api-spec.md`, `user-stories.md`, `tasks.md`, `test-plan.md`, `agent-instructions.md`

**Optional:** `preflight.md`, `quality-review.md`

**Agent-specific:** Cursor (`.cursor/rules/*.mdc`), Claude Code (`CLAUDE.md`), Codex (`AGENTS.md`), Generic (`AGENT.md`)

## OpenRouter troubleshooting

| Symptom | Fix |
|---------|-----|
| API key not configured | Set `OPENROUTER_API_KEY` in `.env.local` or Vercel env vars; redeploy |
| Unauthorized | Verify key at [openrouter.ai/keys](https://openrouter.ai/keys) |
| Rate limited | Wait, use Fast preset, or reduce scope |
| Insufficient credits | Add credits at [openrouter.ai/settings/credits](https://openrouter.ai/settings/credits) |
| Model not found | Check model string or use a preset |
| Compile timeout on Vercel | Use Pro plan, smaller scope, or run locally |

## Manual test checklist

- [ ] Missing API key → banner + compile disabled
- [ ] **Enhance prompt** → idea rewritten, settings auto-selected
- [ ] **Core specs only** → 11 files, estimate shows 11 API calls
- [ ] **Full bundle** → preflight + compile + review
- [ ] **Stop** mid-compile → partial bundle preserved
- [ ] **Fix warnings** → single-file regen
- [ ] Download ZIP → includes edited content
- [ ] Refresh → localStorage restores workspace

## Project structure

```
app/
  api/generate/route.ts       # Streaming compile (maxDuration 300)
  api/enhance-prompt/route.ts # Prompt enhancement (JSON)
  api/config/route.ts         # hasApiKey probe
components/
  SpecWorkbench.tsx           # Main orchestration
  ProjectForm.tsx             # Form, enhance, advanced settings
lib/
  enhance-prompt.ts           # Enhance system prompt + JSON parsing
  generation-scope.ts         # Scopes and API call estimates
  model-presets.ts            # OpenRouter model presets
  openrouter.ts               # Streaming + JSON completion client
  ...
```

## Known limitations

- Sequential generation — one OpenRouter call per file.
- Browser-only persistence — no server-side storage.
- Vercel Hobby function timeout — full compiles may fail; use Pro or local dev.
- No auth or rate limiting — do not expose a shared deployment without access control.
- Heuristic validation warnings — not a quality guarantee.
