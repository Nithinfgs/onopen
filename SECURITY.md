# Security Policy

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting: **Security → Report a vulnerability** on this repository. Do not open a public issue for a security problem.

Of particular interest:

- Any way for a scanned repository to make `onopen` **execute code**, write outside its temp directory, or read files outside the scanned tree.
- Any way for a scanned repository to **suppress its own findings**.
- Command or URL handling bugs in the `git clone` path (`src/fetch.js`).

I aim to acknowledge reports within a few days. This is a small open-source project without a bug bounty.

## Scope and expectations

`onopen` is a static pattern scanner. A missed detection (a malicious config that produces no finding) is a bug worth reporting as a normal issue with a sanitized example. It is not a vulnerability in `onopen`, because the tool does not claim to catch everything.

## Supported versions

Only the latest release receives fixes.
