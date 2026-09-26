// Fails when the npm tarball would ship anything other than the allowlisted
// files, or would miss one of them. Run after `npm run build`.
//
// The allowlist is deliberate: the package ships the bundled CLI, its source
// map, the README, and the license. Adding a path here widens what every
// install downloads, so it should be a reviewed change of its own.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const EXPECTED = ['LICENSE', 'README.md', 'dist/cli.js', 'dist/cli.js.map', 'package.json'];

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const raw = execFileSync(npm, ['pack', '--dry-run', '--json', '--ignore-scripts'], { encoding: 'utf8' });
const [pack] = JSON.parse(raw);
const files = pack.files.map((f) => f.path).sort();

const unexpected = files.filter((f) => !EXPECTED.includes(f));
const missing = EXPECTED.filter((f) => !files.includes(f));
const problems = [];
if (unexpected.length) problems.push(`not on the allowlist: ${unexpected.join(', ')}`);
if (missing.length) problems.push(`missing (run npm run build first?): ${missing.join(', ')}`);

const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
if (pack.version !== version) problems.push(`tarball version ${pack.version} != package.json ${version}`);

const bundle = readFileSync(new URL('../dist/cli.js', import.meta.url), 'utf8');
if (!bundle.includes(`VERSION = "${version}"`) && !bundle.includes(`VERSION = '${version}'`)) {
  problems.push(`dist/cli.js does not report version ${version} (stale build?)`);
}

if (problems.length) {
  console.error(`package contents check failed:\n  - ${problems.join('\n  - ')}`);
  process.exit(1);
}
console.log(`package contents OK: ${files.join(', ')} (${pack.name}@${pack.version})`);
