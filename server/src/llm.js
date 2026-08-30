import { getSettings } from './settings.js';

export class LlmError extends Error {}

async function callGemini(settings, messages, { json = false } = {}) {
  const sys = messages.find((m) => m.role === 'system');
  const rest = messages.filter((m) => m.role !== 'system');
  const body = {
    contents: rest.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 8192,
      ...(json ? { responseMimeType: 'application/json' } : {}),
    },
    ...(sys ? { systemInstruction: { parts: [{ text: sys.content }] } } : {}),
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${settings.geminiModel}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': settings.geminiApiKey,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new LlmError(`Gemini API error (${res.status}): ${text.slice(0, 500)}`);
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
  if (!text) throw new LlmError('Gemini returned an empty response');
  return text;
}

async function callOpenAi(settings, messages, { json = false } = {}) {
  const res = await fetch(`${settings.openaiBaseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.openaiApiKey}`,
    },
    body: JSON.stringify({
      model: settings.openaiModel,
      messages,
      temperature: 0.4,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new LlmError(`OpenAI API error (${res.status}): ${text.slice(0, 500)}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  if (!text) throw new LlmError('LLM returned an empty response');
  return text;
}

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

function callGroq(settings, messages, opts, model) {
  return callOpenAi(
    {
      openaiApiKey: settings.groqApiKey,
      openaiModel: model || settings.groqModel,
      openaiBaseUrl: GROQ_BASE_URL,
    },
    messages,
    opts
  );
}

export function llmAvailable() {
  const s = getSettings();
  if (s.provider === 'gemini') return Boolean(s.geminiApiKey);
  if (s.provider === 'groq') return Boolean(s.groqApiKey);
  if (s.provider === 'openai') return Boolean(s.openaiApiKey);
  return false;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function retryDelayMs(error) {
  if (!/\(429\)/.test(error.message)) return null;
  const m = error.message.match(/(?:retry|try again) in ([\d.]+)s/i);
  return m ? Math.min(90_000, Math.ceil(parseFloat(m[1]) * 1000) + 1000) : 30_000;
}

export async function chat(messages, opts = {}) {
  const s = getSettings();
  const call = () => {
    if (s.provider === 'gemini' && s.geminiApiKey) return callGemini(s, messages, opts);
    if (s.provider === 'groq' && s.groqApiKey) return callGroq(s, messages, opts);
    if (s.provider === 'openai' && s.openaiApiKey) return callOpenAi(s, messages, opts);
    throw new LlmError(
      'No AI provider configured. Add a free Groq or Gemini API key in Settings.'
    );
  };
  // Retry rate-limited requests (free tiers have per-minute quotas).
  for (let attempt = 0; ; attempt++) {
    try {
      return await call();
    } catch (e) {
      const delay = e instanceof LlmError ? retryDelayMs(e) : null;
      if (delay == null || attempt >= 2) throw e;
      await sleep(delay);
    }
  }
}

export function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < 0) throw new LlmError('Could not parse AI response as JSON');
  return JSON.parse(text.slice(start, end + 1));
}
