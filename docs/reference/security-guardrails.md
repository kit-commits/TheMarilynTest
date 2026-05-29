---
title: "Security guardrails"
type: reference
tags: [api-security, xss, netlify]
created: 2026-04-18
updated: 2026-04-18
status: draft
---

# Security guardrails

Non-negotiable constraints for this repo. Each item is a security rule, not a style preference. Check your code against this list before every pull request.

- [ ] **No `Access-Control-Allow-Origin: *`** — the wildcard allows any website on the internet to call your function from a browser and drain your Groq quota. Always set it to a specific origin.
- [ ] **Never remove or weaken the `sameOriginRequest` origin/referer check** — CORS is browser-only; curl and server-side scripts ignore it entirely. The origin check in `insult.mjs` is the server-side layer that blocks non-browser callers before they spend an API call.
- [ ] **Never hardcode an API key anywhere in source** — keys in source code end up in git history and are found by automated scanners within minutes of a public push. Keys live in the Netlify dashboard only.
- [ ] **Never commit `.env`** — `.env` is gitignored for this reason. If secretlint blocks a commit with a `.env`-related error, run `git restore --staged .env` and check what you staged.
- [ ] **No inline `<script>` blocks in HTML** — the CSP in `netlify.toml` uses `script-src 'self'`, which blocks inline scripts. Inline scripts are also a classic XSS injection target. All JavaScript goes in external `.mjs` files.
- [ ] **Never use `innerHTML` for API response content** — `innerHTML` parses and executes HTML, including `<script>` tags. Use `textContent` for any string that originates from an API response or user input. See `js/404.mjs` for the correct pattern.
- [ ] **Never use `eval()`, `new Function()`, or `setTimeout(string)`** — all three execute arbitrary strings as code. There is no safe use of these with untrusted data.
- [ ] **Never reduce `windowLimit` below 4 or remove rate limiting config** — the `config` export in `insult.mjs` limits each IP to 4 requests per 60-second window. This prevents a single caller from burning the free Groq tier. Lower limits are fine; removing the limit is not.
- [ ] **`SITE_URL` must remain required in production** — the function returns 500 if `SITE_URL` is missing in a non-dev environment. That 500 is intentional: a misconfigured function that refuses to run is better than one that silently allows every origin. Do not add a fallback that bypasses this check in production.
