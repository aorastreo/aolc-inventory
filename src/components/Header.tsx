import { Bell, User, Menu } from "lucide-react";
import { useLocalAuth } from "@/hooks/useLocalAuth";
import { useActiveStore } from "@/hooks/useActiveStore";

export function Header({ onMenuClick }: { onMenuClick?: () => void }) {
  const { user } = useLocalAuth();
  const { storeName } = useActiveStore();

  return (
    <header
      className="h-14 min-h-14 flex items-center justify-between gap-2 px-3 sm:px-4 md:px-6 border-b shrink-0"
      style={{
        background: "white",
        borderColor: "hsl(210 20% 90%)",
        paddingTop: "env(safe-area-inset-top)",
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <button
          type="button"
          onClick={onMenuClick}
          className="p-2.5 -ml-1 rounded-lg min-h-11 min-w-11 flex items-center justify-center shrink-0"
          style={{ color: "hsl(207 55% 23%)" }}
          aria-label="Abrir menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h2
            className="text-sm font-semibold tracking-tight truncate"
            style={{ color: "hsl(207 55% 23%)" }}
          >
            Sistema de Gestion
          </h2>
          <p className="text-[10px] truncate md:hidden" style={{ color: "hsl(207 20% 55%)" }}>
            {storeName}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <button
          type="button"
          className="relative p-2.5 rounded-lg min-h-11 min-w-11 flex items-center justify-center"
          style={{ color: "hsl(207 20% 55%)" }}
          aria-label="Notificaciones"
        >
          <Bell className="w-4 h-4" />
          <span
            className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full"
            style={{ background: "hsl(354 78% 42%)" }}
          />
        </button>

        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "hsl(207 55% 23%)" }}
          >
            <User className="w-4 h-4 text-white" />
          </div>
          <div className="hidden sm:block max-w-[9rem]">
            <p className="text-sm font-medium leading-tight truncate" style={{ color: "hsl(207 55% 15%)" }}>
              {user?.name || "Admin"}
            </p>
            <p className="text-[10px] leading-tight truncate" style={{ color: "hsl(207 20% 55%)" }}>
              {user?.role === "admin" ? "Administrador" : user?.role === "manager" ? "Manager" : "Empleado"}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
