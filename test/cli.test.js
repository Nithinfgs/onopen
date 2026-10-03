import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { main } from '../src/cli.js';
import { parseTarget } from '../src/fetch.js';
import { makeRepo } from './helpers.js';

const BIN = path.resolve('bin/onopen.js');
const run = (args, cwd) => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', cwd });

test('exit codes: 1 on high findings by default, 0 when clean, 0 with --fail-on none', () => {
  assert.equal(run(['examples/hostile-repo']).status, 1);
  assert.equal(run(['examples/clean-repo']).status, 0);
  assert.equal(run(['examples/hostile-repo', '--fail-on', 'none']).status, 0);
  assert.equal(run(['examples/hostile-repo', '--fail-on=critical']).status, 1);
});

test('usage errors exit 2 with a message on stderr', () => {
  for (const args of [['--nope'], ['--format', 'xml'], ['--fail-on', 'bad'], ['does/not/exist'], ['a', 'b'], ['--ignore']]) {
    const r = run(args);
    assert.equal(r.status, 2, args.join(' '));
    assert.match(r.stderr, /^onopen: /);
  }
});

test('json output is parseable and complete', () => {
  const r = run(['examples/hostile-repo', '--format', 'json', '--fail-on', 'none']);
  const j = JSON.parse(r.stdout);
  assert.equal(j.tool, 'onopen');
  assert.ok(j.findings.length > 10);
  assert.ok(j.findings.every((f) => f.rule && f.file && f.line >= 1));
});

test('sarif output has rules, results and locations', () => {
  const j = JSON.parse(run(['examples/hostile-repo', '--format', 'sarif', '--fail-on', 'none']).stdout);
  assert.equal(j.version, '2.1.0');
  const run0 = j.runs[0];
  const ruleIds = new Set(run0.tool.driver.rules.map((r) => r.id));
  assert.ok(run0.results.length > 10);
  for (const res of run0.results) {
    assert.ok(ruleIds.has(res.ruleId));
    assert.ok(res.locations[0].physicalLocation.region.startLine >= 1);
    assert.ok(['error', 'warning', 'note'].includes(res.level));
  }
});

test('markdown output is a table', () => {
  const out = run(['examples/hostile-repo', '--format', 'markdown', '--fail-on', 'none']).stdout;
  assert.match(out, /\| Severity \| Rule \|/);
});

test('--min-severity hides low findings', () => {
  const out = run(['examples/clean-repo', '--min-severity', 'medium']).stdout;
  assert.doesNotMatch(out, /OO205/);
});

test('--ignore reads an explicit file', () => {
  const dir = makeRepo({ 'ignore.json': '{"ignore":["OO012"]}' });
  const r = run(['examples/hostile-repo', '--ignore', path.join(dir, 'ignore.json'), '--format', 'json', '--fail-on', 'none']);
  assert.ok(!JSON.parse(r.stdout).findings.some((f) => f.rule === 'OO012'));
});

test('--rules and --version', () => {
  assert.match(run(['--rules']).stdout, /OO001 +critical/);
  assert.match(run(['--version']).stdout, /^\d+\.\d+\.\d+/);
  assert.match(run(['--help']).stdout, /Usage/);
});

test('colour only when TTY and NO_COLOR unset', () => {
  /** @type {string[]} */
  const chunks = [];
  main(['examples/hostile-repo', '--fail-on', 'none'], { stdout: (s) => chunks.push(s), stderr: () => {}, isTTY: true });
  // eslint-disable-next-line no-control-regex
  assert.match(chunks.join(''), /\u001b\[/);
  chunks.length = 0;
  main(['examples/hostile-repo', '--fail-on', 'none', '--no-color'], { stdout: (s) => chunks.push(s), stderr: () => {}, isTTY: true });
  // eslint-disable-next-line no-control-regex
  assert.doesNotMatch(chunks.join(''), /\u001b\[/);
});

test('parseTarget: paths, URLs, shorthand, and refusals', () => {
  assert.equal(parseTarget('examples').kind, 'path');
  assert.deepEqual(parseTarget('owner/repo'), { kind: 'git', value: 'https://github.com/owner/repo.git' });
  assert.equal(parseTarget('https://example.com/a/b.git').kind, 'git');
  assert.equal(parseTarget('git@github.com:a/b.git').kind, 'git');
  assert.throws(() => parseTarget('--upload-pack=evil'));
  assert.throws(() => parseTarget('ext::sh -c evil'));
  assert.throws(() => parseTarget('not a thing'));
});

test('remote scan: clones a local repo over file://, scans it, cleans up, and ignores its hooks', () => {
  const src = makeRepo({ '.mcp.json': JSON.stringify({ mcpServers: { a: { command: 'npx', args: ['-y', 'x'] } } }) });
  const git = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: src, stdio: 'ignore' });
  git('init', '-b', 'main');
  git('add', '.');
  git('commit', '-m', 'init');
  const r = run([`file://${src}`, '--format', 'json', '--fail-on', 'none']);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout).findings.map((f) => f.rule), ['OO012']);
  const leftovers = fs.readdirSync(fs.realpathSync(process.env.TMPDIR ?? '/tmp')).filter((n) => n.startsWith('onopen-') && !n.startsWith('onopen-test-'));
  assert.deepEqual(leftovers, []);
});

test('remote scan: failed clone is a clean error', () => {
  const r = run(['file:///definitely/not/here', '--fail-on', 'none']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /git clone failed/);
});
