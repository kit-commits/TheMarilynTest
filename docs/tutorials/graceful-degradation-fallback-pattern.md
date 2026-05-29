---
title: "Graceful degradation — the fallback pattern"
type: tutorial
sources:
  - "[[hardening-walkthrough-applying-each-audit-fix]]"
  - "[[serverless-functions-101]]"
tags: [api-security, netlify]
created: 2026-04-18
updated: 2026-04-18
status: draft
reading_order: 9
---

# Graceful degradation — the fallback pattern

## Before you read this

You'll get the most out of this if you've already:

- Seen a `try/catch` block and know roughly what it does
- Know what an API call is — you send a request, you get a response
- Read the serverless functions tutorial (`docs/tutorials/serverless-functions-101.md`) and have a picture of what `insult.mjs` does

---

## What graceful degradation means

Graceful degradation is a design principle: your code always does something useful, even when a dependency fails.

The alternative — crashing when the API is down, showing a blank screen, leaving a spinner running forever — is avoidable. The 404 page in this repo depends on a third-party API (Groq) and a third-party image host (Cloudinary). Both can fail. The design goal is that the page always shows something, regardless of what fails.

A useful test: if every external dependency went down simultaneously, would the page still render? For this repo, the answer is yes. The fallback insults are hardcoded in `insult.mjs`. The pose images degrade to their `alt` text if Cloudinary is unreachable.

---

## The four fallback layers in `insult.mjs`

The function is structured so that a failure at any point produces a useful response. Here are the four layers, in order:

**Layer 1 — No API key**

```js
const apiKey = process.env.GROQ_API_KEY;
if (!apiKey) {
  return new Response(JSON.stringify({ insult: randomFallback(), source: "fallback" }), {
    status: 200,
    headers: corsHeaders,
  });
}
```

If `GROQ_API_KEY` is not set, the function returns a fallback insult immediately without attempting the Groq call. `source: "fallback"` in the response signals that this happened. The page gets a 200 and shows a canned roast.

**Layer 2 — Groq returns a non-2xx status**

```js
if (!response.ok) {
  console.warn(`Groq API returned ${response.status}`);
  return new Response(JSON.stringify({ insult: randomFallback(), source: "fallback" }), {
    status: 200,
    headers: corsHeaders,
  });
}
```

A 401 (bad key), 429 (rate limited by Groq), or 5xx (Groq is having problems) all land here. The `console.warn` logs the status code in the `netlify dev` terminal so you can see what happened. The function still returns 200 with a fallback — the caller (the 404 page) doesn't know the difference.

**Layer 3 — Response shape is wrong**

```js
const insult = data?.choices?.[0]?.message?.content?.trim();
if (!insult) {
  console.warn("Groq response missing expected content shape.");
  return new Response(JSON.stringify({ insult: randomFallback(), source: "fallback" }), {
    status: 200,
    headers: corsHeaders,
  });
}
```

Groq returned 200 but the JSON doesn't have the expected structure. The optional chaining (`?.`) short-circuits to `undefined` at the first missing step — so if `data.choices` is an empty array, `data?.choices?.[0]` is `undefined`, and the whole expression is `undefined` without throwing. The explicit `if (!insult)` check makes the fallback intentional code, not an accident.

Compare to direct access, which would throw a `TypeError` if any step is null:

```js
const insult = data.choices[0].message.content.trim(); // throws if choices is empty
```

**Layer 4 — `fetch` itself throws**

```js
} catch {
  return new Response(JSON.stringify({ insult: randomFallback(), source: "fallback" }), {
    status: 200,
    headers: corsHeaders,
  });
}
```

A DNS failure, TCP timeout, or TLS error causes `fetch()` to reject its promise, which `await` turns into a thrown error. The `catch` block at the bottom of the `try` catches this and returns a fallback. The page never sees a 500.

---

## The `{ insult, source }` shape

Every response from the function includes a `source` field — either `"groq"` or `"fallback"`. It's never shown to the user.

It exists for debugging. If the page is consistently showing canned roasts instead of live ones, open DevTools → Network, click the `insult` request, and check the Preview tab. If `source` is `"fallback"`, you know the live API path failed. Then check the `netlify dev` terminal for a `console.warn` that tells you why.

---

## Apply this to Track 1 features

If you're adding a clipboard share button, the Clipboard API (`navigator.clipboard`) is not supported in all browsers and requires a secure context. A button that crashes the page when the API is unavailable is not gracefully degrading. Options:

- Check for support before showing the button: `if (navigator.clipboard) { ... }`
- Catch the permission denial: `navigator.clipboard.writeText(text).catch(() => showError())`
- Hide or disable the button until a roast is loaded: don't offer to copy an empty string

The pattern is the same as `insult.mjs`: check first, handle failure explicitly, never leave the user with a broken state.

---

## Apply this to Track 2 features

If you're adding response caching, what happens when the cache is unavailable? A function that throws when it can't read the cache is not degrading gracefully. The fallback is: if the cache fails, proceed as if it didn't exist and call Groq directly. The feature degrades, the function still returns an insult.

---

## Try it

Open `insult.mjs`. Find the early return for the missing API key check (the `if (!apiKey)` block). Comment it out. Then temporarily set `GROQ_API_KEY` to an empty string in your shell and restart `netlify dev`:

```bash
GROQ_API_KEY="" netlify dev
```

Visit `http://localhost:8888/this-page-does-not-exist`. The function will now attempt the Groq call with an empty key, get a 401 back, hit layer 2, log a warning in the terminal, and return a fallback. The page still shows a roast.

Revert both changes (uncomment the check, remove the env override) before committing.

---

## The three things to remember

1. **Every external dependency can fail.** Design every feature that calls one with an explicit fallback path, not just error handling.
2. **Optional chaining (`?.`) degrades instead of crashing.** Use it when accessing deeply nested response data from an API whose shape might change.
3. **`source: "fallback"` in the response is a debug signal.** Check it in the Network tab Preview when live roasts aren't appearing — it tells you immediately whether the API path succeeded.
