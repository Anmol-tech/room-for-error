import { Link } from "react-router-dom";

/** A terminal image-generation failure, with a clear way to choose a different adventure. */
export function ModerationNotice({ theme }: { theme?: string }) {
  return (
    <div className="arrival-page">
      <header className="start-bar">
        <Link to="/" className="wordmark">Room for Error</Link>
      </header>
      <main className="arrival moderation-notice">
        {theme && <p className="arrival-theme">“{theme}”</p>}
        <p className="moderation-label">Image moderation</p>
        <h1>This scenario couldn't be illustrated.</h1>
        <p className="notice error" role="alert">
          FLUX declined one or more room images under its content moderation rules. This scenario can't continue.
        </p>
        <p className="muted">Try another scenario with a different theme. Kane testing is stopped for this scenario.</p>
        <div className="arrival-actions">
          <Link to="/" className="btn-primary" autoFocus>Try another scenario</Link>
          <Link to="/library" className="btn-ghost">Browse other rooms</Link>
        </div>
      </main>
    </div>
  );
}
