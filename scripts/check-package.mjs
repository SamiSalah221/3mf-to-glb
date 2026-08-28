// Guards the published package shape.
//
// The demo and the library share one package.json. Every demo dependency
// (React, Tailwind, the R3F stack) therefore sits one careless edit away from
// becoming a runtime dependency of everyone who installs printproof. This
// asserts the packed manifest stays lean and that every path the exports map
// promises actually exists in the tarball.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const problems = [];

// 1. Runtime dependencies: an explicit allowlist, not a heuristic.
const ALLOWED_DEPS = new Set(['jszip', '@xmldom/xmldom']);
for (const name of Object.keys(pkg.dependencies ?? {})) {
  if (!ALLOWED_DEPS.has(name)) {
    problems.push(`dependencies carries "${name}"; only ${[...ALLOWED_DEPS].join(', ')} belong there`);
  }
}

// 2. three is a peer, never a hard dependency: two copies of three in one
//    bundle break instanceof checks and silently double the download.
if (pkg.dependencies?.three) problems.push('three must be a peerDependency, not a dependency');
if (!pkg.peerDependencies?.three) problems.push('three is missing from peerDependencies');

// 3. Nothing React-flavoured may reach a consumer.
for (const banned of ['react', 'react-dom', 'zustand', 'tailwindcss', '@react-three/fiber']) {
  if (pkg.dependencies?.[banned]) problems.push(`"${banned}" must not be a runtime dependency`);
}

// 4. Every exports target must be in the tarball.
const packed = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
}));
const files = new Set(packed[0].files.map((f) => f.path.replace(/\\/g, '/')));

for (const [subpath, target] of Object.entries(pkg.exports ?? {})) {
  for (const file of Object.values(target)) {
    const rel = file.replace(/^\.\//, '');
    if (!files.has(rel)) problems.push(`exports "${subpath}" points at ${rel}, which is not packed`);
  }
}

if (problems.length > 0) {
  console.error('package shape check FAILED:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(
  `package shape OK: ${packed[0].name}@${packed[0].version}, ${packed[0].entryCount} files, ` +
    `runtime deps [${Object.keys(pkg.dependencies ?? {}).join(', ')}], three peer "${pkg.peerDependencies.three}"`,
);
