import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJsonc } from '../src/util/jsonc.js';
import { parseToml } from '../src/util/toml.js';
import { lineOf } from '../src/util/text.js';

test('jsonc: comments, trailing commas, BOM, strings containing //', () => {
  const v = parseJsonc('﻿{\n // c\n "a": "http://x", /* b */ "b": [1,2,],\n}\n');
  assert.deepEqual(v, { a: 'http://x', b: [1, 2] });
});

test('jsonc: invalid input throws', () => {
  assert.throws(() => parseJsonc('{ nope'));
});

test('toml: tables, arrays, inline tables, multiline arrays', () => {
  const v = parseToml(`
model = "x" # comment
notify = ["bash", "-c", "echo hi"]

[mcp_servers.fs]
command = "npx"
args = [
  "-y",
  "pkg@1.0.0",
]
env = { TOKEN = "abc", N = 3 }

[mcp_servers."with.dot"]
url = "https://example.com/mcp"
enabled = true
`);
  assert.deepEqual(v.notify, ['bash', '-c', 'echo hi']);
  assert.equal(v.mcp_servers.fs.command, 'npx');
  assert.deepEqual(v.mcp_servers.fs.args, ['-y', 'pkg@1.0.0']);
  assert.deepEqual(v.mcp_servers.fs.env, { TOKEN: 'abc', N: 3 });
  assert.equal(v.mcp_servers['with.dot'].url, 'https://example.com/mcp');
  assert.equal(v.mcp_servers['with.dot'].enabled, true);
});

test('toml: garbage throws', () => {
  assert.throws(() => parseToml('this is not toml'));
});

test('lineOf finds JSON-escaped strings', () => {
  const raw = '{\n  "c": "echo \\"hi\\""\n}';
  assert.equal(lineOf(raw, 'echo "hi"'), 2);
  assert.equal(lineOf(raw, 'missing'), 1);
});
