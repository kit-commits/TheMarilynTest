---
title: "Environment variables and secrets"
type: tutorial
tags: [api-security, netlify, git]
created: 2026-04-18
updated: 2026-04-18
status: draft
reading_order: 7
---

# Environment variables and secrets

## Before you read this

You'll get the most out of this if you've already:

- Seen a `.env` file mentioned somewhere and have a rough idea it holds configuration
- Know that this repo uses a `GROQ_API_KEY` to call the Groq API
- Know basic git workflow: stage, commit, push

---

## The problem with configuration in code

The naive approach to API keys is to put them in the source file:

```js
const apiKey = "gsk_abc123..."; // don't do this
```

The problem is not just that someone could read your code. The problem is that git history is permanent. Once you push a commit with a key in it, the key exists in the history of your repo forever — even if you delete it in the next commit. Automated bots scan every public push on GitHub looking for credential patterns. A leaked key gets abused within minutes.

Environment variables are the standard solution. The key lives outside the code, in a location the runtime can read but that isn't tracked by git.

---

## The three-tier model for this repo

This project uses a deliberate three-tier approach to configuration:

**Tier 1: Netlify dashboard (Site configuration → Environment variables)**

This is where `GROQ_API_KEY` and `SITE_URL` live in production. The dashboard injects them into the function's `process.env` at runtime. They are never on disk in the project directory.

**Tier 2: `netlify dev` pulls dashboard vars automatically**

When you run `netlify dev` from a linked site, the CLI authenticates to Netlify and pulls the dashboard variables into the local function runtime. Your function gets the real `GROQ_API_KEY` locally without a `.env` file. This is intentional — it removes the need to copy credentials to your machine.

**Tier 3: `process.env` in code**

The function reads variables through `process.env`. The `getConfig()` function in `insult.mjs` reads them at call time — each handler invocation reads the current value of `process.env.SITE_URL` and `process.env.GROQ_API_KEY` when the request arrives, not when the module is first imported. The comment in the file explains why: call-time reading lets tests set `process.env` values before calling the handler without needing module resets.

---

## Why `SITE_URL` fails closed

`insult.mjs` checks whether `SITE_URL` is set before doing anything useful:

```js
if (!allowedOrigin) {
  console.error("SITE_URL is not set in production env. Insult function will return 500. ...");
  return new Response(JSON.stringify({ error: "Server misconfigured." }), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  });
}
```

If `SITE_URL` is missing in production, the function returns 500 immediately. This is intentional. Without `SITE_URL`, `allowedOrigin` would be `undefined`, and the function would either silently allow any origin or silently break CORS. A visible 500 is better than a misconfiguration that runs quietly.

In local dev, `NETLIFY_DEV=true` is injected automatically by the CLI, so `allowedOrigin` defaults to `http://localhost:8888`. A fresh clone works without any configuration.

---

## `.env.example`

The repo includes a `.env.example` file that documents which variables exist and what they're for. It uses placeholder values — no real credentials:

```bash
# Copy to .env and fill in real values if doing local overrides.
# Real credentials belong in the Netlify dashboard, not here.
GROQ_API_KEY=your_groq_api_key_here
SITE_URL=https://your-site.netlify.app
```

The real `.env` is in `.gitignore` and should never be committed. `.env.example` is safe to commit because it contains no real values.

---

## Why the pre-commit hook matters here

Secretlint runs on every `git commit` via the husky pre-commit hook. It scans every staged file for patterns that match known API key formats — AWS keys, GitHub tokens, Groq keys, generic credentials.

This catches the most common accident: you paste a real key into a JS file to test something, forget to remove it, and run `git commit`. Secretlint blocks the commit before the key reaches git history.

Read `docs/tutorials/secretlint-keeping-secrets-out-of-git.md` for detail on how to handle a blocked commit and what to do with false positives.

---

## What to do if a key leaks

If you accidentally commit a real API key:

1. **Rotate it immediately.** Go to the Groq console (or whichever service issued the key), find the key, and regenerate it. The old key is now useless.
2. **Update the Netlify dashboard.** Replace the old value with the new key under Site configuration → Environment variables.
3. **Do not rely on git history cleanup.** Deleting a key from history is possible but error-prone, and you should assume the key was already read before you noticed. Rotation makes the old key useless regardless of who read it.

The order matters: rotate first, then clean up. Cleanup without rotation leaves the old key active.

---

## Try it

1. Run `npm run secretlint` from the repo root. It should pass with no errors.
2. Open `js/404.mjs`. Add this line anywhere in the file:

   ```js
   const testKey = "gsk_testfakekeyfordemopurposesonly1234567890abcdefgh";
   ```

3. Run `npm run secretlint` again. It should flag the line with a pattern match.
4. Remove the line and run `npm run secretlint` one more time — it passes.

This is exactly what happens automatically on `git commit`. You ran it manually to see the output directly.

---

## The three things to remember

1. **Credentials go in the Netlify dashboard, not in code or `.env`.** `netlify dev` pulls them automatically when the site is linked — no manual copying needed.
2. **`SITE_URL` failing closed is intentional.** A 500 in production means the variable is missing. Set it in the dashboard; do not remove the check.
3. **If a key leaks, rotate it first.** Cleaning git history is not sufficient on its own — the key was potentially read the moment it was pushed.
