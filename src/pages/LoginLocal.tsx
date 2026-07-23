import { useState } from "react";
import { useLocalAuth } from "@/hooks/useLocalAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, Store } from "lucide-react";

export default function LoginLocalPage() {
  const { login, error } = useLocalAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setLocalError("");
    try {
      await login(username, password);
      window.location.href = "/";
    } catch (err: any) {
      setLocalError(err.message || "Error al iniciar sesion");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Brand */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden" style={{ background: "linear-gradient(135deg, hsl(207 55% 18%) 0%, hsl(207 55% 12%) 100%)" }}>
        {/* Decorative elements */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-64 h-64 border border-white/20 rounded-full" />
          <div className="absolute top-40 left-40 w-96 h-96 border border-white/10 rounded-full" />
          <div className="absolute bottom-20 right-20 w-48 h-48 border border-white/15 rounded-full" />
        </div>

        <div className="relative z-10 flex flex-col justify-center items-center w-full px-12 text-white">
          {/* Logo */}
          <div className="mb-8">
            <div className="relative">
              <img
                src="/logo.jpg"
                alt="American Outlet"
                className="w-24 h-24 rounded-2xl object-cover border-2"
                style={{ borderColor: "hsl(354 78% 42%)" }}
              />
              <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "hsl(43 89% 50%)" }}>
                <Store className="w-4 h-4 text-white" />
              </div>
            </div>
          </div>

          <h1 className="text-4xl font-bold mb-3 tracking-tight">American Outlet</h1>
          <div className="inline-block px-4 py-1.5 rounded-full text-sm font-semibold mb-6" style={{ background: "hsl(354 78% 42%)" }}>
            Los Chiles
          </div>
          <p className="text-white/60 text-center max-w-sm text-lg leading-relaxed">
            Sistema de gestion de inventario y control de ventas
          </p>

          <div className="mt-12 flex items-center gap-2 text-white/40 text-sm">
            <div className="w-2 h-2 rounded-full bg-green-400" />
            Sistema en linea
          </div>
        </div>
      </div>

      {/* Right side - Login form */}
      <div className="flex-1 flex items-center justify-center p-8" style={{ background: "hsl(0 0% 97%)" }}>
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <img
              src="/logo.jpg"
              alt="American Outlet"
              className="w-16 h-16 rounded-xl mx-auto mb-4 object-cover border-2"
              style={{ borderColor: "hsl(354 78% 42%)" }}
            />
            <h1 className="text-2xl font-bold" style={{ color: "hsl(207 55% 23%)" }}>American Outlet</h1>
            <p className="text-sm mt-1" style={{ color: "hsl(354 78% 42%)" }}>Los Chiles</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border p-8">
            <div className="mb-6">
              <h2 className="text-xl font-bold" style={{ color: "hsl(207 55% 15%)" }}>Bienvenido</h2>
              <p className="text-sm mt-1" style={{ color: "hsl(207 20% 45%)" }}>Ingresa tus credenciales para continuar</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <Label htmlFor="username" className="text-sm font-medium" style={{ color: "hsl(207 55% 15%)" }}>Usuario</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="Tu usuario"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="mt-1.5 h-11"
                />
              </div>

              <div>
                <Label htmlFor="password" className="text-sm font-medium" style={{ color: "hsl(207 55% 15%)" }}>Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Tu contraseña"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="mt-1.5 h-11"
                />
              </div>

              {(error || localError) && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error || localError}
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-11 text-base font-medium transition-all duration-200 hover:shadow-lg hover:opacity-90"
                style={{ background: "hsl(354 78% 42%)" }}
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Cargando...
                  </div>
                ) : (
                  <>
                    <LogIn className="w-4 h-4 mr-2" />
                    Iniciar Sesion
                  </>
                )}
              </Button>
            </form>
          </div>

          <p className="text-center mt-6 text-xs" style={{ color: "hsl(207 20% 55%)" }}>
            American Outlet Los Chiles - Sistema Interno
          </p>
        </div>
      </div>
    </div>
  );
}
