import { useCallback, useEffect, useState } from "react";

import { useApp } from "../context/AppContext.jsx";
import { getVisitors } from "../api/client.js";
import { CATEGORIES } from "../domain/categories.js";
import PageHeader from "../components/PageHeader.jsx";

const PAGE_SIZE = 25;

const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.code, c.label]));

function initials(name) {
  return (name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
}

export default function VisitorsPage() {
  const { session, online } = useApp();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState({ total: 0, items: [] });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await getVisitors(session.token, {
        search,
        category,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setData(res);
    } catch {
      setError("Could not load the visitor registry. It needs a live connection to the central system.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.token, search, category, page]);

  useEffect(() => {
    if (online) load();
    else setLoading(false);
  }, [online, load]);

  function onSearchSubmit(e) {
    e.preventDefault();
    setPage(0);
    load();
  }

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const showingFrom = data.total === 0 ? 0 : page * PAGE_SIZE + 1;
  const showingTo = Math.min(data.total, (page + 1) * PAGE_SIZE);

  return (
    <>
      <PageHeader
        icon="bi-people"
        title="Visitor registry"
        subtitle="Every visitor synced to the central system, park-wide"
        actions={
          <button className="btn btn-ghost" onClick={load} disabled={!online || loading}>
            <i className={"bi bi-arrow-repeat" + (loading ? " spin" : "")} /> Refresh
          </button>
        }
      />

      {!online && (
        <div className="alert alert-warning">
          The registry reflects central data and is unavailable offline. Reconnect to browse visitors.
        </div>
      )}
      {error && <div className="alert alert-danger">{error}</div>}

      <div className="surface-card p-4">
        <form className="row g-2 align-items-end mb-3" onSubmit={onSearchSubmit}>
          <div className="col-sm-6 col-lg-5">
            <label className="form-label">Search</label>
            <div className="input-icon">
              <i className="bi bi-search" />
              <input
                className="form-control"
                placeholder="Name or ID number"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="col-sm-4 col-lg-4">
            <label className="form-label">Category</label>
            <select
              className="form-select"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(0);
              }}
            >
              <option value="">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="col-sm-2 col-lg-3">
            <button className="btn btn-success w-100" type="submit" disabled={!online || loading}>
              <i className="bi bi-search" /> Search
            </button>
          </div>
        </form>

        {data.items.length === 0 && !loading ? (
          <div className="empty-state">
            <i className="bi bi-people" />
            <p className="mb-0">No visitors match this filter.</p>
          </div>
        ) : (
          <>
            <div className="table-responsive">
              <table className="table align-middle mb-0">
                <thead>
                  <tr>
                    <th>Visitor</th>
                    <th>ID number</th>
                    <th>Category</th>
                    <th>Nationality</th>
                    <th>Visits</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((v) => (
                    <tr key={v.id}>
                      <td>
                        <div className="data-row__avatar d-inline-flex me-2">{initials(v.full_name)}</div>
                        {v.full_name}
                      </td>
                      <td className="muted">{v.id_number}</td>
                      <td>{CATEGORY_LABEL[v.category] || v.category}</td>
                      <td className="muted">{v.nationality || "—"}</td>
                      <td>{v.visit_count}</td>
                      <td>
                        {v.is_inside ? (
                          <span className="pill active">Inside park</span>
                        ) : (
                          <span className="pill neutral">Not inside</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="d-flex justify-content-between align-items-center mt-3">
              <span className="muted small-caps">
                {showingFrom}–{showingTo} of {data.total}
              </span>
              <div className="d-flex gap-2">
                <button
                  className="btn btn-ghost"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0 || loading}
                >
                  <i className="bi bi-chevron-left" /> Prev
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))}
                  disabled={page + 1 >= totalPages || loading}
                >
                  Next <i className="bi bi-chevron-right" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
