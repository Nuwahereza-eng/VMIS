import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { useApp } from "./context/AppContext.jsx";
import Layout from "./components/Layout.jsx";
import PublicApp from "./PublicApp.jsx";
import { homeForRole, navItemsForRole } from "./nav.js";
import DashboardPage from "./pages/DashboardPage.jsx";
import VisitorsPage from "./pages/VisitorsPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import VerifyPage from "./pages/VerifyPage.jsx";
import ActivitiesPage from "./pages/ActivitiesPage.jsx";
import AccommodationPage from "./pages/AccommodationPage.jsx";
import PaymentsPage from "./pages/PaymentsPage.jsx";
import VisitsPage from "./pages/VisitsPage.jsx";
import AlertsPage from "./pages/AlertsPage.jsx";
import ReportsPage from "./pages/ReportsPage.jsx";
import ReconciliationPage from "./pages/ReconciliationPage.jsx";
import RemindersPage from "./pages/RemindersPage.jsx";
import TouristInfoPage from "./pages/TouristInfoPage.jsx";
import SyncPage from "./pages/SyncPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";
import UsersPage from "./pages/UsersPage.jsx";
import ConfigurationPage from "./pages/ConfigurationPage.jsx";
import BookingsPage from "./pages/BookingsPage.jsx";
import BookVisitPage from "./pages/BookVisitPage.jsx";
import MyBookingsPage from "./pages/MyBookingsPage.jsx";
import MyVisitPage from "./pages/MyVisitPage.jsx";
import TourPage from "./pages/TourPage.jsx";
import LiveTrackingPage from "./pages/LiveTrackingPage.jsx";
import PointsOfInterestPage from "./pages/PointsOfInterestPage.jsx";

// The visitor tour page opens from a gate QR or a per-visitor QR on the
// visitor's own phone. It needs no account, works offline, and looks the same
// whoever (if anyone) is signed in on that phone.
function isTourPath(pathname) {
  return pathname === "/tour" || pathname.startsWith("/tour/");
}

export default function App() {
  const { ready, session } = useApp();
  const location = useLocation();

  if (isTourPath(location.pathname)) {
    return (
      <Routes>
        <Route path="/tour" element={<TourPage />} />
        <Route path="/tour/gate/:gate" element={<TourPage />} />
        <Route path="*" element={<Navigate to="/tour" replace />} />
      </Routes>
    );
  }

  if (!ready) {
    return (
      <div className="d-flex vh-100 align-items-center justify-content-center">
        <div className="spinner-border text-success" role="status" aria-label="Loading" />
      </div>
    );
  }

  if (!session) {
    return <PublicApp />;
  }

  // Only render routes this role is permitted to reach, so a deep-link or a
  // stale bookmark can't land an officer on a page the server would 403.
  const allowed = new Set(navItemsForRole(session.role).map((i) => i.to));
  const home = homeForRole(session.role);

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to={home} replace />} />
        {allowed.has("/dashboard") && <Route path="/dashboard" element={<DashboardPage />} />}
        {allowed.has("/visitors") && <Route path="/visitors" element={<VisitorsPage />} />}
        {allowed.has("/register") && <Route path="/register" element={<RegisterPage />} />}
        {allowed.has("/verify") && <Route path="/verify" element={<VerifyPage />} />}
        {allowed.has("/bookings") && <Route path="/bookings" element={<BookingsPage />} />}
        {allowed.has("/my-visit") && <Route path="/my-visit" element={<MyVisitPage />} />}
        {allowed.has("/book") && <Route path="/book" element={<BookVisitPage />} />}
        {allowed.has("/my-bookings") && <Route path="/my-bookings" element={<MyBookingsPage />} />}
        {allowed.has("/activities") && <Route path="/activities" element={<ActivitiesPage />} />}
        {allowed.has("/accommodation") && <Route path="/accommodation" element={<AccommodationPage />} />}
        {allowed.has("/payments") && <Route path="/payments" element={<PaymentsPage />} />}
        {allowed.has("/visits") && <Route path="/visits" element={<VisitsPage />} />}
        {allowed.has("/alerts") && <Route path="/alerts" element={<AlertsPage />} />}
        {allowed.has("/live-tracking") && <Route path="/live-tracking" element={<LiveTrackingPage />} />}
        {allowed.has("/points-of-interest") && <Route path="/points-of-interest" element={<PointsOfInterestPage />} />}
        {allowed.has("/reports") && <Route path="/reports" element={<ReportsPage />} />}
        {allowed.has("/reconciliation") && <Route path="/reconciliation" element={<ReconciliationPage />} />}
        {allowed.has("/reminders") && <Route path="/reminders" element={<RemindersPage />} />}
        <Route path="/sync" element={<SyncPage />} />
        <Route path="/park-info" element={<TouristInfoPage />} />
        {allowed.has("/settings") && <Route path="/settings" element={<SettingsPage />} />}
        {allowed.has("/users") && <Route path="/users" element={<UsersPage />} />}
        {allowed.has("/config") && <Route path="/config" element={<ConfigurationPage />} />}
        <Route path="*" element={<Navigate to={home} replace />} />
      </Routes>
    </Layout>
  );
}
