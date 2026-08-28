import { Chess } from 'chess.js';
import { chat, extractJson, llmAvailable, LlmError } from './llm.js';

const PIECE_NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

// Plain-English description of the position so the model doesn't have to
// decode FEN itself (LLMs frequently misread FEN strings).
export function describePosition(fen) {
  try {
    const game = new Chess(fen);
    const pieces = { w: [], b: [] };
    for (const row of game.board()) {
      for (const sq of row) {
        if (sq) pieces[sq.color].push(`${PIECE_NAMES[sq.type]} on ${sq.square}`);
      }
    }
    const lines = [
      `White pieces: ${pieces.w.join(', ')}.`,
      `Black pieces: ${pieces.b.join(', ')}.`,
      `${game.turn() === 'w' ? 'White' : 'Black'} to move.`,
    ];
    if (game.inCheck()) lines.push(`${game.turn() === 'w' ? 'White' : 'Black'} is in check.`);
    const legal = game.moves();
    lines.push(`Legal moves: ${legal.join(', ')}.`);
    return lines.join('\n');
  } catch {
    return '';
  }
}

const evalStr = (cp) => {
  if (Math.abs(cp) >= 9000) {
    const mateIn = 10000 - Math.abs(cp);
    return cp > 0 ? `M${mateIn} for White` : `M${mateIn} for Black`;
  }
  return (cp >= 0 ? '+' : '') + (cp / 100).toFixed(1);
};

function moveDigest(m) {
  const parts = [
    `${m.moveNumber}${m.color === 'w' ? '.' : '...'} ${m.san}`,
    `[${m.judgment}]`,
    `eval ${evalStr(m.cpBefore)} -> ${evalStr(m.cpAfter)}`,
  ];
  if (m.judgment !== 'best' && m.judgment !== 'great' && m.bestMoveSan) {
    parts.push(`best was ${m.bestMoveSan}` + (m.bestLineSan.length ? ` (line: ${m.bestLineSan.join(' ')})` : ''));
  }
  return parts.join(' | ');
}

const COACH_SYSTEM = `You are a friendly, insightful chess coach. You explain chess ideas the way a strong human coach would: in terms of plans, piece activity, king safety, pawn structure, tactics, and typical patterns. You never just say a move is good or bad — you always explain WHY, what the idea behind it is, what it threatens or allows, and what the player should learn. Keep explanations concrete: mention squares, pieces, and short variations in SAN when they help. Write for an improving club player. Be encouraging but honest.`;

// Full-game review: one batched LLM call producing per-move comments + summary.
export async function reviewGame(analysis, focusColor) {
  const { header, moves, accuracy, counts } = analysis;
  const meta = `White: ${header.White || '?'} (${header.WhiteElo || '?'}), Black: ${header.Black || '?'} (${header.BlackElo || '?'}), Result: ${header.Result || '?'}. Accuracy: White ${accuracy.white}%, Black ${accuracy.black}%.`;
  const digest = moves.map(moveDigest).join('\n');
  const focus = focusColor
    ? `The user played ${focusColor === 'w' ? 'White' : 'Black'}; address them as "you" for their moves and refer to the opponent in third person.`
    : 'Address both players neutrally.';

  const keyPlies = moves
    .filter((m) => ['blunder', 'mistake', 'inaccuracy', 'great'].includes(m.judgment))
    .map((m) => m.ply);
  const commentPlies = new Set(keyPlies);
  // Also comment every few moves so quiet phases get narrative too.
  for (let p = 1; p <= moves.length; p += 4) commentPlies.add(p);

  const prompt = `Review this chess game.

${meta}
${focus}

Move-by-move engine analysis (judgment, eval before -> after, and the engine's best move when the played move wasn't best):
${digest}

Respond with JSON only, in this exact shape:
{
  "summary": "3-6 sentence narrative of how the game went: opening, key turning points, and the main lessons",
  "lessons": ["short actionable takeaway", "..."] (2-4 items),
  "comments": { "<ply number>": "explanation for that move", ... }
}

Comment on at least these plies: ${[...commentPlies].sort((a, b) => a - b).join(', ')}.
For every blunder/mistake/inaccuracy: explain WHY it was bad (what it allows or misses, with a concrete line), and explain the idea behind the better move — the intuition a strong player would use to find it.
For great/best moves at key moments: explain the idea that makes them strong.
2-4 sentences per comment. Use SAN notation.`;

  const text = await chat(
    [
      { role: 'system', content: COACH_SYSTEM },
      { role: 'user', content: prompt },
    ],
    { json: true }
  );
  const parsed = extractJson(text);
  return {
    summary: parsed.summary || '',
    lessons: Array.isArray(parsed.lessons) ? parsed.lessons : [],
    comments: parsed.comments || {},
  };
}

