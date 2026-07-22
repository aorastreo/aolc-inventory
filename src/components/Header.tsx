import { Menu, User } from "lucide-react";
import { useLocalAuth } from "@/hooks/useLocalAuth";

export function Header({ onMenuClick }: { onMenuClick: () => void }) {
  const { user } = useLocalAuth();

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuClick}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <Menu className="w-5 h-5 text-gray-600" />
        </button>
        <h2 className="text-lg font-semibold text-gray-800">American Outlet Los Chiles</h2>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
            <User className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm text-gray-700">{user?.name || "Admin"}</span>
        </div>
      </div>
    </header>
  );
}
