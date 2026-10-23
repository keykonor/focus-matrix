import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { saveVersion } from './save-version.mjs';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const privateFiles = ['focus-matrix.json', '.focus-matrix.previous.json', '.window-state.json',
  '.update-session.json', 'focus-matrix.corrupt-test.json', 'focus-matrix.json.pending-write-payload',
  'nested/focus-matrix.json', '.cloud-config.previous.bin', 'backup.pfx', 'cloudbase/cloudbaserc.json'];
const privateContent = 'SYNTHETIC-PRIVATE-CONTENT-MUST-NOT-BE-LOGGED';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'focus-source-policy-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  git('init'); git('config', 'user.name', 'Source Policy Test'); git('config', 'user.email', 'test@localhost');
  for (const path of ['package.json', 'package-lock.json', 'src-tauri/tauri.conf.json',
    'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock', 'LICENSE', 'docs/releases/v0.2.0.md']) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), readFileSync(join(project, path)));
  }
  writeFileSync(join(root, '.gitignore'), privateFiles.map(path => '/' + path).join('\n') + '\n/outputs/\n');
  git('add', '--all'); git('commit', '-m', 'Synthetic source baseline');
  return { root, git };
}

function check(root) {
  return spawnSync(process.execPath, [join(project, 'scripts/check-public-release.mjs')], {
    cwd: root, encoding: 'utf8', windowsHide: true,
  });
}

for (const path of privateFiles) {
  test(`tracked private file is refused by release check and source snapshot: ${path}`, t => {
    const { root, git } = fixture(t);
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), privateContent);
    git('add', '--force', path);
    const checked = check(root);
    assert.notEqual(checked.status, 0, 'A tracked private file reached public source validation');
    const output = checked.stdout + checked.stderr;
    assert.match(output, /Private path refused/);
    assert.ok(!output.includes(privateContent), 'Private contents reached the log');
    assert.throws(() => saveVersion(root), /private file/);
    assert.equal(git('tag', '--list'), '', 'A refused snapshot created a tag');
  });
}

test('ignored runtime data is excluded while public documentation and examples remain allowed', t => {
  const { root, git } = fixture(t);
  for (const path of privateFiles) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), privateContent);
  }
  // A synthetic directory with a runtime filename proves the checker never reads it.
  rmSync(join(root, 'focus-matrix.json'));
  mkdirSync(join(root, 'focus-matrix.json'));
  writeFileSync(join(root, 'cloudbase/cloudbaserc.json'), '{"functions":[]}');
  writeFileSync(join(root, '.env.example'), 'EXAMPLE_ONLY=replace-me\n');
  writeFileSync(join(root, 'README.md'), 'Public example: focus-matrix.json is user data.\n');
  const checked = check(root);
  assert.equal(checked.status, 0, checked.stderr);
  const snapshot = saveVersion(root);
  assert.equal(git('ls-tree', '-r', '--name-only', snapshot.tag).includes('focus-matrix.json'), false);
  assert.equal(git('show', `${snapshot.tag}:README.md`).includes('Public example'), true);
});
