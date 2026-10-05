import { Link, NavLink } from "react-router-dom";

// Lightweight chrome for the public, pre-login experience: a tourist can
// explore park information freely and is invited to sign in or create an
// account to book a visit. No sidebar, no session — just the brand, a couple
// of public links, and the auth call-to-action.
export default function PublicLayout({ children }) {
  return (
    <div className="public-shell">
      <header className="public-topbar">
        <Link to="/" className="public-brand">
          <img src="/icon-192.png" alt="" width={36} height={36} />
          <span>
            <span className="public-brand__name">VMIS</span>
            <span className="public-brand__sub">Murchison Falls</span>
          </span>
        </Link>

        <nav className="public-nav">
          <NavLink to="/" end className="public-nav__link">
            <i className="bi bi-signpost-2" /> Park Info
          </NavLink>
          <Link to="/login" className="btn btn-outline-success btn-sm">
            <i className="bi bi-box-arrow-in-right" /> Sign in
          </Link>
          <Link to="/signup" className="btn btn-success btn-sm">
            <i className="bi bi-calendar-plus" /> Sign up to book
          </Link>
        </nav>
      </header>

      <main className="public-main">{children}</main>

      <footer className="public-footer">
        Uganda Wildlife Authority · Murchison Falls National Park
      </footer>
    </div>
  );
}
