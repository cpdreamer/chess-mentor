import { Chess } from 'chess.js';
import { withEngine } from './engine.js';

// Convert an engine score (from the side-to-move perspective) to White's perspective centipawns.
function toWhiteCp(scoreCp, scoreMate, whiteToMove) {
  let cp;
  if (scoreMate !== null && scoreMate !== undefined) {
    cp = scoreMate > 0 ? 10000 - Math.abs(scoreMate) : -10000 + Math.abs(scoreMate);
  } else {
    cp = scoreCp ?? 0;
  }
  return whiteToMove ? cp : -cp;
}

// Lichess-style win percentage from White-perspective centipawns.
export function winPercent(cp) {
  const clamped = Math.max(-1000, Math.min(1000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * clamped)) - 1);
}

function classify(wpBefore, wpAfter, isWhite, playedBest, isOnlyGoodMove) {
  // Win% from the mover's perspective.
  const before = isWhite ? wpBefore : 100 - wpBefore;
  const after = isWhite ? wpAfter : 100 - wpAfter;
  const drop = before - after;
  if (playedBest && isOnlyGoodMove && before > 30) return 'great';
  if (playedBest) return 'best';
  if (drop < 2) return 'excellent';
  if (drop < 5) return 'good';
  if (drop < 10) return 'inaccuracy';
  if (drop < 20) return 'mistake';
  return 'blunder';
}

export function accuracyFromWinPercents(drops) {
  if (drops.length === 0) return 100;
  const accs = drops.map((d) => {
    const a = 103.1668 * Math.exp(-0.04354 * Math.max(0, d)) - 3.1669;
    return Math.max(0, Math.min(100, a + 1));
  });
  return accs.reduce((s, a) => s + a, 0) / accs.length;
}

function uciToSan(fen, uci) {
  try {
    const c = new Chess(fen);
    const move = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    return move ? move.san : uci;
  } catch {
    return uci;
  }
}

export function pvToSan(fen, pv, maxLen = 6) {
  const c = new Chess(fen);
  const sans = [];
  for (const uci of pv.slice(0, maxLen)) {
    try {
      const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      if (!m) break;
      sans.push(m.san);
    } catch {
      break;
    }
  }
  return sans;
}

// Analyze a full game. onProgress(current, total) is optional.
export async function analyzeGame(pgn, { depth = 14, onProgress } = {}) {
  const game = new Chess();
  game.loadPgn(pgn);
  const header = game.header();
  const moves = game.history({ verbose: true });
  if (moves.length === 0) throw new Error('No moves found in PGN');

  return withEngine(async (engine) => {
    // Evaluate every position (initial + after each move) with MultiPV 2.
    const positions = [new Chess().fen()];
    {
      const replay = new Chess();
      for (const m of moves) {
        replay.move(m.san);
        positions.push(replay.fen());
      }
    }

    const evals = [];
    for (let i = 0; i < positions.length; i++) {
      const fen = positions[i];
      const chess = new Chess(fen);
      let result;
      if (chess.isGameOver()) {
        result = { bestMove: null, lines: [], terminal: true, fen };
      } else {
        const r = await engine.analyze(fen, { depth, multiPv: 2 });
        result = { ...r, fen };
      }
      evals.push(result);
      if (onProgress) onProgress(i + 1, positions.length);
    }

    const analyzedMoves = [];
    const whiteDrops = [];
    const blackDrops = [];

    for (let i = 0; i < moves.length; i++) {
      const move = moves[i];
      const isWhite = move.color === 'w';
      const evalBefore = evals[i];
      const evalAfter = evals[i + 1];
      const fenBefore = positions[i];

      const bestLine = evalBefore.lines[0];
      const secondLine = evalBefore.lines[1];
      const cpBefore = bestLine
        ? toWhiteCp(bestLine.scoreCp, bestLine.scoreMate, isWhite)
        : 0;
      const afterLine = evalAfter.lines[0];
      let cpAfter;
      if (evalAfter.terminal) {
        const c = new Chess(evalAfter.fen);
        if (c.isCheckmate()) cpAfter = isWhite ? 10000 : -10000;
        else cpAfter = 0; // draw
      } else {
        cpAfter = afterLine ? toWhiteCp(afterLine.scoreCp, afterLine.scoreMate, !isWhite) : 0;
      }

      const wpBefore = winPercent(cpBefore);
      const wpAfter = winPercent(cpAfter);
      const moverDrop = isWhite ? wpBefore - wpAfter : wpAfter - wpBefore;
      (isWhite ? whiteDrops : blackDrops).push(Math.max(0, moverDrop));

      const playedUci = move.from + move.to + (move.promotion || '');
      const bestUci = evalBefore.bestMove;
      const playedBest = playedUci === bestUci;
      let isOnlyGoodMove = false;
      if (bestLine && secondLine) {
        const bestCp = toWhiteCp(bestLine.scoreCp, bestLine.scoreMate, isWhite);
        const secondCp = toWhiteCp(secondLine.scoreCp, secondLine.scoreMate, isWhite);
        const gap = isWhite ? bestCp - secondCp : secondCp - bestCp;
        isOnlyGoodMove = gap > 150;
      }

      const judgment = classify(wpBefore, wpAfter, isWhite, playedBest, isOnlyGoodMove);

      analyzedMoves.push({
        ply: i + 1,
        moveNumber: Math.floor(i / 2) + 1,
        color: move.color,
        san: move.san,
        uci: playedUci,
        fenBefore,
        fenAfter: positions[i + 1],
        cpBefore,
        cpAfter,
        winPercentBefore: wpBefore,
        winPercentAfter: wpAfter,
        judgment,
        bestMoveUci: bestUci,
        bestMoveSan: bestUci ? uciToSan(fenBefore, bestUci) : null,
        bestLineSan: bestLine ? pvToSan(fenBefore, bestLine.moves) : [],
        secondLineSan: secondLine ? pvToSan(fenBefore, secondLine.moves) : [],
      });
    }

    const summaryCounts = (color) => {
      const counts = {};
      for (const m of analyzedMoves) {
        if (m.color !== color) continue;
        counts[m.judgment] = (counts[m.judgment] || 0) + 1;
      }
      return counts;
    };

    return {
      header,
      moves: analyzedMoves,
      accuracy: {
        white: Math.round(accuracyFromWinPercents(whiteDrops) * 10) / 10,
        black: Math.round(accuracyFromWinPercents(blackDrops) * 10) / 10,
      },
      counts: { white: summaryCounts('w'), black: summaryCounts('b') },
    };
  });
}
