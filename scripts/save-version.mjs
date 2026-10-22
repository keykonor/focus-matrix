import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

export function saveVersion(repository, description = 'Manual source snapshot') {
  const git = (...args) => execFileSync('git', ['-C', repository, ...args], {
    encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // Windows runners may expose TEMP via an 8.3 path or a directory junction.
  // Compare actual directories while still rejecting a nested parent repository.
  const canonicalPath = path => {
    const resolved = realpathSync.native(resolve(path));
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  if (canonicalPath(git('rev-parse', '--show-toplevel').trim()) !== canonicalPath(repository)) {
    throw new Error('The project must have its own Git repository.');
  }
  // Check tracked files too: .gitignore does not protect an already tracked secret.
  const files = git('ls-files', '--cached', '--others', '--exclude-standard', '-z')
    .split('\0').filter(Boolean);
  const sensitive = /(^|\/)(?:\.env(?:$|\.(?!example$))|\.dev\.vars|\.cloud-config|signing\/|backups\/|\.cloud-tools\/|\.edgeone\/)|\.(?:jks|keystore|p12|pfx|dpapi)$|^cloudbase\/cloudbaserc\.json$/i;
  for (const file of files) {
    if (sensitive.test(file)) throw new Error(`Source snapshot refused a private file: ${file}`);
  }
  // Also reject copies of the locally configured server secrets in source files.
  const configPath = join(repository, 'cloudbase', 'cloudbaserc.json');
  if (existsSync(configPath)) {
    const config = JSON.parse(readFileSync(configPath, 'utf8').replace(/^\uFEFF/, ''));
    const secrets = (config.functions ?? []).flatMap(fn => {
      const env = fn.envVariables ?? {};
      return ['CLOUDBASE_API_KEY', 'FOCUS_MATRIX_WRITE_TOKEN']
        .map(key => env[key]).filter(value => typeof value === 'string' && value.length >= 24);
    });
    for (const file of files) {
      const path = join(repository, file);
      if (!existsSync(path)) continue; // A staged deletion is legitimate.
      const content = readFileSync(path);
      if (secrets.some(secret => content.includes(Buffer.from(secret)))) {
        throw new Error(`Source snapshot refused a server secret in: ${file}`);
      }
    }
  }
  git('add', '--all');
  if (git('diff', '--cached', '--name-only').trim()) {
    git('commit', '-m', `snapshot: ${description}`);
  }
  const commit = git('rev-parse', '--verify', 'HEAD').trim();
  const createdAt = new Date().toISOString();
  const stamp = createdAt.replace(/[-:]/g, '').replace('T', '-').replace('.', '-');
  const tag = `versions/${stamp}-${randomUUID().slice(0, 8)}`;
  const directory = join(repository, 'outputs', 'source-versions', tag.slice('versions/'.length));
  mkdirSync(directory, { recursive: true });
  // Never use --force: each saved tag and archive is permanent and unique.
  git('tag', '-a', tag, commit, '-m', description);
  const archive = join(directory, 'source.zip');
  git('archive', '--format=zip', `--output=${archive}`, tag);
  const sha256 = createHash('sha256').update(readFileSync(archive)).digest('hex');
  const manifest = { formatVersion: 1, tag, commit, createdAt, description,
    archive: 'source.zip', sha256, scope: 'Source only; user data and credentials are excluded.' };
  writeFileSync(join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  return { ...manifest, directory };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === '--list') {
      const output = execFileSync('git', ['-C', root, 'tag', '--list', 'versions/*',
        '--sort=refname', '--format=%(refname:short)  %(subject)'], { encoding: 'utf8', windowsHide: true });
      process.stdout.write(output || 'No saved source versions yet.\n');
    } else {
      const saved = saveVersion(root, process.argv.slice(2).join(' ') || 'Manual source snapshot');
      console.log(`version=${saved.tag}\ncommit=${saved.commit}\narchive=${saved.directory}`);
    }
  } catch (error) {
    // Do not forward Git stderr, which could include a hook's private output.
    console.error(error instanceof Error && !('stderr' in error) ? error.message : 'Git source version save failed. Update stopped.');
    process.exitCode = 1;
  }
}
