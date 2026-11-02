import { useEffect, useMemo, useState } from "react";

import { serviceableVisitors } from "../data/repository.js";
import { visitorCode } from "../domain/ids.js";

const MAX_RESULTS = 8;

function initials(name) {
  return (name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
}

function matches(v, q) {
  return [v.full_name, v.id_number, visitorCode(v.id), v.id]
    .filter(Boolean)
    .some((field) => String(field).toLowerCase().includes(q));
}

// Search-as-you-type visitor picker. Filters the visitors already loaded
// (works offline) and, when online, also asks the server so a visitor beyond
// the first page of the registry can still be found by name, ID or code.
export default function VisitorPicker({ visitors, token, online, onPick }) {
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState([]);
  const [searching, setSearching] = useState(false);

  const q = query.trim().toLowerCase();

  useEffect(() => {
    if (!online || q.length < 2) {
      setRemote([]);
      return undefined;
    }
    let active = true;
    setSearching(true);
    const id = setTimeout(async () => {
      try {
        const rows = await serviceableVisitors(token, true, q);
        if (active) setRemote(rows);
      } finally {
        if (active) setSearching(false);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(id);
    };
  }, [q, online, token]);

  const results = useMemo(() => {
    const byId = new Map();
    for (const v of [...visitors, ...remote]) {
      if (!byId.has(v.id) && (!q || matches(v, q))) byId.set(v.id, v);
    }
    return [...byId.values()];
  }, [visitors, remote, q]);

  const shown = results.slice(0, MAX_RESULTS);

  return (
    <div className="surface-card p-3 visitor-picker">
      <label className="form-label" htmlFor="visitor-search">
        Find the visitor
      </label>
      <div className="search-field">
        <i className={"bi " + (searching ? "bi-arrow-repeat spin" : "bi-search")} aria-hidden="true" />
        <input
          id="visitor-search"
          type="search"
          className="form-control"
          placeholder="Name, ID number or visitor code (VM-…)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          autoComplete="off"
        />
      </div>

      <ul className="visitor-picker__list" role="listbox" aria-label="Visitors">
        {shown.map((v) => (
          <li key={v.id}>
            <button type="button" className="visitor-picker__item" onClick={() => onPick(v)}>
              <span className="data-row__avatar">{initials(v.full_name)}</span>
              <span className="visitor-picker__text">
                <span className="visitor-picker__name">{v.full_name}</span>
                <span className="muted small">
                  {visitorCode(v.id)} · {v.category}
                  {v.id_number ? ` · ${v.id_number}` : ""}
                </span>
              </span>
              {v.is_inside && (
                <span className="pill green">
                  <i className="bi bi-geo-alt-fill" /> Inside
                </span>
              )}
              <i className="bi bi-chevron-right muted" />
            </button>
          </li>
        ))}
      </ul>
      {shown.length === 0 && (
        <div className="muted small py-2">
          {q ? `No visitor matches “${query.trim()}”.` : "No visitors on this device yet."}
        </div>
      )}
      {results.length > MAX_RESULTS && (
        <div className="muted small pt-2">
          Showing {MAX_RESULTS} of {results.length}. Keep typing to narrow it down.
        </div>
      )}
    </div>
  );
}
