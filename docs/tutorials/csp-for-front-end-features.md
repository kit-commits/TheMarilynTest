---
title: "CSP for front-end features"
type: tutorial
sources:
  - "[[cors-is-hard-and-everyone-hates-it]]"
  - "[[hardening-walkthrough-applying-each-audit-fix]]"
tags: [api-security, browser-devtools, xss]
created: 2026-04-18
updated: 2026-04-18
status: draft
reading_order: 8
---

# CSP for front-end features

## Before you read this

You'll get the most out of this if you've already:

- Read the CORS tutorial (`docs/tutorials/cors-is-hard-and-everyone-hates-it.md`) — CSP and CORS are different mechanisms that address different problems; knowing one makes the other clearer
- Know what a browser is and that it loads HTML, CSS, JavaScript, and images

---

## What CSP is

Content Security Policy is a browser-enforced allowlist of where resources may come from. It's declared in a response header sent by the server. When the browser loads a page, it checks every resource — scripts, stylesheets, images, fetch requests — against the policy. Anything that violates it gets blocked.

CORS controls whether JavaScript may _read_ a response from another origin. CSP controls whether the _page itself_ may load resources from a given source in the first place. You can have both on the same response, and they enforce independently.

The practical effect for you as a developer: if you add a new resource to the page — a JavaScript file from an external CDN, an image from a different domain, a fetch to a third-party API — and it's not listed in the CSP, the browser blocks it.

---

## Where this repo's CSP lives

The CSP header is set in `netlify.toml` in the `[[headers]]` block:

```toml
Content-Security-Policy = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https://res.cloudinary.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
```

Note: the hardening walkthrough (`docs/tutorials/hardening-walkthrough-applying-each-audit-fix.md`) deployed this as `Content-Security-Policy-Report-Only` initially, then promoted it to `Content-Security-Policy` after confirming no violations. The current value in `netlify.toml` is enforcing — violations are blocked, not just logged.

---

## What each directive means

**`default-src 'self'`**

The fallback for any resource type not listed explicitly. `'self'` means the same scheme, host, and port as the page. If a directive below doesn't list a source, this applies instead. It's the "everything not otherwise specified comes from here" rule.

**`script-src 'self'`**

JavaScript files must come from the same origin. This does two things:

- External script tags (loading JS from a CDN) are blocked unless the CDN is listed here.
- Inline `<script>` blocks are blocked. The browser treats inline scripts as coming from no origin — they fail `'self'`. This is the security benefit: even if an attacker somehow injects a `<script>` tag into the page's HTML, it won't execute.

**`style-src 'self'`**

CSS files must come from the same origin. Inline `<style>` blocks are similarly blocked (same logic as inline scripts). External CSS from CDNs is blocked unless listed.

**`img-src 'self' https://res.cloudinary.com`**

Images from the same origin or from Cloudinary. HAP pose images are served from `res.cloudinary.com/cynthia-teeters`, so that domain is in the allowlist. Any other image domain is blocked.

**`connect-src 'self'`**

Destinations for `fetch()`, `XMLHttpRequest`, and WebSocket connections. The 404 page fetches `/.netlify/functions/insult`, which is the same origin as the page, so `'self'` covers it. If you add a fetch to an external API from client-side code, you need to add that API's origin here.

**`frame-ancestors 'none'`**

Prevents other sites from embedding this page in an `<iframe>`. Equivalent to the `X-Frame-Options: DENY` header also set in `netlify.toml`, but honored by newer browsers.

**`base-uri 'none'`**

Disallows `<base>` tags, which can rewrite relative URLs on the page and redirect resources to attacker-controlled origins.

**`form-action 'none'`**

Disallows form submissions. This page has no forms, so this directive costs nothing and removes an injection vector.

---

## What this means for Track 1

Any new JavaScript you add must go in an external `.mjs` file loaded with `<script type="module" src="...">`. You cannot use inline `<script>` blocks — the `script-src 'self'` directive blocks them.

Inline event handlers are also blocked:

```html
<!-- this will not work — inline JS is blocked by script-src 'self' -->
<button onclick="doSomething()">Click me</button>
```

Attach event listeners in JavaScript instead:

```js
document.querySelector("#my-button").addEventListener("click", doSomething);
```

This is already the pattern `js/404.mjs` uses — see the `addEventListener` call at the bottom of that file.

If you add a new image from a domain other than `res.cloudinary.com`, you need to add that domain to `img-src` in `netlify.toml`. If you add a `fetch()` call to an external API, add its origin to `connect-src`.

---

## How to check violations

DevTools → Console shows CSP violations as red errors with messages like:

```text
Refused to execute inline script because it violates the following Content Security Policy directive: "script-src 'self'"
```

DevTools → Issues tab shows them in a more structured format, grouped by directive, with the blocked resource URL and the directive that blocked it.

After any `netlify.toml` change, do a hard reload (`Cmd+Shift+R` on macOS, `Ctrl+Shift+R` on Windows/Linux) — headers are cached and a normal reload may not pick up the change.

---

## Try it

1. Open `404.html` and add this line anywhere inside `<body>`:

   ```html
   <script>
     console.log("inline script test");
   </script>
   ```

2. Run `netlify dev` and load `http://localhost:8888/this-page-does-not-exist`.
3. Open DevTools → Console. You should see a CSP violation error — the inline script was blocked.
4. Open DevTools → Issues. You should see the same violation listed there.
5. Remove the line from `404.html` and confirm the violation disappears.

---

## The three things to remember

1. **CSP is an allowlist, not a blocklist.** If a source isn't listed, it's blocked. Adding a new external resource means updating the policy.
2. **Inline scripts and inline event handlers are blocked by `script-src 'self'`.** All JavaScript goes in external files, all event handlers attached via `addEventListener`.
3. **CSP violations show in DevTools → Console and DevTools → Issues.** Check both after any change that adds a new resource to the page.
