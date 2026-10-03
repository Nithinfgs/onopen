import fs from 'node:fs';
import { rulesMarkdown } from '../src/cli.js';

fs.writeFileSync(new URL('../docs/rules.md', import.meta.url), rulesMarkdown());
