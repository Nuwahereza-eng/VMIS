import { Navigate, Route, Routes } from "react-router-dom";

import { useApp } from "./context/AppContext.jsx";
import Layout from "./components/Layout.jsx";
import { homeForRole, navItemsForRole } from "./nav.js";
import LoginPage from "./pages/LoginPage.jsx";
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
import SyncPage from "./pages/SyncPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";
import UsersPage from "./pages/UsersPage.jsx";
import ConfigurationPage from "./pages/ConfigurationPage.jsx";

export default function App() {
  const { ready, session } = useApp();

  if (!ready) {
    return (
      <div className="d-flex vh-100 align-items-center justify-content-center">
        <div className="spinner-border text-success" role="status" aria-label="Loading" />
      </div>
    );
  }

  if (!session) {
    return <LoginPage />;
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
        {allowed.has("/activities") && <Route path="/activities" element={<ActivitiesPage />} />}
        {allowed.has("/accommodation") && <Route path="/accommodation" element={<AccommodationPage />} />}
        {allowed.has("/payments") && <Route path="/payments" element={<PaymentsPage />} />}
        {allowed.has("/visits") && <Route path="/visits" element={<VisitsPage />} />}
        {allowed.has("/alerts") && <Route path="/alerts" element={<AlertsPage />} />}
        {allowed.has("/reports") && <Route path="/reports" element={<ReportsPage />} />}
        <Route path="/sync" element={<SyncPage />} />
        {allowed.has("/settings") && <Route path="/settings" element={<SettingsPage />} />}
        {allowed.has("/users") && <Route path="/users" element={<UsersPage />} />}
        {allowed.has("/config") && <Route path="/config" element={<ConfigurationPage />} />}
        <Route path="*" element={<Navigate to={home} replace />} />
      </Routes>
    </Layout>
  );
}
