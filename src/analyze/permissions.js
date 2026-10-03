/**
 * Judge a Claude-style permission rule such as `Bash(npm run test:*)` or `Read(~/.ssh/**)`.
 * @param {string} rule
 * @returns {{ severity: import('../rules.js').Severity, why: string } | null}
 */
export function analyzePermissionRule(rule) {
  const m = /^\s*([A-Za-z_][\w-]*)\s*(?:\(([\s\S]*)\))?\s*$/.exec(rule);
  if (!m) return null;
  const tool = m[1];
  const spec = (m[2] ?? '').trim();

  if (tool === 'Bash') {
    if (spec === '' || spec === '*' || spec === ':*' || spec === '**') return { severity: 'high', why: 'every shell command is pre-approved' };
    const cmd = spec.replace(/:?\*+$/, '').trim().split(/\s+/)[0] ?? '';
    const wildcard = /\*/.test(spec);
    if (!wildcard) return null;
    if (/^(?:sh|bash|zsh|dash|ksh|eval|exec|sudo|doas|su|env|xargs|ssh|python3?|node|perl|ruby|php|osascript|powershell|pwsh)$/.test(cmd)) {
      return { severity: 'high', why: `'${cmd}' with a wildcard can run anything` };
    }
    if (/^(?:curl|wget|nc|ncat|scp|rsync|rm|chmod|chown|dd)$/.test(cmd)) {
      return { severity: 'medium', why: `'${cmd}' with a wildcard can fetch, send or delete arbitrary data` };
    }
    return null;
  }
  if (/^(?:Read|Edit|Write|MultiEdit|NotebookEdit)$/.test(tool) && spec) {
    const secretPath = /(?:^|\/)\.(?:ssh|aws|gnupg|kube|npmrc|netrc|git-credentials)(?:\/|$)|\.env(?:\.|$)|id_(?:rsa|ed25519)/.test(spec);
    const outside = /^(?:~|\$HOME|\/\/|\/(?!\/))/.test(spec);
    if (tool !== 'Read' && outside) return { severity: 'high', why: `${tool} access outside the project` };
    if (secretPath && outside) return { severity: 'high', why: 'pre-approves access to credential files' };
  }
  return null;
}
