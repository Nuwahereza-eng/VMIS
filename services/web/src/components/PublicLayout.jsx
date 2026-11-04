import { Link, NavLink } from "react-router-dom";

// Lightweight chrome for the public, pre-login experience: a tourist can
// explore park information freely and is invited to sign in or create an
// account to book a visit. No sidebar, no session — just the brand, a couple
// of public links, and the auth call-to-action.
// With `overlay` the page is full-width and the bar floats over its hero.
export default function PublicLayout({ children, overlay = false }) {
  return (
    <div className="public-shell">
      <header className={"public-topbar" + (overlay ? " public-topbar--overlay" : "")}>
        <Link to="/" className="public-brand">
          <img src="/icon-192.png" alt="" width={36} height={36} />
          <span>
            <span className="public-brand__name">VMIS</span>
            <span className="public-brand__sub">Murchison Falls</span>
          </span>
        </Link>

        <nav className="public-nav">
          <NavLink to="/guide" className="public-nav__link">
            Park guide
          </NavLink>
          <Link to="/login" className={"btn btn-sm " + (overlay ? "btn-outline-light" : "btn-outline-success")}>
            Sign in
          </Link>
          <Link to="/signup" className="btn btn-success btn-sm">
            Book
          </Link>
        </nav>
      </header>

      <main className={overlay ? "public-main--bleed" : "public-main"}>{children}</main>

      <footer className="public-footer">
        Uganda Wildlife Authority · Murchison Falls National Park
      </footer>
    </div>
  );
}
