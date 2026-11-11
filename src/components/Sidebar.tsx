import { Link, useLocation } from "react-router";
import { useLocalAuth } from "@/hooks/useLocalAuth";
import { useActiveStore } from "@/hooks/useActiveStore";
import {
  LayoutDashboard,
  Package,
  ClipboardList,
  Receipt,
  Settings,
  Store,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Database,
  Tag,
  Printer,
  ArrowLeftRight,
  Banknote,
  Wallet,
  X,
} from "lucide-react";

const menuItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "manager"] },
  { path: "/finance", label: "Finanzas", icon: Wallet, roles: ["admin", "manager"] },
  { path: "/pallets", label: "Contenedores", icon: Package, roles: ["admin", "manager"] },
  { path: "/adjustments", label: "Ajustes", icon: ClipboardList, roles: ["admin", "manager"] },
  { path: "/transfers", label: "Transferencias", icon: ArrowLeftRight, roles: ["admin", "manager"] },
  { path: "/closings", label: "Cierres", icon: Receipt, roles: ["admin", "manager", "employee"] },
  { path: "/catalog", label: "Catalogo", icon: Database, roles: ["admin", "manager"] },
  { path: "/labels", label: "Etiquetas", icon: Tag, roles: ["admin", "manager", "employee"] },
  { path: "/label-config", label: "Config. Etiquetas", icon: Printer, roles: ["admin", "manager"] },
  { path: "/payroll", label: "Planilla", icon: Banknote, roles: ["admin", "manager"] },
  { path: "/settings", label: "Configuracion", icon: Settings, roles: ["admin"] },
];

type SidebarProps = {
  /** Desktop collapsed/expanded */
  open: boolean;
  onToggle: () => void;
  isDesktop: boolean;
  /** Mobile drawer visibility */
  mobileOpen: boolean;
  onCloseMobile: () => void;
};

