import { Component } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import Home from './pages/Home.jsx';
import Review from './pages/Review.jsx';
import Play from './pages/Play.jsx';
import Puzzles from './pages/Puzzles.jsx';
import Settings from './pages/Settings.jsx';

// Isolates crashes so a rendering error in one page can't blank the whole app.
class PageBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="card">
          <p className="status">Something went wrong on this page: {String(this.state.error?.message || this.state.error)}</p>
          <button onClick={() => this.setState({ error: null })}>Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}

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
              <PageBoundary>
                <Page active={active} />
              </PageBoundary>
            </div>
          );
        })}
      </main>
    </div>
  );
}