// Explain a single move / position in depth.
export async function explainMove(move, question, history) {
  const context = `Position (FEN before the move): ${move.fenBefore}
${describePosition(move.fenBefore)}
Move played: ${move.san} (judged: ${move.judgment})
Eval: ${evalStr(move.cpBefore)} -> ${evalStr(move.cpAfter)}
Engine's best move: ${move.bestMoveSan || 'n/a'}${move.bestLineSan?.length ? `, best line: ${move.bestLineSan.join(' ')}` : ''}${move.secondLineSan?.length ? `\nSecond-best line: ${move.secondLineSan.join(' ')}` : ''}`;

  const messages = [
    { role: 'system', content: COACH_SYSTEM },
    {
      role: 'user',
      content: `${context}\n\nExplain this move: why it is ${move.judgment === 'best' || move.judgment === 'great' ? 'strong' : move.judgment === 'blunder' || move.judgment === 'mistake' ? 'bad' : 'questionable or fine'}, what it does or misses, and the intuition behind the engine's preference. Be concrete but concise (4-8 sentences).`,
    },
  ];
  if (history?.length) {
    messages.push({ role: 'assistant', content: history[0] });
    for (let i = 1; i < history.length; i++) {
      messages.push({ role: i % 2 === 1 ? 'user' : 'assistant', content: history[i] });
    }
  }
  if (question) messages.push({ role: 'user', content: question });
  return chat(messages);
}

// Free-form chat about a position (used in review chat + play mode chat).
export async function chatAboutPosition({ fen, engineSummary, history = [], question }) {
  const messages = [
    { role: 'system', content: COACH_SYSTEM },
    {
      role: 'user',
      content: `We are discussing this chess position (FEN): ${fen}\n${describePosition(fen)}\nEngine analysis: ${engineSummary}\n\nBase everything you say strictly on the piece placement and legal moves listed above — never assume a piece is on a square not listed. Answer my questions about this position concisely and concretely. Earlier messages in our conversation may refer to previous positions in the same game — the position above is the current one.`,
    },
    { role: 'assistant', content: 'Sure — ask me anything about this position.' },
  ];
  for (const h of history) messages.push({ role: h.role, content: h.content });
  messages.push({ role: 'user', content: question });
  return chat(messages);
}

// Explain the AI's own move in play mode.
export async function explainAiMove({ fenBefore, moveSan, evalAfterCp, bestLineSan, playerLastSan }) {
  const prompt = `You are playing a friendly training game. ${playerLastSan ? `Your opponent (the student) just played ${playerLastSan}. ` : ''}In this position (FEN): ${fenBefore}, you played ${moveSan}.
${describePosition(fenBefore)} Engine eval after your move: ${evalStr(evalAfterCp)}. Your planned follow-up line: ${bestLineSan?.join(' ') || 'n/a'}.

In 2-4 sentences, explain to your opponent the intuition behind ${moveSan}: what it aims for (development, a threat, a positional idea), and what you're watching in their position. Speak directly to them, like a sparring coach.`;
  return chat([
    { role: 'system', content: COACH_SYSTEM },
    { role: 'user', content: prompt },
  ]);
}

// ---------- Rule-based fallback (no API key needed) ----------

const JUDGMENT_TEXT = {
  great: 'A great find — this was essentially the only strong move in the position.',
  best: 'This matches the engine\u2019s top choice.',
  excellent: 'An excellent move, keeping the evaluation steady.',
  good: 'A solid, reasonable move.',
  inaccuracy: 'An inaccuracy — a stronger option was available.',
  mistake: 'A mistake that concedes a significant part of your advantage (or worsens your position).',
  blunder: 'A blunder — this move seriously damages your position.',
};

export function ruleBasedComment(m) {
  let text = JUDGMENT_TEXT[m.judgment] || '';
  const swing = Math.abs(m.cpAfter - m.cpBefore);
  if (['inaccuracy', 'mistake', 'blunder'].includes(m.judgment)) {
    if (m.bestMoveSan) {
      text += ` The engine prefers ${m.bestMoveSan}`;
      if (m.bestLineSan?.length > 1) text += `, with the idea ${m.bestLineSan.join(' ')}`;
      text += '.';
    }
    text += ` The evaluation moved from ${evalStr(m.cpBefore)} to ${evalStr(m.cpAfter)} (a swing of about ${(swing / 100).toFixed(1)} pawns).`;
    text +=
      ' Add a Gemini or OpenAI API key in Settings to get a full explanation of why, and the intuition behind the better move.';
  } else if (m.judgment === 'great' || m.judgment === 'best') {
    if (m.bestLineSan?.length > 1) text += ` The main line continues ${m.bestLineSan.join(' ')}.`;
  }
  return text;
}

export function ruleBasedReview(analysis) {
  const comments = {};
  for (const m of analysis.moves) {
    if (['blunder', 'mistake', 'inaccuracy', 'great'].includes(m.judgment)) {
      comments[m.ply] = ruleBasedComment(m);
    }
  }
  const { accuracy, counts } = analysis;
  const c = (side) =>
    `${counts[side].blunder || 0} blunders, ${counts[side].mistake || 0} mistakes, ${counts[side].inaccuracy || 0} inaccuracies`;
  return {
    summary: `White played at ${accuracy.white}% accuracy (${c('white')}); Black at ${accuracy.black}% accuracy (${c('black')}). Add a free Gemini API key in Settings to unlock full AI coaching: narrative summaries, per-move explanations, and chat.`,
    lessons: [],
    comments,
    ruleBased: true,
  };
}

export { llmAvailable, LlmError };
