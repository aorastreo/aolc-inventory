import { Routes, Route, Navigate } from "react-router";
import { TRPCProvider } from "@/providers/trpc";
import { useLocalAuth } from "@/hooks/useLocalAuth";
import LoginLocalPage from "@/pages/LoginLocal";
import NotFoundPage from "@/pages/NotFound";
import DashboardPage from "@/pages/Dashboard";
import PalletsPage from "@/pages/Pallets";
import ProductsPage from "@/pages/Products";
import AdjustmentsPage from "@/pages/Adjustments";
import ClosingsPage from "@/pages/Closings";
import SettingsPage from "@/pages/Settings";
import CatalogPage from "@/pages/Catalog";
import LabelsPage from "@/pages/Labels";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { useState } from "react";

function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) {
  const { user, isLoading, role } = useLocalAuth();
  if (isLoading) return <div className="flex items-center justify-center h-screen">Cargando...</div>;
  if (!user) return <Navigate to="/login" replace />;

  // If role restrictions are specified and user doesn't have permission, redirect
  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return <Navigate to="/closings" replace />;
  }

  return <AppLayout>{children}</AppLayout>;
}

// Redirect root based on role
function RootRedirect() {
  const { user, isLoading, isEmployee } = useLocalAuth();
  if (isLoading) return <div className="flex items-center justify-center h-screen">Cargando...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (isEmployee) return <Navigate to="/closings" replace />;
  return <DashboardPage />;
}

function App() {
  return (
    <TRPCProvider>
      <Routes>
        <Route path="/login" element={<LoginLocalPage />} />
        <Route path="/" element={<ProtectedRoute><RootRedirect /></ProtectedRoute>} />
        <Route path="/pallets" element={<ProtectedRoute allowedRoles={["admin", "manager"]}><PalletsPage /></ProtectedRoute>} />
        <Route path="/pallets/:palletId/products" element={<ProtectedRoute allowedRoles={["admin", "manager"]}><ProductsPage /></ProtectedRoute>} />
        <Route path="/adjustments" element={<ProtectedRoute allowedRoles={["admin", "manager"]}><AdjustmentsPage /></ProtectedRoute>} />
        <Route path="/closings" element={<ProtectedRoute allowedRoles={["admin", "manager", "employee"]}><ClosingsPage /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute allowedRoles={["admin"]}><SettingsPage /></ProtectedRoute>} />
        <Route path="/catalog" element={<ProtectedRoute allowedRoles={["admin", "manager"]}><CatalogPage /></ProtectedRoute>} />
        <Route path="/labels" element={<ProtectedRoute allowedRoles={["admin", "manager", "employee"]}><LabelsPage /></ProtectedRoute>} />
        <Route path="*" element={<ProtectedRoute><NotFoundPage /></ProtectedRoute>} />
      </Routes>
    </TRPCProvider>
  );
}

export default App;
