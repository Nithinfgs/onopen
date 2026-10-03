# Contributing

Thanks for helping. The most valuable contributions are **new rules, new config formats, and false-positive reports**.

## Setup

```bash
git clone https://github.com/Nithinfgs/onopen && cd onopen
npm install
npm run check        # eslint + tsc (checkJs, strict) + node:test
```

Node 20+. The tool has zero runtime dependencies and that is a hard constraint: a security scanner should be easy to audit.

## Adding a rule

1. Add an entry to `RULES` in `src/rules.js` (stable ID, severity, one-line title, one-line "why"). IDs are never reused.
2. Emit it from the right place:
   - a pattern inside a command string → `src/analyze/command.js`
   - an environment variable → `src/analyze/env.js`
   - a permission rule → `src/analyze/permissions.js`
   - something about a specific file format → the matching file in `src/collectors/`
3. Add tests with **both** a positive case and a near-miss that must *not* fire. Precision matters more than recall here.
4. Run `node scripts/gen-rules-doc.js` to regenerate `docs/rules.md`.

## Adding a config format

Add a collector in `src/collectors/`, register it in `src/scan.js`, and use `ctx.addCommand()` for anything that executes (it records *when* it fires and runs the command analyzer) or `ctx.addFinding()` for settings-level problems. Use `ctx.read()` to read files: it refuses symlinks and large files.

## Ground rules

- The scanner must never execute, import or evaluate anything from the target repo. Parsing is fine; running is not.
- Claims in docs must be reproducible. No benchmark numbers without a script that produces them.
- Test fixtures that look malicious must point at `*.example.invalid` and be inert.
- Keep messages factual: say what the config does, not that the author is malicious.

## Pull requests

Small, focused PRs with tests. Use conventional-style commit prefixes (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
