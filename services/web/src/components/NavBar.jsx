import { NavLink } from "react-router-dom";

import { useApp } from "../context/AppContext.jsx";

export default function NavBar() {
  const { session, online, outbox, logout } = useApp();

  const linkClass = ({ isActive }) => "nav-link" + (isActive ? " active fw-semibold" : "");

  return (
    <nav className="navbar navbar-expand-lg navbar-dark bg-success">
      <div className="container">
        <span className="navbar-brand fw-bold d-flex align-items-center gap-2">
          <img
            src="/logo.png"
            alt=""
            width={28}
            height={28}
            className="bg-white rounded-circle p-1"
          />
          VMIS
        </span>
        <div className="navbar-nav me-auto">
          <NavLink to="/register" className={linkClass}>
            Register
          </NavLink>
          <NavLink to="/verify" className={linkClass}>
            Verify
          </NavLink>
          <NavLink to="/visits" className={linkClass}>
            Entry / Exit
          </NavLink>
          <NavLink to="/activities" className={linkClass}>
            Activities
          </NavLink>
          <NavLink to="/sync" className={linkClass}>
            Sync
            {outbox > 0 && (
              <span className="badge bg-warning text-dark ms-1">{outbox}</span>
            )}
          </NavLink>
        </div>
        <div className="d-flex align-items-center gap-2">
          <span
            className={"badge " + (online ? "bg-light text-success" : "bg-danger")}
            title={online ? "Online" : "Offline - working locally"}
          >
            {online ? "Online" : "Offline"}
          </span>
          <span className="text-white small d-none d-md-inline">
            {session?.username} ({session?.role})
          </span>
          <button className="btn btn-sm btn-outline-light" onClick={logout}>
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}
