import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import AppLayout from './components/Layout';
import LoginPage from './pages/LoginPage';
import SetupTOTPPage from './pages/SetupTOTPPage';
import DashboardPage from './pages/DashboardPage';
import UploadPage from './pages/UploadPage';
import ReportsPage from './pages/ReportsPage';
import ClientMasterPage from './pages/ClientMasterPage';
import UsageReportPage from './pages/UsageReportPage';
import RemindersPage from './pages/RemindersPage';
import ClientCredentialsPage from './pages/ClientCredentialsPage';
import ClientPortalDashboard from './pages/ClientPortal/ClientPortalDashboard';
import AuthDevicesPage from './pages/AuthDevicesPage';
import ReportSchedulerPage from './pages/ReportSchedulerPage';
import { SpeedInsights } from "@vercel/speed-insights/react";

const ProtectedRoute = ({ children, requireAdmin }: { children: React.ReactNode, requireAdmin?: boolean }) => {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  // Redirect client-role users away from internal admin routes
  if (user?.role === 'client') return <Navigate to="/portal" replace />;
  if (requireAdmin && user?.role !== 'admin') return <Navigate to="/" replace />;

  return <>{children}</>;
};

const ClientRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  // Only allow client-role users to access the portal
  if (user?.role !== 'client') return <Navigate to="/" replace />;

  return <>{children}</>;
};

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/setup-2fa" element={<SetupTOTPPage />} />
      {/* Client Portal - standalone, no sidebar */}
      <Route path="/portal" element={<ClientRoute><ClientPortalDashboard /></ClientRoute>} />
      {/* Internal Admin/Operator routes */}
      <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route index element={<DashboardPage />} />
        <Route path="upload" element={<UploadPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="usage" element={<UsageReportPage />} />
        <Route path="clients" element={<ProtectedRoute requireAdmin><ClientMasterPage /></ProtectedRoute>} />
        <Route path="reminders" element={<ProtectedRoute requireAdmin><RemindersPage /></ProtectedRoute>} />
        <Route path="report-scheduler" element={<ProtectedRoute requireAdmin><ReportSchedulerPage /></ProtectedRoute>} />
        <Route path="credentials" element={<ProtectedRoute requireAdmin><ClientCredentialsPage /></ProtectedRoute>} />
        <Route path="auth-devices" element={<ProtectedRoute requireAdmin><AuthDevicesPage /></ProtectedRoute>} />
      </Route>
    </Routes>
  );
};

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SpeedInsights />
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;