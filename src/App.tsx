import { Routes, Route, Navigate } from "react-router";
import { TRPCProvider } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import LoginPage from "@/pages/Login";
import NotFoundPage from "@/pages/NotFound";
import DashboardPage from "@/pages/Dashboard";
import PalletsPage from "@/pages/Pallets";
import ProductsPage from "@/pages/Products";
import AdjustmentsPage from "@/pages/Adjustments";
import ClosingsPage from "@/pages/Closings";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { useState } from "react";

function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar open={sidebarOpen} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="flex items-center justify-center h-screen">Cargando...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function App() {
  return (
    <TRPCProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/pallets" element={<ProtectedRoute><PalletsPage /></ProtectedRoute>} />
        <Route path="/pallets/:palletId/products" element={<ProtectedRoute><ProductsPage /></ProtectedRoute>} />
        <Route path="/adjustments" element={<ProtectedRoute><AdjustmentsPage /></ProtectedRoute>} />
        <Route path="/closings" element={<ProtectedRoute><ClosingsPage /></ProtectedRoute>} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </TRPCProvider>
  );
}

export default App;
