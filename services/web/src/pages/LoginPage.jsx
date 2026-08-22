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
    <div className="auth">
      <div className="auth__brand">
        <div>
          <img className="auth__logo" src="/icon-192.png" alt="VMIS" />
        </div>
        <div>
          <h1>Visitor Management Information System</h1>
          <p className="lead">
            One record per visitor for Murchison Falls National Park, tracked
            from gate to game drive, and dependable even when the network is not.
          </p>
        </div>
        <div className="auth__features">
          <div className="auth__feature">
            <i className="bi bi-wifi-off" />
            Works fully offline at every gate and station
          </div>
          <div className="auth__feature">
            <i className="bi bi-qr-code-scan" />
            Instant QR verification and live ticket validity
          </div>
          <div className="auth__feature">
            <i className="bi bi-shield-check" />
            Role-based access, audit trail, and data-protection by design
          </div>
        </div>
      </div>

      <div className="auth__form-wrap">
        <div className="auth__card">
          <div className="text-center mb-4 d-lg-none">
            <img src="/logo.png" alt="VMIS" width={120} height={120} />
          </div>
          <div className="card shadow-sm">
            <div className="card-body p-4">
              <h2 className="h4 mb-1">Welcome back</h2>
              <p className="muted mb-4" style={{ fontSize: "0.9rem" }}>
                Sign in to your officer account to continue.
              </p>

              {!online && (
                <div className="alert alert-warning py-2 mb-3">
                  You are offline. The first sign-in on this device needs a connection.
                </div>
              )}
              {error && <div className="alert alert-danger py-2 mb-3">{error}</div>}

              <form onSubmit={onSubmit}>
                <div className="mb-3">
                  <label className="form-label">Username</label>
                  <div className="input-icon">
                    <i className="bi bi-person" />
                    <input
                      className="form-control"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      autoComplete="username"
                      placeholder="e.g. gate1"
                      required
                    />
                  </div>
                </div>
                <div className="mb-4">
                  <label className="form-label">Password</label>
                  <div className="input-icon">
                    <i className="bi bi-lock" />
                    <input
                      type="password"
                      className="form-control"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      required
                    />
                  </div>
                </div>
                <button className="btn btn-success w-100" disabled={busy}>
                  {busy ? (
                    <>
                      <i className="bi bi-arrow-repeat spin" /> Signing in…
                    </>
                  ) : (
                    <>
                      <i className="bi bi-box-arrow-in-right" /> Sign in
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
          <p className="text-center muted mt-3" style={{ fontSize: "0.8rem" }}>
            Uganda Wildlife Authority · Synthetic data for development use
          </p>
        </div>
      </div>
    </div>
  );
}
