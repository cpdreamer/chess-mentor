const BASE = 'https://api.chess.com/pub';
const HEADERS = { 'User-Agent': 'chess-mentor (personal analysis app)' };

async function getJson(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`chess.com API error ${res.status} for ${url}`);
  return res.json();
}

export async function fetchRecentGames(username, { months = 2, max = 50 } = {}) {
  const user = username.trim().toLowerCase();
  const archives = await getJson(`${BASE}/player/${encodeURIComponent(user)}/games/archives`);
  if (!archives) throw new Error(`chess.com user "${username}" not found`);
  const urls = archives.archives.slice(-months).reverse();
  const games = [];
  for (const url of urls) {
    const data = await getJson(url);
    if (!data) continue;
    for (const g of data.games.reverse()) {
      if (!g.pgn) continue;
      games.push({
        url: g.url,
        endTime: g.end_time,
        timeClass: g.time_class,
        timeControl: g.time_control,
        rated: g.rated,
        white: { username: g.white?.username, rating: g.white?.rating, result: g.white?.result },
        black: { username: g.black?.username, rating: g.black?.rating, result: g.black?.result },
        pgn: g.pgn,
        userColor:
          g.white?.username?.toLowerCase() === user
            ? 'w'
            : g.black?.username?.toLowerCase() === user
              ? 'b'
              : null,
      });
      if (games.length >= max) return games;
    }
  }
  return games;
}
