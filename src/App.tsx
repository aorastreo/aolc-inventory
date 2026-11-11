import { Routes, Route, Navigate } from "react-router";
import { TRPCProvider } from "@/providers/trpc";
import { useLocalAuth } from "@/hooks/useLocalAuth";
import { ActiveStoreProvider } from "@/hooks/useActiveStore";
import LoginLocalPage from "@/pages/LoginLocal";
import NotFoundPage from "@/pages/NotFound";
import DashboardPage from "@/pages/Dashboard";
import PalletsPage from "@/pages/Pallets";
import ProductsPage from "@/pages/Products";
import PalletHubPage from "@/pages/PalletHub";
import AdjustmentsPage from "@/pages/Adjustments";
import TransfersPage from "@/pages/Transfers";
import ClosingsPage from "@/pages/Closings";
import SettingsPage from "@/pages/Settings";
import CatalogPage from "@/pages/Catalog";
import LabelsPage from "@/pages/Labels";
import LabelConfigPage from "@/pages/LabelConfig";
import PayrollPage from "@/pages/Payroll";
import FinancePage from "@/pages/Finance";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { useEffect, useState } from "react";

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 768px)").matches : true,
  );

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => setIsDesktop(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return isDesktop;
}

function AppLayout({ children }: { children: React.ReactNode }) {
  const isDesktop = useIsDesktop();
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (isDesktop) setMobileOpen(false);
  }, [isDesktop]);

  // Prevent body scroll when mobile drawer is open
  useEffect(() => {
    if (!isDesktop && mobileOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [isDesktop, mobileOpen]);

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] bg-gray-50 overflow-hidden">
      {!isDesktop && mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/45 border-0 cursor-pointer"
          aria-label="Cerrar menu"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <Sidebar
        open={desktopOpen}
        onToggle={() => setDesktopOpen((o) => !o)}
        isDesktop={isDesktop}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header
          onMenuClick={() => {
            if (isDesktop) setDesktopOpen((o) => !o);
            else setMobileOpen((o) => !o);
          }}
        />
        <main className="flex-1 overflow-auto overflow-x-hidden p-3 sm:p-4 md:p-6 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {children}
        </main>
      </div>
    </div>
  );
}

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) {
  const { user, isLoading, role } = useLocalAuth();
  if (isLoading) return <div className="flex items-center justify-center h-[100dvh]">Cargando...</div>;
  if (!user) return <Navigate to="/login" replace />;

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return <Navigate to="/closings" replace />;
  }

  return <AppLayout>{children}</AppLayout>;
}

function RootRedirect() {
  const { user, isLoading } = useLocalAuth();
  if (isLoading) return <div className="flex items-center justify-center h-[100dvh]">Cargando...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <DashboardPage />;
}

function App() {
  return (
    <TRPCProvider>
      <ActiveStoreProvider>
        <Routes>
          <Route path="/login" element={<LoginLocalPage />} />
          <Route path="/" element={<ProtectedRoute><RootRedirect /></ProtectedRoute>} />
          <Route path="/pallets" element={<ProtectedRoute allowedRoles={["admin", "manager"]}><PalletsPage /></ProtectedRoute>} />
          <Route path="/pallets/:palletId" element={<ProtectedRoute allowedRoles={["admin", "manager"]}><PalletHubPage /></ProtectedRoute>} />
          <Route path="/pallets/:palletId/products" element={<ProtectedRoute allowedRoles={["admin", "manager"]}><ProductsPage /></ProtectedRoute>} />
          <Route path="/adjustments" element={<ProtectedRoute allowedRoles={["admin", "manager"]}><AdjustmentsPage /></ProtectedRoute>} />
          <Route path="/transfers" element={<ProtectedRoute allowedRoles={["admin", "manager"]}><TransfersPage /></ProtectedRoute>} />
          <Route path="/closings" element={<ProtectedRoute allowedRoles={["admin", "manager", "employee"]}><ClosingsPage /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute allowedRoles={["admin"]}><SettingsPage /></ProtectedRoute>} />
          <Route path="/label-config" element={<ProtectedRoute allowedRoles={["admin", "manager"]}><LabelConfigPage /></ProtectedRoute>} />
          <Route path="/catalog" element={<ProtectedRoute allowedRoles={["admin", "manager"]}><CatalogPage /></ProtectedRoute>} />
          <Route path="/labels" element={<ProtectedRoute allowedRoles={["admin", "manager", "employee"]}><LabelsPage /></ProtectedRoute>} />
          <Route path="/payroll" element={<ProtectedRoute allowedRoles={["admin", "manager"]}><PayrollPage /></ProtectedRoute>} />
          <Route path="/finance" element={<ProtectedRoute allowedRoles={["admin", "manager"]}><FinancePage /></ProtectedRoute>} />
          <Route path="*" element={<ProtectedRoute><NotFoundPage /></ProtectedRoute>} />
        </Routes>
      </ActiveStoreProvider>
    </TRPCProvider>
  );
}

export default App;
