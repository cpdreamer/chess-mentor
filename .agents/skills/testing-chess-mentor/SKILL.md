---
name: testing-chess-mentor
description: How to run and end-to-end test the Chess Mentor app (server, client, Stockfish, puzzles, play-vs-AI)
---

# Testing Chess Mentor

## Run
- `npm run dev` at repo root starts Express server (:3001) and Vite client (:5173, proxies /api). A stale `node` may already hold :3001 (serving client/dist) — kill it first (`ss -tlnp | grep 3001`).
- Stockfish binary expected at /usr/games/stockfish. No LLM key configured means rule-based review text and a friendly chat error — that is expected behavior, not a bug.

## Speed tips
- Set Stockfish depth to 10 in Settings first (persists via GET/POST /api/settings) — depth 14 on a long game takes minutes.
- For review testing, paste a short PGN with an intentional blunder, e.g. `1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4 4. Nxe5 Qg5 5. Nxf7 Qxg2 6. Rf1 Qxe4+ 7. Be2 Nf3# 0-1` — yields blunder/mistake/great chips quickly.

## Board interaction (react-chessboard + dnd-kit)
- Fast `left_click_drag` does NOT work (drops on the source square). Use mouse_move → left_mouse_down → several intermediate mouse_move steps → left_mouse_up.
- Board may be flipped (black orientation on Play-as-Black / black-to-move puzzles); read the file/rank labels on screen before computing square coordinates.

## Puzzle solution oracle
- Puzzles come from Lichess; get the expected solution with `curl https://lichess.org/api/puzzle/<id>` (id shown in the UI, e.g. "Puzzle 58PmQ"). solution array is UCI moves; opponent replies auto-play.

## Devin Secrets Needed
- None for engine-only testing. Optional: a Gemini or OpenAI API key (entered in Settings UI) to test full AI coaching paths.
