# Chess Mentor E2E Test Plan

App: http://localhost:5173 (Vite dev) proxying to Express :3001. No LLM key configured — rule-based fallbacks are the expected behavior.

## T1. Settings page (do first to speed up analysis)
1. Go to Settings. Assert: provider options include Gemini and OpenAI; depth selector present.
2. Set analysis depth to 10, set chess.com username to "hikaru", Save.
   - Pass: save confirmation / persisted values; GET /api/settings returns analysisDepth=10.
3. Return to Home. Pass: username field pre-filled with "hikaru".

## T2. Home: fetch chess.com games
1. On Home, fetch games for "hikaru" (last month range).
   - Pass: table renders rows with players/results; Fail: empty table, error banner, console errors.
2. Note a short game if visible.

## T3. Paste-PGN review (primary review flow)
1. Paste a short PGN (~10-20 moves incl. a blunder, e.g. Scholar's-mate-ish game) into the paste box, submit.
2. Assert during analysis: progress bar advances (screenshot mid-progress).
3. After analysis, assert:
   - Board renders + eval bar present with sensible orientation (winning side larger portion).
   - Accuracy % shown for both sides.
   - Move judgment chips (best/mistake/blunder) appear; the intentional blunder is marked blunder/mistake.
   - Moves tab lists moves; clicking a move navigates board.
   - Move navigation: next/prev buttons AND arrow keys change board position.
   - Per-move comment panel shows rule-based text; overall review shows "Add a Gemini API key..." style messaging, not an error.
4. Click "Explain this move in depth" — Pass: rule-based text returned, no crash.
5. "Ask the coach" tab: send a question — Pass: friendly error about needing an API key (graceful, no unhandled error).

## T4. Home game → Review (link works)
1. Back on Home, click Review on one fetched hikaru game. Pass: navigates to Review and analysis starts (progress bar appears). (May cancel/navigate away after progress confirmed to save time if game is long.)

## T5. Play AI
1. Play AI page: select Level (e.g. 2), New game as White. Make 2-3 legal moves by dragging pieces.
   - Pass: AI replies each time (black moves appear), move log fills, eval bar updates. No explanation text expected (no key) — no error shown.

## T6. Puzzles
1. Puzzles page: puzzle loads from Lichess (board + prompt).
2. Make a deliberately wrong move. Pass: feedback "... isn't it — try again."
3. Make the correct move (use Show solution if needed to learn it, on a second puzzle test correct-first). Pass: progresses / success state.
4. Click "Show solution". Pass: solution shown/played.
5. Change difficulty selector, click "Next puzzle". Pass: new puzzle loads.

Throughout: watch console for errors, layout breakage, eval bar orientation.
