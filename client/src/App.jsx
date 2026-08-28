import { Routes, Route, NavLink } from 'react-router-dom';
import Home from './pages/Home.jsx';
import Review from './pages/Review.jsx';
import Play from './pages/Play.jsx';
import Puzzles from './pages/Puzzles.jsx';
import Settings from './pages/Settings.jsx';

export default function App() {
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
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/review" element={<Review />} />
          <Route path="/play" element={<Play />} />
          <Route path="/puzzles" element={<Puzzles />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
