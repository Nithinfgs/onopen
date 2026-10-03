/** @param {import('../scan.js').ScanResult} result */
export function renderMarkdown(result) {
  const lines = [`## onopen report for \`${result.label}\``, ''];
  if (!result.findings.length) lines.push('No findings.', '');
  else {
    lines.push('| Severity | Rule | Location | What |', '|---|---|---|---|');
    for (const f of result.findings) {
      const what = `${f.title}${f.evidence ? ` — \`${f.evidence.replace(/\|/g, '\\|').replace(/`/g, "'")}\`` : ''}`;
      lines.push(`| ${f.severity} | ${f.rule} | \`${f.file}:${f.line}\` | ${what} |`);
    }
    lines.push('');
  }
  lines.push('_Static pattern analysis. A clean result is not proof of safety._', '');
  return lines.join('\n');
}
