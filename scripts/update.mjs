// Downloads the latest version of Chess Mentor from GitHub and applies it in place.
// Usage: npm run update
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const REPO_ZIP =
  process.env.CHESS_MENTOR_ZIP_URL ||
  'https://github.com/cpdreamer/chess-mentor/archive/refs/heads/main.zip';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Never overwrite these (local state / installed artifacts).
const SKIP = new Set(['node_modules', 'server/bin', '.git']);

console.log(`Downloading the latest version: ${REPO_ZIP}`);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chess-mentor-update-'));
try {
  const res = await fetch(REPO_ZIP, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const zip = path.join(tmp, 'update.zip');
  fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  try {
    // bsdtar (Windows 10+, macOS) extracts zips; GNU tar (Linux) does not.
    execFileSync('tar', ['-xf', zip, '-C', tmp], { stdio: 'pipe' });
  } catch {
    execFileSync('unzip', ['-oq', zip, '-d', tmp], { stdio: 'pipe' });
  }

  const extracted = fs
    .readdirSync(tmp, { withFileTypes: true })
    .find((e) => e.isDirectory() && e.name.startsWith('chess-mentor'));
  if (!extracted) throw new Error('Unexpected archive layout.');
  const src = path.join(tmp, extracted.name);

  const copy = (rel) => {
    if (SKIP.has(rel)) return;
    const from = path.join(src, rel);
    const to = path.join(root, rel);
    const stat = fs.statSync(from);
    if (stat.isDirectory()) {
      fs.mkdirSync(to, { recursive: true });
      for (const entry of fs.readdirSync(from)) copy(rel ? `${rel}/${entry}` : entry);
    } else {
      fs.copyFileSync(from, to);
    }
  };
  for (const entry of fs.readdirSync(src)) copy(entry);
  console.log('Files updated. Installing any new dependencies…');
} catch (e) {
  console.error(`Update failed: ${e.message}`);
  process.exit(1);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
