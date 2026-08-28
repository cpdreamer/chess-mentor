import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

const fmtDate = (ts) => new Date(ts * 1000).toLocaleDateString();

export default function Home() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [months, setMonths] = useState(2);
  const [games, setGames] = useState(null);
  const [pgns, setPgns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pastedPgn, setPastedPgn] = useState('');

  useEffect(() => {
    api.get('/api/settings').then((s) => {
      if (s.chesscomUsername) setUsername(s.chesscomUsername);
    });
  }, []);

  const fetchGames = async () => {
    if (!username.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.get(
        `/api/chesscom/${encodeURIComponent(username.trim())}/games?months=${months}`
      );
      setGames(data.games);
      setPgns(data.pgns);
      api.post('/api/settings', { chesscomUsername: username.trim() });
    } catch (e) {
      setError(e.message);
      setGames(null);
    } finally {
      setLoading(false);
    }
  };

  const review = (pgn, userColor) => {
    sessionStorage.setItem('cm.pendingPgn', pgn);
    sessionStorage.setItem('cm.pendingColor', userColor || '');
    navigate('/review');
  };

  const resultBadge = (g) => {
    if (!g.userColor) return '—';
    const mine = g.userColor === 'w' ? g.white.result : g.black.result;
    if (mine === 'win') return 'Won';
    if (['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient'].includes(mine))
      return 'Draw';
    return 'Lost';
  };

  return (
    <div className="page">
      <h1>Analyze your games</h1>
      <section className="card">
        <h2>Fetch from chess.com</h2>
        <div className="row">
          <input
            placeholder="Your chess.com username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchGames()}
          />
          <select value={months} onChange={(e) => setMonths(Number(e.target.value))}>
            <option value={1}>Last month</option>
            <option value={2}>Last 2 months</option>
            <option value={4}>Last 4 months</option>
            <option value={12}>Last 12 months</option>
          </select>
          <button onClick={fetchGames} disabled={loading || !username.trim()}>
            {loading ? 'Fetching…' : 'Fetch games'}
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        {games && games.length === 0 && <p className="muted">No games found in that period.</p>}
        {games && games.length > 0 && (
          <table className="games-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>White</th>
                <th>Black</th>
                <th>Type</th>
                <th>Result</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {games.map((g) => (
                <tr key={g.id}>
                  <td>{fmtDate(g.endTime)}</td>
                  <td>
                    {g.white.username} ({g.white.rating})
                  </td>
                  <td>
                    {g.black.username} ({g.black.rating})
                  </td>
                  <td>{g.timeClass}</td>
                  <td>
                    <span className={`badge badge-${resultBadge(g).toLowerCase()}`}>{resultBadge(g)}</span>
                  </td>
                  <td>
                    <button className="small" onClick={() => review(pgns[g.id], g.userColor)}>
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h2>Or paste a PGN</h2>
        <textarea
          rows={6}
          placeholder={'[Event "..."]\n\n1. e4 e5 2. Nf3 ...'}
          value={pastedPgn}
          onChange={(e) => setPastedPgn(e.target.value)}
        />
        <button onClick={() => review(pastedPgn, '')} disabled={!pastedPgn.trim()}>
          Review this game
        </button>
      </section>
    </div>
  );
}
