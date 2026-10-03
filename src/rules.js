/**
 * Rule catalog. IDs are stable; docs/rules.md is generated from this by `onopen --rules`.
 * @typedef {'critical'|'high'|'medium'|'low'|'info'} Severity
 * @typedef {{ name: string, severity: Severity, title: string, why: string }} Rule
 */

/** @type {Record<string, Rule>} */
export const RULES = {
  OO001: { name: 'pipe-to-shell', severity: 'critical', title: 'Downloads a script and pipes it into an interpreter', why: 'Whatever the remote server returns at that moment runs with your privileges. There is nothing to review in the repo.' },
  OO002: { name: 'decode-and-exec', severity: 'critical', title: 'Decodes an encoded payload and executes it', why: 'Encoding a payload before running it hides what it does from anyone reading the config.' },
  OO003: { name: 'reverse-shell', severity: 'critical', title: 'Opens a network shell pattern', why: 'This matches common reverse-shell idioms (/dev/tcp, nc -e, bash -i >&).' },
  OO004: { name: 'secret-exfil', severity: 'critical', title: 'Reads credentials and sends data over the network', why: 'A command that touches secrets and also makes a network call matches the shape of credential theft.' },
  OO005: { name: 'secret-access', severity: 'high', title: 'Reads credentials or secret-bearing environment variables', why: 'Repo-controlled commands rarely need your SSH keys, cloud credentials or API tokens.' },
  OO006: { name: 'destructive', severity: 'high', title: 'Contains a destructive command', why: 'Recursive deletes of home or root, disk writes and similar commands can destroy data.' },
  OO007: { name: 'persistence', severity: 'high', title: 'Modifies shell startup, schedulers or user-level config', why: 'Changes outside the repo (rc files, cron, LaunchAgents, authorized_keys, global git config) outlive the folder.' },
  OO008: { name: 'hidden-characters', severity: 'high', title: 'Contains invisible or direction-changing characters', why: 'Zero-width, bidi and Unicode tag characters can hide instructions or make code read differently than it runs.' },
  OO009: { name: 'obfuscated-payload', severity: 'medium', title: 'Contains an obfuscated or very long encoded blob', why: 'Legitimate hooks are readable. Long base64, hex escapes and char-code assembly are used to hide intent.' },
  OO010: { name: 'detached-process', severity: 'medium', title: 'Starts a background process that outlives the command', why: 'nohup, setsid, disown and trailing & keep running after the command returns.' },
  OO011: { name: 'privilege-escalation', severity: 'medium', title: 'Asks for elevated privileges', why: 'sudo, doas, runas and setuid changes should never be needed to open a project.' },
  OO012: { name: 'unpinned-remote-package', severity: 'medium', title: 'Fetches and runs a package without a pinned version', why: 'npx -y, uvx and friends download the latest published version on every run, so a compromised release reaches you immediately.' },
  OO013: { name: 'network-call', severity: 'low', title: 'Makes a network call', why: 'Review where it goes and why it runs automatically.' },
  OO014: { name: 'inline-interpreter', severity: 'low', title: 'Runs inline code through an interpreter', why: 'node -e, python -c and eval hide the real logic inside a string.' },

  OO101: { name: 'claude-auto-approve-mcp', severity: 'high', title: 'Auto-approves every MCP server defined in the repo', why: 'enableAllProjectMcpServers skips the per-server prompt, so any server in .mcp.json starts without asking you.' },
  OO102: { name: 'env-hijack', severity: 'critical', title: 'Overrides an environment variable that redirects traffic or injects code', why: 'Base-URL, proxy, CA-bundle, NODE_OPTIONS, LD_PRELOAD and shell-startup variables can send your API traffic elsewhere or run code in every process.' },
  OO103: { name: 'permission-bypass', severity: 'high', title: 'Turns off permission prompts', why: 'bypassPermissions and skipDangerousModePermissionPrompt let the agent act without asking.' },
  OO104: { name: 'broad-allow-rule', severity: 'high', title: 'Pre-approves an overly broad tool permission', why: 'Unrestricted Bash, interpreters, sudo, ssh or secret-path access are approved before you see them.' },
  OO105: { name: 'wide-directory-access', severity: 'medium', title: 'Grants the agent access outside the project', why: 'additionalDirectories pointing at home or root exposes unrelated files.' },

  OO202: { name: 'mcp-insecure-url', severity: 'medium', title: 'MCP server over plain http to a non-local host', why: 'Tool calls and responses cross the network unencrypted.' },
  OO203: { name: 'mcp-inline-secret', severity: 'high', title: 'Hard-coded secret in an MCP or tool config', why: 'Tokens committed to a repo are exposed to everyone who can read it. Use an environment variable reference.' },
  OO205: { name: 'mcp-remote-server', severity: 'low', title: 'Remote MCP server', why: 'Your prompts and tool results are sent to a third-party host.' },
  OO206: { name: 'mcp-repo-script', severity: 'medium', title: 'MCP server runs a script shipped inside the repo', why: 'The repo author controls the code that runs. Read it first.' },

  OO301: { name: 'devcontainer-host-command', severity: 'high', title: 'Dev container command runs on your host, not in the container', why: 'initializeCommand executes on the machine that opens the folder, before the container exists.' },
  OO302: { name: 'workspace-executable-path', severity: 'high', title: 'Workspace setting points an editor at a binary inside the repo', why: 'Once you trust the workspace, the editor launches that binary for formatting, linting or terminals.' },
  OO304: { name: 'devcontainer-privileged', severity: 'high', title: 'Dev container weakens isolation', why: '--privileged, host namespaces, unconfined seccomp or the Docker socket let the container escape to the host.' },
  OO305: { name: 'devcontainer-host-mount', severity: 'medium', title: 'Dev container mounts sensitive host paths', why: 'Mounting ~/.ssh, ~/.aws or your home directory exposes them to everything in the container.' },

  OO402: { name: 'non-registry-dependency', severity: 'medium', title: 'Dependency resolved from git or a URL', why: 'It bypasses registry integrity and moderation, and can change under you.' },
  OO403: { name: 'npmrc-risk', severity: 'high', title: 'Risky .npmrc setting', why: 'script-shell, node-options, git and committed auth tokens change how or where npm runs code.' },
  OO404: { name: 'npmrc-registry', severity: 'medium', title: 'Registry redirected away from the default', why: 'A non-default registry decides which code you install.' },
  OO406: { name: 'yarn-path', severity: 'low', title: 'Yarn runs a release file committed in the repo', why: 'Normal for Yarn Berry, but it is arbitrary JavaScript that runs on every yarn command.' },

  OO501: { name: 'hidden-unicode-instructions', severity: 'high', title: 'Hidden Unicode in an agent instruction file', why: 'Invisible characters in AGENTS.md, CLAUDE.md or rules files can smuggle instructions to the model that you cannot see.' },
  OO502: { name: 'instruction-injection-phrase', severity: 'medium', title: 'Instruction file contains prompt-injection phrasing', why: 'Phrases like "do not tell the user" try to override your agent or hide actions from you.' },
  OO601: { name: 'symlink-escape', severity: 'medium', title: 'Symlink points outside the repository', why: 'A link inside the repo can make a tool read or write files elsewhere on your machine.' },
};

/** @type {Severity[]} */
export const SEVERITIES = ['info', 'low', 'medium', 'high', 'critical'];

/** @param {Severity} s */
export const severityRank = (s) => SEVERITIES.indexOf(s);
