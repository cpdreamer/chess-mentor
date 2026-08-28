# ♞ Chess Mentor

Your personal chess coach — like chess.com's Game Review, but **unlimited, free, and smarter**.

- **Unlimited game review**: Stockfish analyzes every move (accuracy %, blunders/mistakes/inaccuracies, eval bar) and an AI coach explains *why* each move is good or bad in plain English — the intuition, the plans, the tactics you missed.
- **Fetch your chess.com games**: just type your username, pick a game, click Review. No login needed.
- **Play against the AI**: 5 strength levels, and it explains the intuition behind each of its moves as you play. Ask it questions mid-game.
- **Puzzles**: unlimited tactics puzzles (from Lichess's free database) with AI explanations of the theme, the solution, and why your wrong tries fail.
- **Ask the coach**: chat about any position, anywhere in the app.

Everything runs on your own computer. The only external services used are chess.com's public game API, Lichess's public puzzle API, and (optionally) a free Gemini API key for the AI explanations.

## Setup (one time)

You need [Node.js](https://nodejs.org) (v18+) and Stockfish installed:

```bash
# Ubuntu/Debian
sudo apt install stockfish
# macOS
brew install stockfish
# Windows: download from https://stockfishchess.org/download/ and set the
# STOCKFISH_PATH environment variable to the .exe location
```

Then, in this folder:

```bash
npm install
npm run setup
```

## Run it

```bash
npm run dev
```

Open **http://localhost:5173** in your browser. That's it.

(For a production-style run instead: `npm run build` then `npm start`, and open http://localhost:3001.)

## Enable full AI coaching (free)

1. Go to <https://aistudio.google.com/apikey> and sign in with a Google account.
2. Click **Create API key** (free tier — no payment needed).
3. In the app, open **Settings**, paste the key, and save.

Without a key, you still get full Stockfish analysis, the eval bar, accuracy scores, and rule-based explanations — the AI coach features (rich explanations, chat, play-mode commentary) unlock once a key is added. OpenAI or any OpenAI-compatible API (e.g. a local Ollama) works too.

## Run it in the cloud with GitHub Codespaces (free, no installs)

No installs needed — run it in your browser:

1. Open <https://codespaces.new/cpdreamer/chess-mentor> and click **Create codespace** (first start takes a few minutes to build).
2. When it's ready, the app opens automatically — or click the **Ports** tab and open the forwarded port 3001 link.
3. Next time, resume the same codespace from <https://github.com/codespaces> (starts much faster).

GitHub's free plan includes ~60 hours/month, and the codespace stops automatically when idle.

## Host it on a server (via Render or any Docker host)

A `Dockerfile` and `render.yaml` are included, so you can deploy it to [Render](https://render.com), or any host that runs Docker containers. Set the `GEMINI_API_KEY` environment variable on the service to enable AI coaching (recommended for hosts with ephemeral disks, where settings saved in the app's Settings page reset on restarts).

## Notes

- Your settings and API key are stored locally in `~/.chess-mentor/settings.json` and never leave your machine (the key is only sent to Google/OpenAI when generating explanations).
- Analysis depth is configurable in Settings (deeper = more accurate but slower).
