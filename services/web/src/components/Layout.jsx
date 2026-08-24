import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";

import { useApp } from "../context/AppContext.jsx";
import { getAlerts } from "../api/client.js";
import { navItemsForRole } from "../nav.js";

const ROLE_LABELS = {
  management: "Management",
  gate_officer: "Gate officer",
  activity_officer: "Activity officer",
};

function initials(name = "") {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Layout({ children }) {
  const { session, online, outbox, syncing, logout } = useApp();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [alertCount, setAlertCount] = useState(0);

  const items = navItemsForRole(session?.role);
  const current =
    items.find((i) => location.pathname.startsWith(i.to)) || items[0] || {};

  // Close the mobile drawer whenever the route changes.
  useEffect(() => setOpen(false), [location.pathname]);

  // Keep the Alerts badge current for management while online.
  useEffect(() => {
    let cancelled = false;
    const hasAlerts = items.some((i) => i.showAlerts);
    if (!online || !session?.token || !hasAlerts) {
      setAlertCount(0);
      return;
    }
    getAlerts(session.token)
      .then((list) => {
        if (!cancelled) setAlertCount(Array.isArray(list) ? list.length : 0);
      })
      .catch(() => {
        if (!cancelled) setAlertCount(0);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, session?.token, location.pathname]);

  return (
    <div className="app-shell">
      {open && (
        <button
          className="sidebar-backdrop"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        />
      )}

      <aside className={"sidebar" + (open ? " is-open" : "")}>
        <div className="sidebar__brand">
          <img src="/icon-192.png" alt="" />
          <div>
            <div className="name">VMIS</div>
            <div className="sub">Murchison Falls</div>
          </div>
        </div>

        <div className="sidebar__section">Workspace</div>
        <nav className="sidebar__nav">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                "sidebar__link" + (isActive ? " active" : "")
              }
            >
              <i className={"bi " + item.icon} />
              <span>{item.label}</span>
              {item.showOutbox && outbox > 0 && (
                <span className="count">{outbox}</span>
              )}
              {item.showAlerts && alertCount > 0 && (
                <span className="count count--alert">{alertCount}</span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar__foot">
          <div className={"working-mode " + (online ? "is-online" : "is-offline")}>
            <div className="working-mode__label">Working mode</div>
            <div className="working-mode__state">
              <span className="dot" />
              {online ? "Online" : "Offline"}
            </div>
            <div className="working-mode__note">
              {online ? "All systems operational" : "Changes saved locally"}
            </div>
          </div>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <button
            className="icon-btn topbar__menu-btn d-lg-none"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
          >
            <i className="bi bi-list" />
          </button>

          <div className="me-auto">
            <div className="topbar__title">{current.title || "VMIS"}</div>
            <div className="topbar__sub">{current.subtitle}</div>
          </div>

          <span
            className={"status-chip " + (online ? "is-online" : "is-offline")}
            title={online ? "Connected to the central system" : "Working locally"}
          >
            <span className="dot" />
            {online ? "Online" : "Offline"}
          </span>

          {syncing && (
            <span className="status-chip is-online d-none d-sm-inline-flex">
              <i className="bi bi-arrow-repeat spin" /> Syncing
            </span>
          )}

          <div className="user-chip">
            <div className="avatar">{initials(session?.name || session?.username)}</div>
            <div className="d-none d-md-block lh-sm">
              <div className="fw-semibold" style={{ fontSize: "0.9rem", color: "var(--vmis-ink)" }}>
                {session?.name || session?.username}
              </div>
              <div className="topbar__sub">
                {ROLE_LABELS[session?.role] || session?.role}
                {session?.stationId ? ` · ${session.stationId}` : ""}
              </div>
            </div>
            <button className="icon-btn" title="Sign out" onClick={logout}>
              <i className="bi bi-box-arrow-right" />
            </button>
          </div>
        </header>

        <main className="page-body fade-in">{children}</main>
      </div>
    </div>
  );
}
