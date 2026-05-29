---
title: "Secretlint — keeping secrets out of git"
type: tutorial
tags: [api-security, git]
created: 2026-04-18
updated: 2026-04-18
status: draft
reading_order: 4
---

# Secretlint — keeping secrets out of git

## Before you read this

You should already know:

- What an API key is and why it's sensitive
- That this repo uses a `GROQ_API_KEY` to call the Groq API
- Basic git workflow (stage, commit, push)

---

## The problem

API keys committed to a public git repository are found and abused within minutes. Automated bots scan every public push on GitHub looking for credentials. It doesn't matter if you delete the key in the next commit — git history is permanent, and the key is already compromised.

This isn't hypothetical. Leaked AWS keys have generated tens of thousands of dollars in charges overnight. Leaked Groq keys drain your free quota and can result in your account being suspended.

The tricky part is that it's easy to commit a secret accidentally:

- You paste a key into a file to test something and forget to remove it
- You commit `.env` instead of `.env.example`
- You hardcode a fallback value that looks harmless but contains real credentials
- You add a config file from a tool that stored your token

---

## What secretlint does

Secretlint scans files for patterns that look like secrets — API keys, tokens, private keys, connection strings, and more. It runs before every commit via the pre-commit hook and blocks the commit if it finds anything suspicious.

It's not perfect. It uses pattern matching, not actual key validation, so it can produce false positives (flagging something that looks like a key but isn't) and false negatives (missing an unusual format). But it catches the common cases, which is where most accidental leaks happen.

---

## How it's wired up in this repo

Three pieces work together:

**`.secretlintrc.cjs`** — tells secretlint which ruleset to use. It's a `.cjs` file (CommonJS) rather than `.json` because secretlint's config loader uses `require()` and doesn't support ES modules — even in a project that uses `"type": "module"`. The `.cjs` extension signals "this file is always CommonJS regardless":

```js
module.exports = {
  rules: [
    {
      id: "@secretlint/secretlint-rule-preset-recommend",
    },
  ],
};
```

The `preset-recommend` ruleset covers the most common credential formats: AWS, GCP, GitHub tokens, generic API keys, private keys, and more.

**`package.json` `lint-staged` config** — runs secretlint on every staged file before a commit goes through:

```json
"lint-staged": {
  "**/*": ["secretlint"]
}
```

**`.husky/pre-commit`** — the git hook that triggers lint-staged automatically on `git commit`.

Put together: every time you run `git commit`, husky fires the pre-commit hook, which runs lint-staged, which runs secretlint on every file you've staged. If secretlint finds a pattern that looks like a secret, the commit is blocked and you see an error.

---

## What a blocked commit looks like

If you accidentally stage a file containing something that looks like an API key:

```text
✖ secretlint found 1 error

  .env
    1:13  error  Found Groq API key: GROQ_API_KEY  @secretlint/secretlint-rule-preset-recommend

✖ 1 problem (1 error, 0 warning)
```

The commit does not go through. To fix it:

1. Remove the secret from the file (or move it to `.env`, which is gitignored)
2. Stage the fix: `git add <file>`
3. Try the commit again

---

## Running secretlint manually

To scan the entire project at any time:

```bash
npm run secretlint
```

To scan a specific file:

```bash
npx secretlint path/to/file.js
```

This is useful when you're unsure whether something will get flagged before you stage it.

---

## What belongs in `.env` vs. the Netlify dashboard

This repo uses no local `.env` file for secrets — by design. The pattern is:

- **API keys and secrets** → Netlify dashboard only (never on disk in the project)
- **Non-secret local overrides** → shell export, one-off: `SITE_URL=http://localhost:9000 netlify dev`
- **`.env.example`** → documents variable names with placeholder values, no real secrets

If you fork this repo and add a `.env` file locally for development, make sure `.env` stays in `.gitignore` (it already is). Never commit real values to `.env.example`.

---

## False positives

Secretlint will occasionally flag something that isn't actually a secret. Common causes:

- A long random-looking string in a test fixture
- A base64-encoded value that matches a key pattern
- A placeholder like `YOUR_KEY_HERE` (this usually doesn't trigger, but some patterns do)

When you get a false positive, check the output carefully — secretlint tells you exactly which rule fired and on which line. If you're certain it's not a real secret, you can add a comment annotation to suppress the rule for that line:

```js
// secretlint-disable-next-line
const EXAMPLE = "not-a-real-key-abc123xyz";
```

Use this sparingly. If you find yourself suppressing secretlint frequently, something is wrong with the code structure.

---

## The `.env` file is already protected

Three layers prevent `.env` from being committed in this repo:

1. `.gitignore` includes `.env`
2. secretlint scans staged files for key patterns regardless of filename
3. The Netlify CLI won't inject env vars from a file you haven't created

If secretlint ever flags your `.env` file, it means you accidentally staged it — run `git restore --staged .env` to unstage it.
