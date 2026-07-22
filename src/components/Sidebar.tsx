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
  LogOut
} from "lucide-react";

const menuItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/pallets", label: "Contenedores", icon: Package },
  { path: "/adjustments", label: "Ajustes", icon: ClipboardList },
  { path: "/closings", label: "Cierres", icon: Receipt },
  { path: "/settings", label: "Configuracion", icon: Settings },
];

export function Sidebar({ open }: { open: boolean }) {
  const location = useLocation();
  const { logout, user } = useLocalAuth();
  const { data: stores } = trpc.inventory.stores.useQuery();
  const [selectedStore, setSelectedStore] = useState("los-chiles");

  return (
    <aside
      className={`bg-slate-900 text-white transition-all duration-300 flex flex-col ${
        open ? "w-64" : "w-16"
      }`}
    >
      {/* Logo */}
      <div className="h-16 flex items-center justify-center border-b border-slate-700">
        {open ? (
          <div className="text-center">
            <h1 className="text-lg font-bold text-blue-400">AOLC</h1>
            <p className="text-xs text-slate-400">Inventory</p>
          </div>
        ) : (
          <Store className="w-6 h-6 text-blue-400" />
        )}
      </div>

      {/* Store Selector */}
      {open && stores && stores.length > 0 && (
        <div className="px-4 py-3 border-b border-slate-700">
          <select
            value={selectedStore}
            onChange={(e) => setSelectedStore(e.target.value)}
            className="w-full bg-slate-800 text-sm rounded px-2 py-1 border border-slate-600 focus:outline-none focus:border-blue-500"
          >
            {stores.map((s) => (
              <option key={s.id} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 py-4">
        {menuItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-3 mx-2 rounded-lg transition-colors ${
                isActive
                  ? "bg-blue-600 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
              title={!open ? item.label : undefined}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {open && <span className="text-sm">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="border-t border-slate-700 p-4">
        <button
          onClick={logout}
          className="flex items-center gap-3 text-slate-300 hover:text-white transition-colors w-full"
        >
          <LogOut className="w-5 h-5" />
          {open && <span className="text-sm">Cerrar Sesion</span>}
        </button>
      </div>
    </aside>
  );
}
