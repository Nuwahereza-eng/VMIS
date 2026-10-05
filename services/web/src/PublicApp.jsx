import { Navigate, Route, Routes } from "react-router-dom";

import PublicLayout from "./components/PublicLayout.jsx";
import PublicParkInfoPage from "./pages/PublicParkInfoPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import SignupPage from "./pages/SignupPage.jsx";

// Routing for visitors who are not signed in. They can explore park
// information freely; signing in or creating an account unlocks booking. Auth
// pages render full-screen (their own layout); everything else sits inside the
// public chrome.
export default function PublicApp() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route
        path="/"
        element={
          <PublicLayout>
            <PublicParkInfoPage />
          </PublicLayout>
        }
      />
      {/* Any deep link falls back to the public landing so a stale bookmark
          (e.g. /my-bookings) lands somewhere sensible rather than erroring. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
