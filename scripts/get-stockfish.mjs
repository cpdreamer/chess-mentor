// Downloads the official Stockfish binary for this platform into server/bin/.
// Skips if Stockfish is already available (system install or previous download).
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const binDir = path.join(root, 'server', 'bin');
const isWin = process.platform === 'win32';
const target = path.join(binDir, isWin ? 'stockfish.exe' : 'stockfish');

const existing = [
  process.env.STOCKFISH_PATH,
  target,
  '/usr/games/stockfish',
  '/usr/local/bin/stockfish',
  '/usr/bin/stockfish',
].filter(Boolean);
for (const p of existing) {
  if (fs.existsSync(p)) {
    console.log(`Stockfish already available at ${p} — skipping download.`);
    process.exit(0);
  }
}

function assetName() {
  if (isWin) return 'stockfish-windows-x86-64-avx2.zip';
  if (process.platform === 'darwin')
    return process.arch === 'arm64'
      ? 'stockfish-macos-m1-apple-silicon.tar'
      : 'stockfish-macos-x86-64-avx2.tar';
  if (process.platform === 'linux')
    return process.arch === 'arm64'
      ? 'stockfish-android-armv8.tar'
      : 'stockfish-ubuntu-x86-64-avx2.tar';
  return null;
}

const asset = assetName();
if (!asset) {
  console.error(`Unsupported platform ${process.platform}. Install Stockfish manually and set STOCKFISH_PATH.`);
  process.exit(1);
}

const url = `https://github.com/official-stockfish/Stockfish/releases/latest/download/${asset}`;
console.log(`Downloading Stockfish: ${url}`);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stockfish-'));
const archive = path.join(tmp, asset);
try {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  fs.writeFileSync(archive, Buffer.from(await res.arrayBuffer()));

  // `tar` handles .tar everywhere and .zip on Windows (bsdtar ships with Windows 10+).
  execFileSync('tar', ['-xf', archive, '-C', tmp]);

  const findExe = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = findExe(p);
        if (found) return found;
      } else if (/^stockfish.*(\.exe)?$/i.test(entry.name) && !entry.name.endsWith('.zip') && !entry.name.endsWith('.tar')) {
        return p;
      }
    }
    return null;
  };
  const exe = findExe(tmp);
  if (!exe) throw new Error('Could not find the Stockfish executable in the downloaded archive.');

  fs.mkdirSync(binDir, { recursive: true });
  fs.copyFileSync(exe, target);
  if (!isWin) fs.chmodSync(target, 0o755);
  console.log(`Stockfish installed at ${target}`);
} catch (e) {
  console.error(`\nAutomatic Stockfish download failed: ${e.message}`);
  console.error('You can install it manually from https://stockfishchess.org/download/');
  console.error(`and either put the executable at ${target} or set STOCKFISH_PATH to it.`);
  process.exit(1);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
