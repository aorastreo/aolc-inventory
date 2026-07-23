import { Link, useLocation } from "react-router";
import { useLocalAuth } from "@/hooks/useLocalAuth";
import { trpc } from "@/providers/trpc";
import { useState } from "react";
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
  ShoppingBag,
  Database,
  Tag,
  Printer,
} from "lucide-react";

const menuItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "manager"] },
  { path: "/pallets", label: "Contenedores", icon: Package, roles: ["admin", "manager"] },
  { path: "/adjustments", label: "Ajustes", icon: ClipboardList, roles: ["admin", "manager"] },
  { path: "/closings", label: "Cierres", icon: Receipt, roles: ["admin", "manager", "employee"] },
  { path: "/catalog", label: "Catalogo", icon: Database, roles: ["admin", "manager"] },
  { path: "/labels", label: "Etiquetas", icon: Tag, roles: ["admin", "manager", "employee"] },
  { path: "/label-config", label: "Config. Etiquetas", icon: Printer, roles: ["admin", "manager"] },
  { path: "/settings", label: "Configuracion", icon: Settings, roles: ["admin"] },
];

export function Sidebar({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const location = useLocation();
  const { logout, user, role } = useLocalAuth();
  const { data: stores } = trpc.inventory.stores.useQuery();
  const [selectedStore, setSelectedStore] = useState("los-chiles");

  const visibleItems = menuItems.filter(item => item.roles.includes(role || "admin"));

  return (
    <aside
      className="relative flex flex-col transition-all duration-300 border-r"
      style={{
        width: open ? "16rem" : "4rem",
        background: "hsl(207 55% 12%)",
        borderColor: "hsl(207 40% 20%)",
      }}
    >
      {/* Toggle button */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-20 w-6 h-6 rounded-full flex items-center justify-center z-50 border-2 transition-colors"
        style={{
          background: "hsl(354 78% 42%)",
          borderColor: "hsl(354 78% 32%)",
        }}
      >
        {open ? (
          <ChevronLeft className="w-3 h-3 text-white" />
        ) : (
          <ChevronRight className="w-3 h-3 text-white" />
        )}
      </button>

      {/* Logo */}
      <div
        className="flex items-center justify-center border-b"
        style={{ borderColor: "hsl(207 40% 20%)" }}
      >
        {open ? (
          <div className="flex items-center gap-3 px-4 py-3 w-full">
            <img
              src="/logo.jpg"
              alt="American Outlet"
              className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
              style={{ background: "white" }}
            />
            <div className="overflow-hidden">
              <h1 className="text-sm font-bold text-white leading-tight tracking-tight">American Outlet</h1>
              <p className="text-[10px] font-medium leading-tight" style={{ color: "hsl(354 78% 60%)" }}>
                LOS CHILES
              </p>
            </div>
          </div>
        ) : (
          <img
            src="/logo.jpg"
            alt="AO"
            className="w-9 h-9 rounded-lg object-cover"
            style={{ background: "white" }}
          />
        )}
      </div>

      {/* Store Selector */}
      {open && stores && stores.length > 0 && (
        <div className="px-3 py-3 border-b" style={{ borderColor: "hsl(207 40% 20%)" }}>
          <select
            value={selectedStore}
            onChange={(e) => setSelectedStore(e.target.value)}
            className="w-full text-sm rounded-lg px-3 py-2 border focus:outline-none focus:ring-2 focus:ring-offset-0"
            style={{
              background: "hsl(207 55% 18%)",
              borderColor: "hsl(207 40% 25%)",
              color: "hsl(210 20% 90%)",
            }}
          >
            {stores.map((s) => (
              <option key={s.id} value={s.slug} style={{ background: "hsl(207 55% 18%)" }}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-1">
        {visibleItems.map((item) => {
          const isActive = location.pathname === item.path || (item.path !== "/" && location.pathname.startsWith(item.path));
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              to={item.path}
              className="flex items-center gap-3 rounded-lg transition-all duration-200 group relative"
              style={{
                padding: open ? "0.625rem 0.875rem" : "0.625rem",
                justifyContent: open ? "flex-start" : "center",
                margin: "0 0.25rem",
                background: isActive ? "hsl(354 78% 42%)" : "transparent",
                color: isActive ? "white" : "hsl(210 20% 70%)",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = "hsl(207 55% 20%)";
                  e.currentTarget.style.color = "white";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "hsl(210 20% 70%)";
                }
              }}
              title={!open ? item.label : undefined}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {open && <span className="text-sm font-medium">{item.label}</span>}

              {/* Tooltip for collapsed */}
              {!open && (
                <div className="absolute left-full ml-2 px-2.5 py-1.5 rounded-md text-xs font-medium opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50"
                  style={{ background: "hsl(207 55% 18%)", color: "white", border: "1px solid hsl(207 40% 25%)" }}
                >
                  {item.label}
                </div>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User & Logout */}
      <div className="border-t p-3" style={{ borderColor: "hsl(207 40% 20%)" }}>
        {open && (
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
          onClick={logout}
          className="flex items-center gap-3 rounded-lg transition-all duration-200 w-full"
          style={{
            padding: open ? "0.5rem 0.75rem" : "0.5rem",
            justifyContent: open ? "flex-start" : "center",
            color: "hsl(210 20% 55%)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "hsl(0 84% 60%)";
            e.currentTarget.style.background = "hsl(0 84% 60% / 0.1)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "hsl(210 20% 55%)";
            e.currentTarget.style.background = "transparent";
          }}
          title={!open ? "Cerrar Sesion" : undefined}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {open && <span className="text-sm">Cerrar Sesion</span>}
        </button>
      </div>
    </aside>
  );
}
