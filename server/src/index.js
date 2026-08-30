import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { Chess } from 'chess.js';
import { analyzeGame, winPercent, pvToSan } from './analyze.js';
import { withEngine } from './engine.js';
import { fetchRecentGames } from './chesscom.js';
import { getSettings, saveSettings, maskedSettings } from './settings.js';
import {
  reviewGame,
  explainMove,
  chatAboutPosition,
  explainAiMove,
  ruleBasedReview,
  ruleBasedComment,
  llmAvailable,
  LlmError,
} from './coach.js';
import { fetchPuzzle } from './puzzles.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '2mb' }));

const asyncRoute = (fn) => (req, res) =>
  fn(req, res).catch((e) => {
    const status = e instanceof LlmError ? 502 : 500;
    res.status(status).json({ error: e.message });
  });

// ---------- Settings ----------
app.get('/api/settings', (req, res) => res.json(maskedSettings()));
app.post('/api/settings', (req, res) => {
  const allowed = [
    'provider',
    'geminiApiKey',
    'geminiModel',
    'groqApiKey',
    'groqModel',
    'openaiApiKey',
    'openaiModel',
    'openaiBaseUrl',
    'chesscomUsername',
    'analysisDepth',
  ];
  const partial = {};
  for (const k of allowed) {
    if (req.body[k] !== undefined && req.body[k] !== null) partial[k] = req.body[k];
  }
  // Don't overwrite stored keys with the masked placeholder.
  for (const k of ['geminiApiKey', 'groqApiKey', 'openaiApiKey']) {
    if (typeof partial[k] === 'string' && partial[k].includes('...')) delete partial[k];
  }
  saveSettings(partial);
  res.json(maskedSettings());
});

// ---------- chess.com ----------
app.get(
  '/api/chesscom/:username/games',
  asyncRoute(async (req, res) => {
    const months = Math.min(12, parseInt(req.query.months || '2', 10));
    const games = await fetchRecentGames(req.params.username, { months });
    res.json({ games: games.map(({ pgn, ...rest }, i) => ({ ...rest, id: i })), pgns: games.map((g) => g.pgn) });
  })
);

// ---------- Analysis (streams ndjson progress) ----------
app.post(
  '/api/analyze',
  asyncRoute(async (req, res) => {
    const { pgn } = req.body;
    if (!pgn) return res.status(400).json({ error: 'pgn is required' });
    const depth = getSettings().analysisDepth || 14;
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    const write = (obj) => res.write(JSON.stringify(obj) + '\n');
    try {
      const analysis = await analyzeGame(pgn, {
        depth,
        onProgress: (current, total) => write({ type: 'progress', current, total }),
      });
      write({ type: 'analysis', analysis });
      // AI commentary pass.
      let review;
      if (llmAvailable()) {
        try {
          review = await reviewGame(analysis, req.body.focusColor || null);
        } catch (e) {
          review = { ...ruleBasedReview(analysis), llmError: e.message };
        }
      } else {
        review = ruleBasedReview(analysis);
      }
      write({ type: 'review', review });
    } catch (e) {
      write({ type: 'error', error: e.message });
    }
    res.end();
  })
);

// ---------- Position eval (eval bar / play mode) ----------
app.post(
  '/api/eval',
  asyncRoute(async (req, res) => {
    const { fen, depth = 12 } = req.body;
    const chess = new Chess(fen);
    if (chess.isGameOver()) {
      const cp = chess.isCheckmate() ? (chess.turn() === 'w' ? -10000 : 10000) : 0;
      return res.json({ cp, winPercent: winPercent(cp), bestMove: null, gameOver: true });
    }
    const result = await withEngine((e) => e.analyze(fen, { depth: Math.min(depth, 18) }));
    const line = result.lines[0];
    const whiteToMove = fen.split(' ')[1] === 'w';
    let cp;
    if (line?.scoreMate != null) cp = (line.scoreMate > 0 ? 1 : -1) * (10000 - Math.abs(line.scoreMate));
    else cp = line?.scoreCp ?? 0;
    if (!whiteToMove) cp = -cp;
    res.json({ cp, winPercent: winPercent(cp), bestMove: result.bestMove, mate: line?.scoreMate ?? null });
  })
);

