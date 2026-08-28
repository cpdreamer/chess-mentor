import { NavLink, useLocation } from 'react-router-dom';
import Home from './pages/Home.jsx';
import Review from './pages/Review.jsx';
import Play from './pages/Play.jsx';
import Puzzles from './pages/Puzzles.jsx';
import Settings from './pages/Settings.jsx';

// All pages stay mounted so in-progress games, analyses, and chats
// survive navigating between tabs; only the active one is displayed.
const PAGES = [
  ['/', Home],
  ['/review', Review],
  ['/play', Play],
  ['/puzzles', Puzzles],
  ['/settings', Settings],
];

export default function App() {
  const { pathname } = useLocation();
  return (
    <div className="app">
      <nav className="topnav">
        <span className="brand">♞ Chess Mentor</span>
        <NavLink to="/" end>
          Games
        </NavLink>
        <NavLink to="/review">Review</NavLink>
        <NavLink to="/play">Play AI</NavLink>
        <NavLink to="/puzzles">Puzzles</NavLink>
        <NavLink to="/settings">Settings</NavLink>
      </nav>
      <main>
        {PAGES.map(([path, Page]) => {
          const active = pathname === path;
          return (
            <div key={path} style={{ display: active ? undefined : 'none' }}>
              <Page active={active} />
            </div>
          );
        })}
      </main>
    </div>
  );
}
