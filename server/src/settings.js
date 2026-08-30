import fs from 'fs';
import path from 'path';
import os from 'os';

const DIR = path.join(os.homedir(), '.chess-mentor');
const FILE = path.join(DIR, 'settings.json');

const DEFAULTS = {
  provider: process.env.LLM_PROVIDER || 'gemini', // 'gemini' | 'groq' | 'openai' | 'none'
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: 'gemini-3.6-flash',
  groqApiKey: process.env.GROQ_API_KEY || '',
  groqModel: 'openai/gpt-oss-120b',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: 'gpt-4o-mini',
  openaiBaseUrl: 'https://api.openai.com/v1',
  chesscomUsername: '',
  analysisDepth: 14,
};

export function getSettings() {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return { ...DEFAULTS, ...raw };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(partial) {
  const merged = { ...getSettings(), ...partial };
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(merged, null, 2));
  return merged;
}

export function maskedSettings() {
  const s = getSettings();
  const mask = (k) => (k ? k.slice(0, 4) + '...' + k.slice(-4) : '');
  return {
    ...s,
    geminiApiKey: mask(s.geminiApiKey),
    groqApiKey: mask(s.groqApiKey),
    openaiApiKey: mask(s.openaiApiKey),
    hasGeminiKey: Boolean(s.geminiApiKey),
    hasGroqKey: Boolean(s.groqApiKey),
    hasOpenaiKey: Boolean(s.openaiApiKey),
  };
}
