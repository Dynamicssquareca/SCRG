import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import AppLayout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import UploadPage from './pages/UploadPage';
import ReportsPage from './pages/ReportsPage';
import ClientMasterPage from './pages/ClientMasterPage';
import UsageReportPage from './pages/UsageReportPage';
import RemindersPage from './pages/RemindersPage';
import { SpeedInsights } from "@vercel/speed-insights/react";

const ProtectedRoute = ({ children, requireAdmin }: { children: React.ReactNode, requireAdmin?: boolean }) => {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (requireAdmin && user?.role !== 'admin') return <Navigate to="/" replace />;

  return <>{children}</>;
};

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route index element={<DashboardPage />} />
        <Route path="upload" element={<UploadPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="usage" element={<UsageReportPage />} />
        <Route path="clients" element={<ProtectedRoute requireAdmin><ClientMasterPage /></ProtectedRoute>} />
        <Route path="reminders" element={<ProtectedRoute requireAdmin><RemindersPage /></ProtectedRoute>} />
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