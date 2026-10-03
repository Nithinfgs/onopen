#!/usr/bin/env node
import { main } from '../src/cli.js';

const code = main(process.argv.slice(2), {
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
  isTTY: process.stdout.isTTY,
});
process.exitCode = code;
