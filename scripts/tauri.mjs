import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const cargoHome = join(root, '.cargo');
const rustupHome = join(root, '.rustup');
const env = { ...process.env };
if (existsSync(join(cargoHome, 'bin', 'cargo.exe'))) {
  env.CARGO_HOME = cargoHome;
  env.RUSTUP_HOME = rustupHome;
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'Path';
  env[pathKey] = `${join(cargoHome, 'bin')};${env[pathKey] ?? ''}`;
}

const cli = join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], { env, stdio: 'inherit' });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
