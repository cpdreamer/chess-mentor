import { useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { api } from '../api.js';
import CoachChat from '../components/CoachChat.jsx';

export default function Puzzles() {
  const [puzzle, setPuzzle] = useState(null);
  const [difficulty, setDifficulty] = useState('normal');
  const gameRef = useRef(null);
  const [fen, setFen] = useState(null);
  const [stepIdx, setStepIdx] = useState(0); // index into solutionUci
  const [state, setState] = useState('loading'); // loading | solving | solved | failed
  const [feedback, setFeedback] = useState(null);
  const [explanation, setExplanation] = useState(null);
  const [explaining, setExplaining] = useState(false);
  const [error, setError] = useState(null);
  const [showChat, setShowChat] = useState(false);

  const load = async (diff = difficulty) => {
    setState('loading');
    setError(null);
    setExplanation(null);
    setFeedback(null);
    setShowChat(false);
    try {
      const p = await api.get(`/api/puzzle?difficulty=${diff}`);
      setPuzzle(p);
      gameRef.current = new Chess(p.fen);
      setFen(p.fen);
      setStepIdx(0);
      setState('solving');
    } catch (e) {
      setError(e.message);
      setState('failed');
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial puzzle fetch
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const playOpponentReply = (game, idx) => {
    const reply = puzzle.solutionUci[idx];
    if (!reply) return idx;
    game.move({ from: reply.slice(0, 2), to: reply.slice(2, 4), promotion: reply[4] });
    setFen(game.fen());
    return idx + 1;
  };

  const onPieceDrop = ({ sourceSquare, targetSquare }) => {
    if (state !== 'solving') return false;
    const game = gameRef.current;
    const expected = puzzle.solutionUci[stepIdx];
    let move;
    try {
      move = game.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });
    } catch {
      return false;
    }
    if (!move) return false;
    const played = sourceSquare + targetSquare + (move.promotion || '');
    const isMate = game.isCheckmate();
    if (played !== expected && !isMate) {
      game.undo();
      setFen(game.fen());
      setFeedback({ kind: 'wrong', san: move.san });
      return false;
    }
    setFen(game.fen());
    setFeedback({ kind: 'right', san: move.san });
    let next = stepIdx + 1;
    if (next >= puzzle.solutionUci.length || isMate) {
      setState('solved');
      setFeedback({ kind: 'solved' });
    } else {
      next = playOpponentReply(game, next);
      setStepIdx(next);
      if (next >= puzzle.solutionUci.length) {
        setState('solved');
        setFeedback({ kind: 'solved' });
      }
    }
    return true;
  };

  const explain = async (question) => {
    if (!puzzle || explaining) return;
    setExplaining(true);
    try {
      const { text } = await api.post('/api/chat', {
        fen: puzzle.fen,
        question,
        history: [],
      });
      setExplanation(text);
    } catch (e) {
      setExplanation(`(${e.message})`);
    } finally {
      setExplaining(false);
    }
  };

  const explainSolution = () =>
    explain(
      `This is a tactics puzzle (themes: ${puzzle.themes.join(', ')}). The solution is ${puzzle.solutionSan.join(' ')}. Explain the key idea and the intuition for finding the first move, step by step.`
    );

  const explainWrong = () =>
    explain(
      `In this tactics puzzle the correct first move for the side to move is ${puzzle.solutionSan[stepIdx] || puzzle.solutionSan[0]}, but I tried ${feedback?.san}. Explain concretely why my move ${feedback?.san} fails and what I should have noticed.`
    );

  const giveUp = () => {
    const game = gameRef.current;
    for (let i = stepIdx; i < puzzle.solutionUci.length; i++) {
      const uci = puzzle.solutionUci[i];
      try {
        game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      } catch {
        break;
      }
    }
    setFen(game.fen());
    setState('solved');
    setFeedback({ kind: 'revealed' });
  };

  const orientation = puzzle?.sideToMove === 'b' ? 'black' : 'white';

  return (
    <div className="page review-page">
      <div className="review-left">
        {fen && (
          <div className="board-wrap">
            <Chessboard
              options={{
                position: fen,
                boardOrientation: orientation,
                onPieceDrop,
                allowDragging: state === 'solving',
                id: 'puzzle-board',
              }}
            />
          </div>
        )}
        <div className="board-controls">
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
            <option value="easiest">Easiest</option>
            <option value="easier">Easier</option>
            <option value="normal">Normal</option>
            <option value="harder">Harder</option>
            <option value="hardest">Hardest</option>
          </select>
          <button onClick={() => load()}>{state === 'loading' ? 'Loading…' : 'Next puzzle'}</button>
          {state === 'solving' && (
            <button className="small" onClick={giveUp}>
              Show solution
            </button>
          )}
        </div>
      </div>

      <div className="review-right">
        {error && <p className="error">{error}</p>}
        {puzzle && (
          <div className="card">
            <h3>
              Puzzle {puzzle.id} <span className="muted">(rating {puzzle.rating})</span>
            </h3>
            <p className="muted">
              {orientation === 'white' ? 'White' : 'Black'} to move.
              {puzzle.lastMoveSan && <> Opponent just played {puzzle.lastMoveSan}.</>}
            </p>
            {feedback?.kind === 'wrong' && (
              <p className="error">
                {feedback.san} isn't it — try again.{' '}
                <button className="small" onClick={explainWrong} disabled={explaining}>
                  {explaining ? 'Thinking…' : 'Why is it wrong?'}
                </button>
              </p>
            )}
            {feedback?.kind === 'right' && state === 'solving' && <p className="status">Correct! Keep going…</p>}
            {state === 'solved' && (
              <>
                <p className="status">
                  {feedback?.kind === 'revealed' ? 'Solution: ' : 'Solved! 🎉 '}
                  {puzzle.solutionSan.join(' ')}
                </p>
                <p className="muted">Themes: {puzzle.themes.join(', ')}</p>
                <button className="small" onClick={explainSolution} disabled={explaining}>
                  {explaining ? 'Thinking…' : 'Explain the idea'}
                </button>
              </>
            )}
            {explanation && <p className="deep-dive">{explanation}</p>}
          </div>
        )}
        {puzzle && (
          <div className="card">
            <div className="tabs">
              <button className={!showChat ? 'active' : ''} onClick={() => setShowChat(false)}>
                Hide chat
              </button>
              <button className={showChat ? 'active' : ''} onClick={() => setShowChat(true)}>
                Ask the coach
              </button>
            </div>
            <div style={{ display: showChat ? undefined : 'none' }}>
              <CoachChat fen={fen || puzzle.fen} key={puzzle.id} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
