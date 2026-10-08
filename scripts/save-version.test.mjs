import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveVersion } from './save-version.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'focus-matrix-versions-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  git('init');
  git('config', 'user.name', 'Version Test');
  git('config', 'user.email', 'test@localhost');
  writeFileSync(join(root, '.gitignore'), 'outputs/\n.env*\ncloudbase/cloudbaserc.json\n');
  writeFileSync(join(root, 'app.txt'), 'Original source');
  git('add', '--all'); git('commit', '-m', 'Initial fixture');
  return { root, git };
}

test('saved versions keep edits and deletions, and archive hashes can be verified', t => {
  const { root, git } = fixture(t);
  const first = saveVersion(root, 'Original');
  writeFileSync(join(root, 'app.txt'), 'Updated source');
  writeFileSync(join(root, 'new.txt'), 'New file');
  const second = saveVersion(root, 'Updated');
  rmSync(join(root, 'new.txt'));
  const third = saveVersion(root, 'Deleted file');
  assert.equal(git('show', `${first.tag}:app.txt`), 'Original source');
  assert.equal(git('show', `${second.tag}:app.txt`), 'Updated source');
  assert.equal(git('show', `${second.tag}:new.txt`), 'New file');
  assert.throws(() => git('show', `${third.tag}:new.txt`));
  for (const saved of [first, second, third]) {
    const archive = readFileSync(join(saved.directory, 'source.zip'));
    assert.equal(createHash('sha256').update(archive).digest('hex'), saved.sha256);
    assert.equal(JSON.parse(readFileSync(join(saved.directory, 'manifest.json'))).commit, saved.commit);
    assert.equal(git('rev-parse', `${saved.tag}^{commit}`), saved.commit);
  }
});

test('repeated saves without edits retain separate tags and never stage archives or secrets', t => {
  const { root, git } = fixture(t);
  writeFileSync(join(root, '.env'), 'PRIVATE=do-not-publish');
  const first = saveVersion(root);
  const second = saveVersion(root);
  assert.equal(first.commit, second.commit);
  assert.notEqual(first.tag, second.tag);
  assert.equal(git('status', '--porcelain'), '');
  assert.equal(git('ls-tree', '-r', '--name-only', first.tag).includes('.env'), false);
  assert.equal(git('ls-tree', '-r', '--name-only', second.tag).includes('outputs/'), false);
});

test('an already tracked credential blocks saving even if it is now ignored', t => {
  const { root, git } = fixture(t);
  writeFileSync(join(root, '.env'), 'PRIVATE=do-not-publish');
  git('add', '--force', '.env');
  const original = git('rev-parse', 'HEAD');
  assert.throws(() => saveVersion(root), /private file/);
  assert.equal(git('rev-parse', 'HEAD'), original);
  assert.equal(git('tag', '--list'), '');
});

test('a copied server key blocks saving without logging the value', t => {
  const { root, git } = fixture(t);
  const secret = 'test-only-private-key-01234567890123456789';
  mkdirSync(join(root, 'cloudbase'));
  writeFileSync(join(root, 'cloudbase', 'cloudbaserc.json'), JSON.stringify({
    functions: [{ envVariables: { FOCUS_MATRIX_WRITE_TOKEN: secret } }],
  }));
  writeFileSync(join(root, 'accidental-copy.txt'), secret);
  assert.throws(() => saveVersion(root), error => {
    assert.match(error.message, /server secret/);
    assert.equal(error.message.includes(secret), false);
    return true;
  });
  assert.equal(git('tag', '--list'), '');
});
