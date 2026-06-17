// Post-process the tsc library output so the CLI is directly executable.
//
// tsc emits dist-lib/cli/index.js without a shebang and without the executable
// bit, so on POSIX systems `npx 3mf-to-glb` would fail. We prepend the shebang
// (if not already present) and chmod 755. On Windows the chmod is a no-op.

import { chmod, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const CLI_PATH = resolve('dist-lib/cli/index.js');
const SHEBANG = '#!/usr/bin/env node\n';

if (!existsSync(CLI_PATH)) {
  console.error(`postbuild-lib: ${CLI_PATH} not found. Did tsc -p tsconfig.lib.json run?`);
  process.exit(1);
}

const original = await readFile(CLI_PATH, 'utf8');
if (!original.startsWith('#!')) {
  await writeFile(CLI_PATH, SHEBANG + original, 'utf8');
}

try {
  await chmod(CLI_PATH, 0o755);
} catch {
  // Windows ignores chmod; that's fine, npm bin shim still wraps the script.
}

console.log(`postbuild-lib: prepared ${CLI_PATH}`);