// ---------- Explain a reviewed move (deeper dive) ----------
app.post(
  '/api/explain',
  asyncRoute(async (req, res) => {
    const { move, question, history, movesSoFar } = req.body;
    if (!move) return res.status(400).json({ error: 'move is required' });
    if (!llmAvailable()) return res.json({ text: ruleBasedComment(move), ruleBased: true });
    const text = await explainMove(move, question, history, movesSoFar);
    res.json({ text });
  })
);

// ---------- Chat about a position ----------
app.post(
  '/api/chat',
  asyncRoute(async (req, res) => {
    const { fen, question, history, movesSoFar } = req.body;
    if (!fen || !question) return res.status(400).json({ error: 'fen and question are required' });
    if (!llmAvailable())
      return res
        .status(400)
        .json({ error: 'Chat needs an AI provider. Add a free Gemini API key in Settings.' });
    const result = await withEngine((e) => e.analyze(fen, { depth: 14, multiPv: 2 }));
    const summary = result.lines
      .map((l) => {
        const score = l.scoreMate != null ? `mate in ${l.scoreMate}` : `${(l.scoreCp / 100).toFixed(1)} (side to move)`;
        return `${pvToSan(fen, l.moves).join(' ')} (${score})`;
      })
      .join(' | ');
    const text = await chatAboutPosition({ fen, engineSummary: summary || 'game over', history, question, movesSoFar });
    res.json({ text });
  })
);

// ---------- Play vs AI ----------
const LEVELS = {
  1: { movetime: 60, skill: 1 },
  2: { movetime: 120, skill: 4 },
  3: { movetime: 250, skill: 8 },
  4: { movetime: 500, skill: 13 },
  5: { movetime: 1000, skill: 20 },
};

app.post(
  '/api/play/move',
  asyncRoute(async (req, res) => {
    const { fen, level = 3, explain = true, playerLastSan } = req.body;
    const chess = new Chess(fen);
    if (chess.isGameOver()) return res.json({ gameOver: true });
    const cfg = LEVELS[level] || LEVELS[3];
    const result = await withEngine(async (e) => {
      await e.ready;
      e.send(`setoption name Skill Level value ${cfg.skill}`);
      const r = await e.analyze(fen, { movetime: cfg.movetime });
      e.send('setoption name Skill Level value 20');
      return r;
    });
    if (!result.bestMove) return res.json({ gameOver: true });
    const move = chess.move({
      from: result.bestMove.slice(0, 2),
      to: result.bestMove.slice(2, 4),
      promotion: result.bestMove[4],
    });
    const line = result.lines[0];
    let cpAfter = line?.scoreMate != null ? (line.scoreMate > 0 ? 9990 : -9990) : (line?.scoreCp ?? 0);
    if (fen.split(' ')[1] === 'b') cpAfter = -cpAfter;

    let explanation = null;
    if (explain && llmAvailable()) {
      try {
        const replaySan = [];
        const c2 = new Chess(fen);
        for (const uci of line?.moves?.slice(0, 6) || []) {
          const m = c2.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
          if (!m) break;
          replaySan.push(m.san);
        }
        explanation = await explainAiMove({
          fenBefore: fen,
          moveSan: move.san,
          evalAfterCp: cpAfter,
          bestLineSan: replaySan,
          playerLastSan,
        });
      } catch {
        explanation = null;
      }
    }
    res.json({
      move: { san: move.san, uci: result.bestMove, from: move.from, to: move.to },
      fen: chess.fen(),
      cp: cpAfter,
      winPercent: winPercent(cpAfter),
      explanation,
      gameOver: chess.isGameOver(),
    });
  })
);

// ---------- Puzzles ----------
app.get(
  '/api/puzzle',
  asyncRoute(async (req, res) => {
    const puzzle = await fetchPuzzle(req.query.difficulty, req.query.theme);
    res.json(puzzle);
  })
);

// ---------- Static client (production build) ----------
const clientDist = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get(/^(?!\/api\/).*/, (req, res, next) => {
  res.sendFile(path.join(clientDist, 'index.html'), (err) => err && next());
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Chess Mentor server on http://localhost:${PORT}`));
