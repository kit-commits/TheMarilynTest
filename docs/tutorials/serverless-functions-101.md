---
title: "Serverless functions 101"
type: tutorial
tags: [netlify, api-security]
created: 2026-04-18
updated: 2026-04-18
status: draft
reading_order: 5
---

# Serverless functions 101

## Before you read this

You'll get the most out of this if you've already:

- Used `fetch()` from a browser and seen it return data
- Looked at `netlify/functions/insult.mjs` at least once — you don't need to understand it yet
- Know what a URL is and that HTTP has methods like GET and POST

You don't need to know what a server is in any deep sense. That's actually the point of this tutorial.

---

## What "serverless" means

"Serverless" is a misleading name. There is a server. What it means is that you don't manage a persistent server process — no Node process sitting in memory between requests, no port to keep running, no machine to babysit.

Instead: you write a function, deploy it, and the platform (Netlify, in this case) handles everything else. When a request arrives, Netlify spins up a Node process, runs your function, returns the response, and tears the process down. The next request gets a fresh process. Nothing persists between calls.

The practical consequences:

- You can't store anything in a module-level variable and expect it to be there for the next request. Each invocation starts clean.
- Cold starts are a real thing — the first request after a period of inactivity takes a little longer while Node spins up.
- Local development with `netlify dev` simulates this behavior: it starts a Node process per request, not once at startup.

---

## How Netlify Functions v2 works

A Netlify Function v2 is an ES module with two exports:

```js
export const config = {
  /* ... rate limiting, etc. */
};
export default async function handler(request) {
  /* ... */
}
```

The `config` named export configures the function at the platform level — rate limiting lives here. The default export is the handler. Netlify calls it for every request.

The handler receives a standard Web API `Request` object and must return a standard Web API `Response`. These are the same `Request` and `Response` interfaces the browser's `fetch()` uses. Not a Node-specific thing — not `req.body`, not `res.send()`. If you've called `fetch()` in a browser, you already know this API.

```js
export default async function handler(request) {
  // request.method, request.headers.get("origin"), etc.
  return new Response(JSON.stringify({ hello: "world" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
```

---

## The anatomy of `insult.mjs`

The file at `netlify/functions/insult.mjs` is a working example of all of this. Here's what each part does:

**`export const config`** — sets the rate limit: at most 4 requests per 60 seconds, counted per IP and per domain. Netlify enforces this before the handler ever runs. A caller that exceeds it gets a 429 response without your code being involved.

**`getConfig()`** — reads environment variables at call time (not at module load). Returns `allowedOrigin` and the CORS headers built from it. The file has a comment above this function explaining exactly why call-time reading matters for testability.

**The handler steps** — the comment in the file describes the order explicitly:

1. `getConfig()` — resolve origin and build CORS headers
2. Method check — return 405 for anything that isn't GET
3. Misconfig guard — return 500 if `allowedOrigin` is not set
4. Origin/referer check — return 403 if the request origin doesn't match
5. API key check — return a fallback insult if no `GROQ_API_KEY`
6. Groq call — call the API, fall back on any failure

Each step returns early if something is wrong. The function never reaches the Groq call unless all the earlier checks pass. This order matters — don't restructure it when adding a feature.

---

## How `netlify.toml` wires it up

Two blocks in `netlify.toml` are relevant:

```toml
[functions]
  directory = "netlify/functions"
```

This tells Netlify to look in `netlify/functions/` for function files. The filename becomes part of the URL: `insult.mjs` is available at `/.netlify/functions/insult`. You don't register it anywhere — naming it in the right directory is enough.

```toml
[[redirects]]
  from = "/*"
  to = "/404.html"
  status = 404
```

This wildcard redirect means any path that doesn't match a real file serves `404.html` with a 404 status. `/.netlify/functions/insult` is handled by the function runtime before this redirect rule applies — function paths are never matched by redirect rules.

---

## Local development

`netlify dev` makes functions available locally at `http://localhost:8888`. When a request hits `/.netlify/functions/insult`, the CLI invokes the handler and prints the output to the terminal.

The terminal is your primary debugging tool for function-side problems. `console.log`, `console.warn`, and `console.error` calls in the function appear there — not in the browser. If the 404 page shows a fallback roast and you want to know why, check the terminal first.

---

## Why the function only accepts GET

The method check near the top of the handler returns 405 for anything other than GET:

```js
if (request.method !== "GET") {
  return new Response(JSON.stringify({ error: "Method not allowed. Use GET." }), {
    status: 405,
    headers: corsHeaders,
  });
}
```

This makes intent explicit. The function fetches a roast — it never writes anything. Returning 405 for POST, PUT, and DELETE makes that fact visible and stops tools or scripts from accidentally treating the endpoint as if it accepted writes.

---

## Try it

1. Run `netlify dev` from the repo root.
2. Visit `http://localhost:8888/this-page-does-not-exist` in your browser.
3. Watch the terminal. You should see lines like:

   ```text
   Request from ::1: GET /.netlify/functions/insult?t=...
   Response with status 200 in 312 ms.
   ```

4. Try triggering a 405: open your browser console and run:

   ```js
   fetch("/.netlify/functions/insult", { method: "POST" }).then((r) => console.log(r.status));
   ```

   You should see `405` logged. Check the terminal — you'll see the request and response status there too.

---

## The three things to remember

1. **Serverless means no persistent process.** Each request gets a fresh Node invocation. Nothing you store in memory survives to the next call.
2. **The handler uses standard Web API `Request` and `Response`.** The same objects the browser uses — not Express, not Node's `http` module.
3. **The terminal is the function's console.** `console.log` in `insult.mjs` appears in the `netlify dev` terminal, not in the browser.
