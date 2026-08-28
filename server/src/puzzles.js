import { Chess } from 'chess.js';

// Fetch a random puzzle from Lichess's free puzzle API and normalize it.
export async function fetchPuzzle(difficulty = 'normal', theme) {
  const params = new URLSearchParams();
  const valid = ['easiest', 'easier', 'normal', 'harder', 'hardest'];
  params.set('difficulty', valid.includes(difficulty) ? difficulty : 'normal');
  if (theme) params.set('angle', theme);
  const res = await fetch(`https://lichess.org/api/puzzle/next?${params}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Lichess puzzle API error ${res.status}`);
  const data = await res.json();

  const chess = new Chess();
  const sans = data.game.pgn.split(/\s+/).filter(Boolean);
  for (const san of sans) chess.move(san);
  const fen = chess.fen();

  // Solution is UCI moves from the puzzle position; convert to SAN too.
  const solver = new Chess(fen);
  const solutionSan = [];
  for (const uci of data.puzzle.solution) {
    const m = solver.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    if (!m) break;
    solutionSan.push(m.san);
  }

  return {
    id: data.puzzle.id,
    rating: data.puzzle.rating,
    themes: data.puzzle.themes,
    fen,
    sideToMove: chess.turn(),
    solutionUci: data.puzzle.solution,
    solutionSan,
    lastMoveSan: sans[sans.length - 1] || null,
    gameUrl: `https://lichess.org/training/${data.puzzle.id}`,
  };
}
