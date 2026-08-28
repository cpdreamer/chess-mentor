import { useEffect, useMemo, useState, useCallback } from 'react';
import { Chessboard } from 'react-chessboard';
import { api, streamAnalyze } from '../api.js';
import EvalBar from '../components/EvalBar.jsx';
import CoachChat from '../components/CoachChat.jsx';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const playerName = (name, fallback) => (name && name !== '?' ? name : fallback);

const JUDGMENT_META = {
  great: { icon: '★', label: 'Great', cls: 'j-great' },
  best: { icon: '✓', label: 'Best', cls: 'j-best' },
  excellent: { icon: '!', label: 'Excellent', cls: 'j-excellent' },
  good: { icon: '·', label: 'Good', cls: 'j-good' },
  inaccuracy: { icon: '?!', label: 'Inaccuracy', cls: 'j-inaccuracy' },
  mistake: { icon: '?', label: 'Mistake', cls: 'j-mistake' },
  blunder: { icon: '??', label: 'Blunder', cls: 'j-blunder' },
};

export default function Review() {
  const [pgn, setPgn] = useState(null);
  const [focusColor, setFocusColor] = useState('');
  const [progress, setProgress] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [review, setReview] = useState(null);
  const [error, setError] = useState(null);
  const [ply, setPly] = useState(0); // 0 = start position
  const [tab, setTab] = useState('review');
  const [deepDive, setDeepDive] = useState({}); // ply -> text
  const [diveBusy, setDiveBusy] = useState(false);

  useEffect(() => {
    const pending = sessionStorage.getItem('cm.pendingPgn');
    if (pending) {
      setPgn(pending);
      setFocusColor(sessionStorage.getItem('cm.pendingColor') || '');
      sessionStorage.removeItem('cm.pendingPgn');
      sessionStorage.removeItem('cm.pendingColor');
    }
  }, []);

  useEffect(() => {
    if (!pgn) return;
    setAnalysis(null);
    setReview(null);
    setError(null);
    setPly(0);
    setDeepDive({});
    streamAnalyze({ pgn, focusColor: focusColor || null }, (evt) => {
      if (evt.type === 'progress') setProgress(evt);
      else if (evt.type === 'analysis') {
        setAnalysis(evt.analysis);
        setProgress(null);
      } else if (evt.type === 'review') setReview(evt.review);
      else if (evt.type === 'error') setError(evt.error);
    }).catch((e) => setError(e.message));
  }, [pgn, focusColor]);

  const moves = analysis?.moves || [];
  const current = ply > 0 ? moves[ply - 1] : null;
  const fen = current ? current.fenAfter : START_FEN;
  const orientation = focusColor === 'b' ? 'black' : 'white';

  const goto = useCallback(
    (p) => setPly(Math.max(0, Math.min(moves.length, p))),
    [moves.length]
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') goto(ply - 1);
      if (e.key === 'ArrowRight') goto(ply + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ply, goto]);

  const squareStyles = useMemo(() => {
    if (!current) return {};
    const color =
      current.judgment === 'blunder'
        ? 'rgba(220, 60, 60, .55)'
        : current.judgment === 'mistake'
          ? 'rgba(230, 130, 50, .55)'
          : current.judgment === 'inaccuracy'
            ? 'rgba(230, 200, 60, .55)'
            : 'rgba(120, 180, 90, .45)';
    return {
      [current.uci.slice(0, 2)]: { background: color },
      [current.uci.slice(2, 4)]: { background: color },
    };
  }, [current]);

  const comment = current && review?.comments?.[String(current.ply)];

  const explainMore = async () => {
    if (!current || diveBusy) return;
    setDiveBusy(true);
    try {
      const { text, ruleBased } = await api.post('/api/explain', { move: current });
      setDeepDive((d) => ({
        ...d,
        [current.ply]:
          ruleBased && comment
            ? 'Deeper explanations need an AI provider — add a free Gemini API key in Settings.'
            : text,
      }));
    } catch (e) {
      setDeepDive((d) => ({ ...d, [current.ply]: `Error: ${e.message}` }));
    } finally {
      setDiveBusy(false);
    }
  };

  if (!pgn) {
    return (
      <div className="page">
        <h1>Game review</h1>
        <p className="muted">
          No game selected. Go to <b>Games</b> to fetch your chess.com games or paste a PGN.
        </p>
      </div>
    );
  }

  return (
    <div className="page review-page">
      <div className="review-left">
        <div className="board-row">
          <EvalBar
            winPercent={current ? current.winPercentAfter : 50}
            cp={current ? current.cpAfter : 0}
            orientation={orientation}
          />
          <div className="board-wrap">
            <Chessboard
              options={{
                position: fen,
                boardOrientation: orientation,
                allowDragging: false,
                squareStyles,
                id: 'review-board',
              }}
            />
          </div>
        </div>
        <div className="board-controls">
          <button onClick={() => goto(0)}>⏮</button>
          <button onClick={() => goto(ply - 1)}>◀</button>
          <span className="muted">
            {ply}/{moves.length}
          </span>
          <button onClick={() => goto(ply + 1)}>▶</button>
          <button onClick={() => goto(moves.length)}>⏭</button>
        </div>
        {analysis && (
          <div className="accuracy-row">
            <span>
              ♔ {playerName(analysis.header.White, 'White')}: <b>{analysis.accuracy.white}%</b>
            </span>
            <span>
              ♚ {playerName(analysis.header.Black, 'Black')}: <b>{analysis.accuracy.black}%</b>
            </span>
          </div>
        )}
      </div>

      <div className="review-right">
        {progress && (
          <div className="card">
            <p>
              Analyzing with Stockfish… {progress.current}/{progress.total}
            </p>
            <div className="progress">
              <div style={{ width: `${(100 * progress.current) / progress.total}%` }} />
            </div>
          </div>
        )}
        {error && <p className="error">{error}</p>}

        {analysis && (
          <>
            <div className="tabs">
              <button className={tab === 'review' ? 'active' : ''} onClick={() => setTab('review')}>
                Review
              </button>
              <button className={tab === 'moves' ? 'active' : ''} onClick={() => setTab('moves')}>
                Moves
              </button>
              <button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>
                Ask the coach
              </button>
            </div>

            {tab === 'review' && (
              <div className="card review-panel">
                {!review && <p className="muted">Writing the AI review…</p>}
                {review && ply === 0 && (
                  <>
                    <h3>Game summary</h3>
                    <p>{review.summary}</p>
                    {review.lessons?.length > 0 && (
                      <>
                        <h4>Lessons</h4>
                        <ul>
                          {review.lessons.map((l, i) => (
                            <li key={i}>{l}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    {review.ruleBased && (
                      <p className="hint">
                        Tip: add a free Gemini API key in Settings for full AI coaching.
                      </p>
                    )}
                    <p className="muted">Step through the moves to see per-move commentary.</p>
                  </>
                )}
                {current && (
                  <>
                    <h3>
                      {current.moveNumber}
                      {current.color === 'w' ? '.' : '…'} {current.san}{' '}
                      <span className={`judgment ${JUDGMENT_META[current.judgment].cls}`}>
                        {JUDGMENT_META[current.judgment].icon} {JUDGMENT_META[current.judgment].label}
                      </span>
                    </h3>
                    {current.judgment !== 'best' && current.bestMoveSan && (
                      <p className="muted">
                        Engine preferred <b>{current.bestMoveSan}</b>
                        {current.bestLineSan?.length > 1 && <> ({current.bestLineSan.join(' ')})</>}
                      </p>
                    )}
                    <p>{comment || (review ? 'No specific comment for this move.' : '')}</p>
                    {deepDive[current.ply] && <p className="deep-dive">{deepDive[current.ply]}</p>}
                    <button className="small" onClick={explainMore} disabled={diveBusy}>
                      {diveBusy ? 'Thinking…' : 'Explain this move in depth'}
                    </button>
                  </>
                )}
              </div>
            )}

            {tab === 'moves' && (
              <div className="card moves-panel">
                {moves.map((m) => (
                  <button
                    key={m.ply}
                    className={`move-chip ${JUDGMENT_META[m.judgment].cls} ${ply === m.ply ? 'current' : ''}`}
                    onClick={() => goto(m.ply)}
                    title={JUDGMENT_META[m.judgment].label}
                  >
                    {m.color === 'w' ? `${m.moveNumber}. ` : ''}
                    {m.san} {JUDGMENT_META[m.judgment].icon}
                  </button>
                ))}
              </div>
            )}

            {tab === 'chat' && (
              <div className="card">
                <p className="muted">
                  Chatting about the position after {ply === 0 ? 'the start' : `move ${ply}`}.
                </p>
                <CoachChat fen={fen} key={fen} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
