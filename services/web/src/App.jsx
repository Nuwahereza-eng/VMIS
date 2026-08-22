import { Navigate, Route, Routes } from "react-router-dom";

import { useApp } from "./context/AppContext.jsx";
import Layout from "./components/Layout.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import VerifyPage from "./pages/VerifyPage.jsx";
import ActivitiesPage from "./pages/ActivitiesPage.jsx";
import VisitsPage from "./pages/VisitsPage.jsx";
import SyncPage from "./pages/SyncPage.jsx";

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

  const isManagement = session.role === "management";
  const home = isManagement ? "/dashboard" : "/register";

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to={home} replace />} />
        {isManagement && <Route path="/dashboard" element={<DashboardPage />} />}
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify" element={<VerifyPage />} />
        <Route path="/visits" element={<VisitsPage />} />
        <Route path="/activities" element={<ActivitiesPage />} />
        <Route path="/sync" element={<SyncPage />} />
        <Route path="*" element={<Navigate to={home} replace />} />
      </Routes>
    </Layout>
  );
}
