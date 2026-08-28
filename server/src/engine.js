import { spawn } from 'child_process';
import os from 'os';

const STOCKFISH_PATHS = [
  process.env.STOCKFISH_PATH,
  '/usr/games/stockfish',
  '/usr/local/bin/stockfish',
  '/usr/bin/stockfish',
  'stockfish',
].filter(Boolean);

export class Engine {
  constructor() {
    this.proc = null;
    this.buffer = '';
    this.pending = null;
    this.ready = this.start();
  }

  async start() {
    let lastErr;
    for (const path of STOCKFISH_PATHS) {
      try {
        this.proc = spawn(path);
        break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (!this.proc) throw lastErr || new Error('Stockfish not found');
    this.proc.on('error', (e) => {
      console.error('Stockfish process error:', e.message);
    });
    this.proc.stdout.setEncoding('utf8');
    this.proc.stdout.on('data', (d) => this.onData(d));
    this.send('uci');
    await this.waitFor((line) => line === 'uciok');
    const threads = Math.max(1, Math.min(4, os.cpus().length - 1));
    this.send(`setoption name Threads value ${threads}`);
    this.send('setoption name Hash value 128');
    this.send('isready');
    await this.waitFor((line) => line === 'readyok');
  }

  send(cmd) {
    this.proc.stdin.write(cmd + '\n');
  }

  onData(data) {
    this.buffer += data;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop();
    for (const raw of lines) {
      const line = raw.trim();
      if (this.pending) this.pending.onLine(line);
    }
  }

  waitFor(predicate) {
    return new Promise((resolve) => {
      const lines = [];
      this.pending = {
        onLine: (line) => {
          lines.push(line);
          if (predicate(line)) {
            this.pending = null;
            resolve(lines);
          }
        },
      };
    });
  }

  // Analyze a FEN. Returns { bestMove, lines: [{ multipv, moves, scoreCp, scoreMate, depth }] }
  async analyze(fen, { depth = 14, multiPv = 1, movetime } = {}) {
    await this.ready;
    this.send(`setoption name MultiPV value ${multiPv}`);
    this.send('ucinewgame');
    this.send(`position fen ${fen}`);
    this.send(movetime ? `go movetime ${movetime}` : `go depth ${depth}`);
    const lines = await this.waitFor((l) => l.startsWith('bestmove'));
    const infos = new Map();
    for (const line of lines) {
      if (!line.startsWith('info ') || !line.includes(' pv ')) continue;
      const info = parseInfo(line);
      if (info) infos.set(info.multipv, info);
    }
    const bestLine = lines[lines.length - 1];
    const bestMove = bestLine.split(/\s+/)[1];
    return {
      bestMove: bestMove === '(none)' ? null : bestMove,
      lines: [...infos.values()].sort((a, b) => a.multipv - b.multipv),
    };
  }

  quit() {
    try {
      this.send('quit');
      this.proc.kill();
    } catch {
      /* already dead */
    }
  }
}

function parseInfo(line) {
  const tokens = line.split(/\s+/);
  const get = (key) => {
    const i = tokens.indexOf(key);
    return i >= 0 ? tokens[i + 1] : null;
  };
  const pvIdx = tokens.indexOf('pv');
  if (pvIdx < 0) return null;
  const scoreIdx = tokens.indexOf('score');
  let scoreCp = null;
  let scoreMate = null;
  if (scoreIdx >= 0) {
    if (tokens[scoreIdx + 1] === 'cp') scoreCp = parseInt(tokens[scoreIdx + 2], 10);
    else if (tokens[scoreIdx + 1] === 'mate') scoreMate = parseInt(tokens[scoreIdx + 2], 10);
  }
  return {
    multipv: parseInt(get('multipv') || '1', 10),
    depth: parseInt(get('depth') || '0', 10),
    scoreCp,
    scoreMate,
    moves: tokens.slice(pvIdx + 1),
  };
}

// Simple engine pool so parallel requests don't collide.
const pool = [];
let poolSize = 0;
const MAX_ENGINES = 2;
const waiters = [];

export async function withEngine(fn) {
  let engine;
  if (pool.length > 0) {
    engine = pool.pop();
  } else if (poolSize < MAX_ENGINES) {
    poolSize++;
    engine = new Engine();
  } else {
    engine = await new Promise((resolve) => waiters.push(resolve));
  }
  try {
    return await fn(engine);
  } finally {
    const waiter = waiters.shift();
    if (waiter) waiter(engine);
    else pool.push(engine);
  }
}
