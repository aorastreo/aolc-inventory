import { useState } from "react";
import { useLocalAuth } from "@/hooks/useLocalAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Store, LogIn } from "lucide-react";

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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 flex items-center justify-center">
      <div className="w-full max-w-md px-4">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4">
            <Store className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">AOLC</h1>
          <p className="text-slate-400 mt-1">Sistema de Gestion</p>
        </div>

        <Card className="border-0 shadow-2xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-center text-xl">Iniciar Sesion</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="username">Usuario</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="Tu usuario"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Tu contraseña"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="mt-1"
                />
              </div>

              {(error || localError) && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error || localError}
                </div>
              )}

              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700"
                disabled={loading}
              >
                {loading ? (
                  "Cargando..."
                ) : (
                  <>
                    <LogIn className="w-4 h-4 mr-2" />
                    Entrar
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-slate-500 text-sm mt-6">
          American Outlet Los Chiles - Sistema Interno
        </p>
      </div>
    </div>
  );
}