export function Sidebar({ open, onToggle, isDesktop, mobileOpen, onCloseMobile }: SidebarProps) {
  const location = useLocation();
  const { logout, user, role } = useLocalAuth();
  const { storeId, setStoreId, canSwitchStore, stores, storeName } = useActiveStore();

  const visibleItems = menuItems.filter(item => item.roles.includes(role || "admin"));
  // On mobile drawer always show labels; on desktop respect collapse
  const expanded = isDesktop ? open : true;
  const visible = isDesktop || mobileOpen;

  return (
    <aside
      className={[
        "flex flex-col border-r transition-transform duration-300 ease-out",
        isDesktop ? "relative h-full shrink-0 z-20" : "fixed inset-y-0 left-0 z-50 h-full w-[min(18rem,88vw)]",
        !isDesktop && !mobileOpen ? "-translate-x-full pointer-events-none" : "translate-x-0",
      ].join(" ")}
      style={{
        width: isDesktop ? (expanded ? "16rem" : "4rem") : undefined,
        background: "hsl(207 55% 12%)",
        borderColor: "hsl(207 40% 20%)",
        paddingTop: !isDesktop ? "env(safe-area-inset-top)" : undefined,
        paddingBottom: !isDesktop ? "env(safe-area-inset-bottom)" : undefined,
      }}
      aria-hidden={!visible}
    >
      {/* Desktop collapse toggle */}
      {isDesktop && (
        <button
          type="button"
          onClick={onToggle}
          className="absolute -right-3 top-20 w-6 h-6 rounded-full flex items-center justify-center z-50 border-2 transition-colors"
          style={{
            background: "hsl(354 78% 42%)",
            borderColor: "hsl(354 78% 32%)",
          }}
          aria-label={expanded ? "Contraer menu" : "Expandir menu"}
        >
          {expanded ? (
            <ChevronLeft className="w-3 h-3 text-white" />
          ) : (
            <ChevronRight className="w-3 h-3 text-white" />
          )}
        </button>
      )}

      {/* Logo + mobile close */}
      <div
        className="flex items-center justify-between border-b min-h-14"
        style={{ borderColor: "hsl(207 40% 20%)" }}
      >
        {expanded ? (
          <div className="flex items-center gap-3 px-4 py-3 w-full">
            <img
              src="/logo.jpg"
              alt="American Outlet"
              className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
              style={{ background: "white" }}
            />
            <div className="overflow-hidden flex-1 min-w-0">
              <h1 className="text-sm font-bold text-white leading-tight tracking-tight">American Outlet</h1>
              <p className="text-[10px] font-medium leading-tight uppercase" style={{ color: "hsl(354 78% 60%)" }}>
                {storeName}
              </p>
            </div>
            {!isDesktop && (
              <button
                type="button"
                onClick={onCloseMobile}
                className="p-2 rounded-lg shrink-0"
                style={{ color: "hsl(210 20% 80%)" }}
                aria-label="Cerrar menu"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        ) : (
          <div className="w-full flex justify-center py-3">
            <img
              src="/logo.jpg"
              alt="AO"
              className="w-9 h-9 rounded-lg object-cover"
              style={{ background: "white" }}
            />
          </div>
        )}
      </div>

      {/* Store Selector */}
      {expanded && stores.length > 0 && (
        <div className="px-3 py-3 border-b" style={{ borderColor: "hsl(207 40% 20%)" }}>
          {canSwitchStore ? (
            <select
              value={storeId}
              onChange={(e) => setStoreId(Number(e.target.value))}
              className="w-full text-sm rounded-lg px-3 py-2.5 border focus:outline-none min-h-11"
              style={{
                background: "hsl(207 55% 18%)",
                borderColor: "hsl(207 40% 25%)",
                color: "hsl(210 20% 90%)",
              }}
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id} style={{ background: "hsl(207 55% 18%)" }}>
                  {s.name}
                </option>
              ))}
            </select>
          ) : (
            <div
              className="w-full text-sm rounded-lg px-3 py-2.5 border truncate"
              style={{
                background: "hsl(207 55% 18%)",
                borderColor: "hsl(207 40% 25%)",
                color: "hsl(210 20% 90%)",
              }}
              title={storeName}
            >
              {storeName}
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto overscroll-contain">
        {visibleItems.map((item) => {
          const isActive = location.pathname === item.path || (item.path !== "/" && location.pathname.startsWith(item.path));
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => { if (!isDesktop) onCloseMobile(); }}
              className="flex items-center gap-3 rounded-lg transition-all duration-200 group relative min-h-11"
              style={{
                padding: expanded ? "0.7rem 0.875rem" : "0.7rem",
                justifyContent: expanded ? "flex-start" : "center",
                margin: "0 0.25rem",
                background: isActive ? "hsl(354 78% 42%)" : "transparent",
                color: isActive ? "white" : "hsl(210 20% 70%)",
              }}
              title={!expanded ? item.label : undefined}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {expanded && <span className="text-sm font-medium">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User & Logout */}
      <div className="border-t p-3" style={{ borderColor: "hsl(207 40% 20%)" }}>
        {expanded && (
          <div className="flex items-center gap-3 px-2 py-2 mb-2">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: "hsl(207 55% 25%)" }}
            >
              <Store className="w-4 h-4" style={{ color: "hsl(210 20% 80%)" }} />
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-medium text-white truncate">{user?.name || "Admin"}</p>
              <p className="text-[10px] truncate" style={{ color: "hsl(210 20% 55%)" }}>{user?.role || "admin"}</p>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={logout}
          className="flex items-center gap-3 rounded-lg transition-all duration-200 w-full min-h-11"
          style={{
            padding: expanded ? "0.5rem 0.75rem" : "0.5rem",
            justifyContent: expanded ? "flex-start" : "center",
            color: "hsl(210 20% 55%)",
          }}
          title={!expanded ? "Cerrar Sesion" : undefined}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {expanded && <span className="text-sm">Cerrar Sesion</span>}
        </button>
      </div>
    </aside>
  );
}
