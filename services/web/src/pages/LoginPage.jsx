import { useState } from "react";

import { useApp } from "../context/AppContext.jsx";
import { ApiError } from "../api/client.js";

export default function LoginPage() {
  const { login, online } = useApp();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("Invalid username or password.");
      } else {
        setError("Sign-in requires a connection the first time. Please try again online.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 420 }}>
      <div className="text-center my-5">
        <h1 className="h3 text-success fw-bold">VMIS</h1>
        <p className="text-muted">Murchison Falls National Park</p>
      </div>
      <div className="card shadow-sm">
        <div className="card-body">
          <h2 className="h5 mb-3">Officer sign in</h2>
          {!online && (
            <div className="alert alert-warning py-2">
              You are offline. The first sign-in needs a connection.
            </div>
          )}
          {error && <div className="alert alert-danger py-2">{error}</div>}
          <form onSubmit={onSubmit}>
            <div className="mb-3">
              <label className="form-label">Username</label>
              <input
                className="form-control"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
            <div className="mb-3">
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-control"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <button className="btn btn-success w-100" disabled={busy}>
              {busy ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
