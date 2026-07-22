import { Bell, User, Store } from "lucide-react";
import { useLocalAuth } from "@/hooks/useLocalAuth";

export function Header({ onMenuClick }: { onMenuClick?: () => void }) {
  const { user } = useLocalAuth();

  return (
    <header
      className="h-14 flex items-center justify-between px-6 border-b"
      style={{
        background: "white",
        borderColor: "hsl(210 20% 90%)",
      }}
    >
      <div className="flex items-center gap-4">
        <h2
          className="text-sm font-semibold tracking-tight"
          style={{ color: "hsl(207 55% 23%)" }}
        >
          Sistema de Gestion
        </h2>
      </div>

      <div className="flex items-center gap-4">
        {/* Notification bell */}
        <button
          className="relative p-2 rounded-lg transition-colors"
          style={{ color: "hsl(207 20% 55%)" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "hsl(210 20% 96%)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <Bell className="w-4 h-4" />
          {/* Dot indicator */}
          <span
            className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full"
            style={{ background: "hsl(354 78% 42%)" }}
          />
        </button>

        {/* User */}
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: "hsl(207 55% 23%)" }}
          >
            <User className="w-4 h-4 text-white" />
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-medium leading-tight" style={{ color: "hsl(207 55% 15%)" }}>
              {user?.name || "Admin"}
            </p>
            <p className="text-[10px] leading-tight" style={{ color: "hsl(207 20% 55%)" }}>
              {user?.role === "admin" ? "Administrador" : user?.role === "manager" ? "Manager" : "Empleado"}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
