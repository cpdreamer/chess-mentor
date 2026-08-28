import { useState, useRef, useEffect } from 'react';
import { api } from '../api.js';

// Chat with the AI coach about a specific position (FEN).
export default function CoachChat({ fen, seed = [] }) {
  const [messages, setMessages] = useState(seed);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const question = input.trim();
    if (!question || busy) return;
    setInput('');
    setError(null);
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((ms) => [...ms, { role: 'user', content: question }]);
    setBusy(true);
    try {
      const { text } = await api.post('/api/chat', { fen, question, history });
      setMessages((ms) => [...ms, { role: 'assistant', content: text }]);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="coach-chat">
      <div className="chat-messages">
        {messages.length === 0 && (
          <p className="muted">
            Ask the coach anything about this position — e.g. “why not take the knight?” or “what's
            the plan here?”
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role}`}>
            {m.content}
          </div>
        ))}
        {busy && <div className="chat-msg assistant muted">Thinking…</div>}
        {error && <div className="chat-msg error">{error}</div>}
        <div ref={bottomRef} />
      </div>
      <div className="chat-input-row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Ask about this position…"
        />
        <button onClick={send} disabled={busy || !input.trim()}>
          Ask
        </button>
      </div>
    </div>
  );
}
