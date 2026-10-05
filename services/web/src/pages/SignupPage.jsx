import { useState } from "react";
import { Link } from "react-router-dom";

import { useApp } from "../context/AppContext.jsx";
import { ApiError } from "../api/client.js";

// Public self-service sign-up. Creates a tourist account and signs straight in;
// the server fixes the role, so nothing here can mint an officer account.
export default function SignupPage() {
  const { register, online } = useApp();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("The passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Use a password of at least 8 characters.");
      return;
    }

    setBusy(true);
    try {
      await register(email.trim(), password, fullName.trim());
      // On success the context sets the session and App swaps to the authed app.
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError("An account with this email already exists. Try signing in.");
      } else if (err instanceof ApiError && err.status === 422) {
        setError("Please check your details and enter a valid email address.");
      } else {
        setError("Could not create your account. Please try again online.");
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
          <h1>Visit Murchison Falls National Park</h1>
          <p className="lead">
            Create a free account to book your visit, choose your entry gate and
            manage your trip — all in one place.
          </p>
        </div>
        <div className="auth__features">
          <div className="auth__feature">
            <i className="bi bi-calendar-check" />
            Book your visit date and expected entry point
          </div>
          <div className="auth__feature">
            <i className="bi bi-bell" />
            Get reminders before your trip
          </div>
          <div className="auth__feature">
            <i className="bi bi-journal-check" />
            View and manage your bookings any time
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
              <h2 className="h4 mb-1">Create your account</h2>
              <p className="muted mb-4" style={{ fontSize: "0.9rem" }}>
                Sign up as a visitor to book your trip to the park.
              </p>

              {!online && (
                <div className="alert alert-warning py-2 mb-3">
                  You are offline. Creating an account needs a connection.
                </div>
              )}
              {error && <div className="alert alert-danger py-2 mb-3">{error}</div>}

              <form onSubmit={onSubmit}>
                <div className="mb-3">
                  <label className="form-label">Full name</label>
                  <div className="input-icon">
                    <i className="bi bi-person" />
                    <input
                      className="form-control"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      autoComplete="name"
                      placeholder="e.g. Jane Doe"
                      required
                    />
                  </div>
                </div>
                <div className="mb-3">
                  <label className="form-label">Email</label>
                  <div className="input-icon">
                    <i className="bi bi-envelope" />
                    <input
                      type="email"
                      className="form-control"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      placeholder="you@example.com"
                      required
                    />
                  </div>
                </div>
                <div className="mb-3">
                  <label className="form-label">Password</label>
                  <div className="input-icon">
                    <i className="bi bi-lock" />
                    <input
                      type="password"
                      className="form-control"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      placeholder="At least 8 characters"
                      required
                    />
                  </div>
                </div>
                <div className="mb-4">
                  <label className="form-label">Confirm password</label>
                  <div className="input-icon">
                    <i className="bi bi-lock-fill" />
                    <input
                      type="password"
                      className="form-control"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      autoComplete="new-password"
                      placeholder="Re-enter your password"
                      required
                    />
                  </div>
                </div>
                <button className="btn btn-success w-100" disabled={busy}>
                  {busy ? (
                    <>
                      <i className="bi bi-arrow-repeat spin" /> Creating account…
                    </>
                  ) : (
                    <>
                      <i className="bi bi-person-plus" /> Create account
                    </>
                  )}
                </button>
              </form>

              <p className="text-center muted mt-4 mb-0" style={{ fontSize: "0.9rem" }}>
                Already have an account? <Link to="/login">Sign in</Link>
              </p>
              <p className="text-center mt-2 mb-0" style={{ fontSize: "0.85rem" }}>
                <Link to="/">
                  <i className="bi bi-arrow-left" /> Back to park information
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
