// File: src/App.jsx
import { Routes, Route, Navigate, useLocation } from "react-router-dom";

// Public pages
import Landing from "./pages/Landing.jsx";
import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";

// Auth'd pages
import Leads from "./pages/Leads.jsx";
import TradeCenter from "./pages/TradeCenter.jsx";

// Manager pages (gated)
import ManagerDashboard from "./pages/ManagerDashboard.jsx";
import ManagerImports from "./pages/ManagerImports.jsx";
import ManagerLeads from "./pages/ManagerLeads.jsx";

// Shell
import Nav from "./components/Nav.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import RoleGate from "./components/RoleGate.jsx";

export default function App() {
  const location = useLocation();
  const path = location.pathname;

  // Hide Nav on very public pages
  const HIDE_NAV_ON = new Set(["/", "/login", "/signup"]);
  const hideNav = HIDE_NAV_ON.has(path);

  const routes = (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      {/* Auth required */}
      <Route element={<ProtectedRoute />}>
        <Route path="/leads" element={<Leads />} />
        <Route path="/trades" element={<TradeCenter />} />

        {/* Manager-only */}
        <Route element={<RoleGate role="manager" />}>
          <Route path="/manager" element={<ManagerDashboard />} />
          <Route path="/manager/imports" element={<ManagerImports />} />
          <Route path="/manager/leads" element={<ManagerLeads />} />
        </Route>
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );

  return (
    <div className="min-h-screen">
      {!hideNav && <Nav />}

      {/* Center the app content for all "inside" pages */}
      {hideNav ? (
        // Landing / Login / Signup can go full-width
        routes
      ) : (
        <div className="max-w-6xl mx-auto p-4">{routes}</div>
      )}
    </div>
  );
}
