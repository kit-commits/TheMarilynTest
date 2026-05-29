---
title: "ES modules in the browser"
type: tutorial
tags: [browser-devtools]
created: 2026-04-18
updated: 2026-04-18
status: draft
reading_order: 6
---

# ES modules in the browser

## Before you read this

You'll get the most out of this if you've already:

- Written JavaScript that uses functions
- Seen `import` or `export` somewhere — in a tutorial, in another project, anywhere
- Opened `js/404.mjs` and skimmed it

You don't need to understand module bundlers or build systems. This repo has neither.

---

## `type="module"` on the script tag

The bottom of `404.html` has this line:

```html
<script type="module" src="js/404.mjs"></script>
```

The `type="module"` attribute does four things the browser would not do otherwise:

1. **Enables `import` and `export`** — you can use ES module syntax inside the file.
2. **Activates strict mode automatically** — you don't need `"use strict";` at the top. It's on.
3. **Scopes variables to the module** — any `const`, `let`, or `var` you declare at the top level of `404.mjs` is not available on `window`. Classic scripts dump top-level variables into the global scope. Module scripts don't.
4. **Defers execution by default** — the script runs after the HTML has been fully parsed. That's why `404.mjs` can call `document.querySelector("#roast-text")` at the bottom of the file without wrapping everything in a `DOMContentLoaded` listener.

Without `type="module"`, none of that applies. A classic `<script src="...">` tag runs in the global scope, pollutes `window`, and requires manual deferral.

---

## The `.mjs` extension

Both `js/404.mjs` and `netlify/functions/insult.mjs` use the `.mjs` extension. This is intentional.

`.mjs` unambiguously marks a file as an ES module in both browser and Node contexts. In a project where `package.json` has `"type": "module"`, all `.js` files are treated as ES modules — the extension doesn't disambiguate. `.mjs` is explicit regardless of `package.json` settings, which is useful when a file needs to be portable or when tooling might not read `package.json`.

---

## Named exports vs. default exports

`insult.mjs` uses both kinds:

```js
export const config = { /* rate limiting */ };          // named export
export default async function handler(request) { ... }  // default export
```

A **named export** has a name at the definition site. Importing it requires using that exact name (or renaming it with `as`). Netlify reads `config` by name — it's a platform contract.

A **default export** has no name at the definition site. Each file can have at most one. Netlify calls the default export as the handler.

In `404.mjs`, there are no `import` statements — the file only uses browser globals (`document`, `fetch`, `Date`). But the file is still a module because of `type="module"` on the script tag.

---

## `"type": "module"` in `package.json`

`package.json` in this repo has:

```json
"type": "module"
```

This makes all `.js` files in the project ES modules by default — Node treats them as ESM unless they use a `.cjs` extension.

That's why `.secretlintrc.cjs` uses the `.cjs` extension. The secretlint config loader uses `require()` (CommonJS) internally to load config files. In a project with `"type": "module"`, a file named `.secretlintrc.js` would be treated as ESM, and `require()` would fail. The `.cjs` extension explicitly opts that file out of ESM, so the loader can `require()` it regardless of `package.json`.

This is a real-world sharp edge: you can't always control how a tool loads its config. The `.cjs` extension is the escape hatch.

---

## Module scope vs. classic script scope

In a classic script, a top-level declaration leaks to `window`:

```html
<script>
  var greeting = "hello";
  console.log(window.greeting); // "hello"
</script>
```

In a module script, it doesn't:

```html
<script type="module">
  const greeting = "hello";
  console.log(window.greeting); // undefined
</script>
```

`404.mjs` declares `HAP_POSES`, `CLOUDINARY_BASE`, `pickPose`, `loadRoast`, and `loadPose` at the top level. None of them are on `window`. If you load a second script tag after `404.mjs`, that second script cannot access any of these names — they're scoped to the module.

This prevents accidental globals and makes it much harder for injected scripts to tamper with the data the page is using.

---

## Strict mode side effects

Strict mode is automatic in modules. Two behaviors it changes that are relevant here:

- `this` at the top level of the module is `undefined`, not `window`. Classic scripts set `this` to `window` at the top level.
- Assigning to an undeclared variable throws a `ReferenceError` instead of silently creating a global. `foo = 1` without `let` or `const` is a bug in strict mode, not a feature.

---

## Try it

1. Run `netlify dev` and open `http://localhost:8888/this-page-does-not-exist`.
2. Open DevTools → Console.
3. Type `window.HAP_POSES` and press Enter.

You'll see `undefined` — even though `HAP_POSES` is defined in `js/404.mjs` and the page is using it. Module scope doesn't leak to `window`.

Now try `window.loadRoast` — also `undefined`. The function is defined in the module, but it's not available to the console because modules are scoped.

---

## The three things to remember

1. **`type="module"` activates strict mode, module scope, and deferred execution** — not just `import`/`export` syntax.
2. **Module-scoped variables don't leak to `window`** — that's a feature, not a restriction. It prevents accidental globals and tampering.
3. **`.cjs` opts a file out of ESM** — useful when a tool's config loader uses `require()` and can't handle ESM, even in an `"type": "module"` project.
