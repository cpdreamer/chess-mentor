import { useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { api } from '../api.js';
import EvalBar from '../components/EvalBar.jsx';
import CoachChat from '../components/CoachChat.jsx';

export default function Play() {
  const gameRef = useRef(null);
  if (gameRef.current === null) gameRef.current = new Chess();
  const [fen, setFen] = useState(() => new Chess().fen());
  const [playerColor, setPlayerColor] = useState('w');
  const [level, setLevel] = useState(3);
  const [thinking, setThinking] = useState(false);
  const [log, setLog] = useState([]); // { san, by: 'you'|'ai', explanation? }
  const [evalInfo, setEvalInfo] = useState({ cp: 0, winPercent: 50 });
  const [status, setStatus] = useState(null);
  const [showChat, setShowChat] = useState(false);
  const [gameId, setGameId] = useState(0);
  const logRef = useRef(null);

  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [log]);

  const checkGameOver = (game) => {
    if (!game.isGameOver()) return false;
    if (game.isCheckmate())
      setStatus(game.turn() === playerColor ? 'Checkmate — the AI wins this one!' : 'Checkmate — you win! 🎉');
    else if (game.isStalemate()) setStatus('Draw by stalemate.');
    else if (game.isThreefoldRepetition()) setStatus('Draw by repetition.');
    else if (game.isInsufficientMaterial()) setStatus('Draw — insufficient material.');
    else setStatus('Draw.');
    return true;
  };

  const aiMove = async (game, playerLastSan) => {
    setThinking(true);
    try {
      const data = await api.post('/api/play/move', {
        fen: game.fen(),
        level,
        playerLastSan,
      });
      if (data.gameOver && !data.move) {
        checkGameOver(game);
        return;
      }
      game.move(data.move.san);
      setFen(game.fen());
      setEvalInfo({ cp: data.cp, winPercent: data.winPercent });
      setLog((l) => [...l, { san: data.move.san, by: 'ai', explanation: data.explanation }]);
      checkGameOver(game);
    } catch (e) {
      setStatus(`Engine error: ${e.message}`);
    } finally {
      setThinking(false);
    }
  };

  const onPieceDrop = ({ sourceSquare, targetSquare }) => {
    if (thinking || status) return false;
    const game = gameRef.current;
    if (game.turn() !== playerColor) return false;
    let move;
    try {
      move = game.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });
    } catch {
      return false;
    }
    if (!move) return false;
    setFen(game.fen());
    setLog((l) => [...l, { san: move.san, by: 'you' }]);
    api
      .post('/api/eval', { fen: game.fen(), depth: 10 })
      .then((d) => setEvalInfo({ cp: d.cp, winPercent: d.winPercent }))
      .catch(() => {});
    if (!checkGameOver(game)) aiMove(game, move.san);
    return true;
  };

  const newGame = (color) => {
    const game = new Chess();
    gameRef.current = game;
    setFen(game.fen());
    setPlayerColor(color);
    setLog([]);
    setStatus(null);
    setEvalInfo({ cp: 0, winPercent: 50 });
    setGameId((id) => id + 1);
    if (color === 'b') aiMove(game, null);
  };

  return (
    <div className="page review-page">
      <div className="review-left">
        <div className="board-row">
          <EvalBar
            winPercent={evalInfo.winPercent}
            cp={evalInfo.cp}
            orientation={playerColor === 'b' ? 'black' : 'white'}
          />
          <div className="board-wrap">
            <Chessboard
              options={{
                position: fen,
                boardOrientation: playerColor === 'b' ? 'black' : 'white',
                onPieceDrop,
                allowDragging: !thinking && !status,
                id: 'play-board',
              }}
            />
          </div>
        </div>
        <div className="board-controls">
          <button onClick={() => newGame('w')}>New game as White</button>
          <button onClick={() => newGame('b')}>New game as Black</button>
          <label>
            Level{' '}
            <select value={level} onChange={(e) => setLevel(Number(e.target.value))}>
              <option value={1}>1 — Beginner</option>
              <option value={2}>2 — Casual</option>
              <option value={3}>3 — Club</option>
              <option value={4}>4 — Strong</option>
              <option value={5}>5 — Maximum</option>
            </select>
          </label>
        </div>
        {status && <p className="status">{status}</p>}
        {thinking && <p className="muted">AI is thinking…</p>}
      </div>

      <div className="review-right">
        <div className="tabs">
          <button className={!showChat ? 'active' : ''} onClick={() => setShowChat(false)}>
            Move log
          </button>
          <button className={showChat ? 'active' : ''} onClick={() => setShowChat(true)}>
            Ask the coach
          </button>
        </div>
        {!showChat && (
          <div className="card play-log" ref={logRef}>
            {log.length === 0 && (
              <p className="muted">
                Play a move — the AI will respond and explain the intuition behind its moves. Ask it
                questions any time in the “Ask the coach” tab.
              </p>
            )}
            {log.map((entry, i) => (
              <div key={i} className={`log-entry ${entry.by}`}>
                <b>
                  {entry.by === 'you' ? 'You' : 'AI'}: {entry.san}
                </b>
                {entry.explanation && <p>{entry.explanation}</p>}
              </div>
            ))}
          </div>
        )}
        <div className="card" style={{ display: showChat ? undefined : 'none' }}>
          <CoachChat fen={fen} key={gameId} />
        </div>
      </div>
    </div>
  );
}
