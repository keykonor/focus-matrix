import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const config = JSON.parse(read('src-tauri/tauri.conf.json'));
const cargo = read('src-tauri/Cargo.toml');
const cargoLock = read('src-tauri/Cargo.lock');
const version = pkg.version;
assert.match(version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
assert.equal(config.version, version);
assert.equal(lock.version, version);
assert.equal(lock.packages[''].version, version);
assert.equal(cargo.match(/^version = "([^"]+)"/m)?.[1], version);
assert.equal(cargoLock.match(/name = "focus-matrix"\nversion = "([^"]+)"/)?.[1], version);
assert.equal(pkg.license, 'MIT');
assert.equal(config.bundle.license, 'MIT');
assert.match(cargo, /^license = "MIT"$/m);
assert.equal(config.identifier, 'com.focusmatrix.desktop');
assert.equal(config.bundle.windows.nsis.installerHooks, 'windows/installer-hooks.nsh');
assert.match(read('LICENSE'), /^MIT License/);
assert.match(read(`docs/releases/v${version}.md`), new RegExp(version.replaceAll('.', '\\.')));

// Inspect tracked files and intended new source, never ignored runtime files.
const paths = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8', windowsHide: true }).split('\0').filter(Boolean);
const privatePath = /(^|\/)(?:\.env(?:$|\.(?!example$))|\.dev\.vars|\.cloud-config|signing\/|backups\/|outputs\/|\.cloud-tools\/|\.edgeone\/)|\.(?:jks|keystore|p12|pfx|dpapi|pem|key|sqlite3?|db|dmp)$|^cloudbase\/cloudbaserc\.json$/i;
const secret = /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----|\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,}|AKID[A-Za-z0-9]{25,})|eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}|https?:\/\/[^\s"'<>]+\/#(?:pair-)?[a-f0-9]{40,}/i;
for (const path of paths) {
  assert.ok(!privatePath.test(path), `Private path refused: ${path}`);
  const bytes = readFileSync(path);
  if (bytes.includes(0)) continue;
  assert.ok(!secret.test(bytes.toString('utf8')), `Potential credential refused in ${path}; value omitted.`);
}
console.log(`PASS: ${version}, MIT, desktop identity, installer hooks, notes and ${paths.length} public source files checked. Ignored data was not read.`);
