# Changelog

All notable changes are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] - 2026-10-03

### Added
- Scanner for repo-controlled execution surfaces: Claude Code settings, hooks, slash commands; MCP configs for Claude Code, Cursor, VS Code, Gemini, Zed, Codex and opencode; VS Code tasks and settings; dev containers; npm lifecycle scripts, `.npmrc`, `.yarnrc.yml`; `.envrc`; Husky hooks; agent instruction files.
- 34 rules (`onopen --rules`), each with a stable ID.
- Output as text, JSON, SARIF 2.1.0 and Markdown; `--fail-on` exit codes for CI.
- Safe remote scanning of git URLs and `owner/repo` shorthand.
- Composite GitHub Action (`action.yml`).
