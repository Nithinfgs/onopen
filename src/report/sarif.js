import { RULES } from '../rules.js';

/** @param {import('../rules.js').Severity} s */
const level = (s) => (s === 'critical' || s === 'high' ? 'error' : s === 'medium' ? 'warning' : 'note');

/** @param {import('../scan.js').ScanResult} result @param {string} version */
export function renderSarif(result, version) {
  const used = [...new Set(result.findings.map((f) => f.rule))].sort();
  return `${JSON.stringify(
    {
      $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
      version: '2.1.0',
      runs: [
        {
          tool: {
            driver: {
              name: 'onopen',
              version,
              informationUri: 'https://github.com/Nithinfgs/onopen',
              rules: used.map((id) => ({
                id,
                name: RULES[id].name,
                shortDescription: { text: RULES[id].title },
                fullDescription: { text: RULES[id].why },
                defaultConfiguration: { level: level(RULES[id].severity) },
              })),
            },
          },
          results: result.findings.map((f) => ({
            ruleId: f.rule,
            level: level(f.severity),
            message: { text: `${f.title}${f.detail ? ` (${f.detail})` : ''}${f.evidence ? `: ${f.evidence}` : ''}` },
            locations: [{ physicalLocation: { artifactLocation: { uri: f.file }, region: { startLine: f.line } } }],
          })),
        },
      ],
    },
    null,
    2,
  )}\n`;
}
