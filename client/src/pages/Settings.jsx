import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/api/settings').then(setSettings).catch((e) => setError(e.message));
  }, []);

  const update = (k, v) => setSettings((s) => ({ ...s, [k]: v }));

  const save = async () => {
    setError(null);
    try {
      const next = await api.post('/api/settings', settings);
      setSettings(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e.message);
    }
  };

  if (!settings) return <div className="page">{error || 'Loading…'}</div>;

  return (
    <div className="page settings-page">
      <h1>Settings</h1>

      <section className="card">
        <h2>AI coach</h2>
        <p className="muted">
          The coach uses a language model to explain moves. <b>Google Gemini has a free tier</b> —
          create a free key at{' '}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
            aistudio.google.com/apikey
          </a>{' '}
          (sign in with Google → “Create API key”) and paste it below. Without a key you still get
          full Stockfish analysis with basic explanations.
        </p>
        <label>
          Provider
          <select value={settings.provider} onChange={(e) => update('provider', e.target.value)}>
            <option value="gemini">Google Gemini (free tier available)</option>
            <option value="openai">OpenAI (or compatible)</option>
            <option value="none">None — engine-only explanations</option>
          </select>
        </label>

        {settings.provider === 'gemini' && (
          <>
            <label>
              Gemini API key {settings.hasGeminiKey && <span className="badge badge-won">key saved</span>}
              <input
                type="password"
                placeholder={settings.hasGeminiKey ? settings.geminiApiKey : 'AIza…'}
                onChange={(e) => update('geminiApiKey', e.target.value)}
              />
            </label>
            <label>
              Model
              <input
                value={settings.geminiModel}
                onChange={(e) => update('geminiModel', e.target.value)}
              />
            </label>
          </>
        )}

        {settings.provider === 'openai' && (
          <>
            <label>
              OpenAI API key {settings.hasOpenaiKey && <span className="badge badge-won">key saved</span>}
              <input
                type="password"
                placeholder={settings.hasOpenaiKey ? settings.openaiApiKey : 'sk-…'}
                onChange={(e) => update('openaiApiKey', e.target.value)}
              />
            </label>
            <label>
              Model
              <input
                value={settings.openaiModel}
                onChange={(e) => update('openaiModel', e.target.value)}
              />
            </label>
            <label>
              Base URL (change for OpenAI-compatible providers, e.g. a local Ollama)
              <input
                value={settings.openaiBaseUrl}
                onChange={(e) => update('openaiBaseUrl', e.target.value)}
              />
            </label>
          </>
        )}
      </section>

      <section className="card">
        <h2>Analysis</h2>
        <label>
          Stockfish depth (higher = more accurate but slower)
          <select
            value={settings.analysisDepth}
            onChange={(e) => update('analysisDepth', Number(e.target.value))}
          >
            <option value={10}>10 — fast</option>
            <option value={14}>14 — balanced (recommended)</option>
            <option value={18}>18 — deep</option>
          </select>
        </label>
        <label>
          Default chess.com username
          <input
            value={settings.chesscomUsername}
            onChange={(e) => update('chesscomUsername', e.target.value)}
          />
        </label>
      </section>

      {error && <p className="error">{error}</p>}
      <button onClick={save}>{saved ? 'Saved ✓' : 'Save settings'}</button>
    </div>
  );
}
