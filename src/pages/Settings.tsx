import { trpc } from "@/providers/trpc";
import { useLocalAuth } from "@/hooks/useLocalAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Users, Plus, Trash2, Shield, UserCircle, Crown, User, Store } from "lucide-react";
import { useState } from "react";

const BRAND_RED = "#B22234";
const BRAND_BLUE = "#1B3A5C";

const roleConfig = {
  admin: { icon: Crown, color: "#DC2626", bg: "bg-red-50", text: "text-red-700", label: "Administrador" },
  manager: { icon: User, color: "#2563EB", bg: "bg-blue-50", text: "text-blue-700", label: "Manager" },
  employee: { icon: User, color: "#6B7280", bg: "bg-gray-50", text: "text-gray-700", label: "Empleado" },
};

export default function SettingsPage() {
  const { user } = useLocalAuth();
  const utils = trpc.useUtils();
  const { data: employees } = trpc.inventory.employees.useQuery({ storeId: 1 });

  const createEmployee = trpc.inventory.createEmployee.useMutation({ onSuccess: () => utils.inventory.employees.invalidate() });
  const deleteEmployee = trpc.inventory.deleteEmployee.useMutation({ onSuccess: () => utils.inventory.employees.invalidate() });

  const [newUser, setNewUser] = useState({ username: "", password: "", name: "", role: "employee" as "employee" | "manager" | "admin" });
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleCreate = () => {
    if (!newUser.username || !newUser.password || !newUser.name) return;
    createEmployee.mutate({ storeId: 1, ...newUser });
    setNewUser({ username: "", password: "", name: "", role: "employee" });
    setDialogOpen(false);
  };

  const currentUserRole = user?.role as keyof typeof roleConfig || "admin";
  const CurrentRoleConfig = roleConfig[currentUserRole] || roleConfig.admin;
  const CurrentRoleIcon = CurrentRoleConfig.icon;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: "hsl(207 55% 15%)" }}>Configuracion</h1>
        <p className="text-sm mt-0.5" style={{ color: "hsl(207 20% 45%)" }}>Administra tu cuenta y usuarios del sistema</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Mi Cuenta */}
        <Card className="border-0 shadow-sm lg:col-span-1">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base" style={{ color: BRAND_BLUE }}>
              <UserCircle className="w-5 h-5" />
              Mi Cuenta
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 mb-6">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: `linear-gradient(135deg, ${BRAND_RED} 0%, #8B1A2B 100%)` }}
              >
                <CurrentRoleIcon className="w-8 h-8 text-white" />
              </div>
              <div>
                <p className="font-semibold text-lg" style={{ color: "hsl(207 55% 15%)" }}>{user?.name}</p>
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${CurrentRoleConfig.bg} ${CurrentRoleConfig.text}`}>
                  <CurrentRoleIcon className="w-3 h-3" />
                  {CurrentRoleConfig.label}
                </span>
              </div>
            </div>
            <div className="space-y-4">
              <div className="p-3 rounded-lg" style={{ background: "hsl(0 0% 97%)" }}>
                <Label className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "hsl(207 20% 55%)" }}>Nombre</Label>
                <p className="text-sm font-medium mt-0.5" style={{ color: "hsl(207 55% 15%)" }}>{user?.name}</p>
              </div>
              <div className="p-3 rounded-lg" style={{ background: "hsl(0 0% 97%)" }}>
                <Label className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "hsl(207 20% 55%)" }}>Usuario</Label>
                <p className="text-sm font-medium mt-0.5" style={{ color: "hsl(207 55% 15%)" }}>@{user?.username}</p>
              </div>
              <div className="p-3 rounded-lg" style={{ background: "hsl(0 0% 97%)" }}>
                <Label className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "hsl(207 20% 55%)" }}>Tienda</Label>
                <div className="flex items-center gap-2 mt-0.5">
                  <Store className="w-3.5 h-3.5" style={{ color: "hsl(207 20% 45%)" }} />
                  <p className="text-sm font-medium" style={{ color: "hsl(207 55% 15%)" }}>American Outlet Los Chiles</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Users Management */}
        <Card className="border-0 shadow-sm lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle className="flex items-center gap-2 text-base" style={{ color: BRAND_BLUE }}>
              <Users className="w-5 h-5" />
              Usuarios del Sistema
            </CardTitle>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="font-medium transition-all duration-200 hover:shadow-lg hover:opacity-90" style={{ background: BRAND_RED }}>
                  <Plus className="w-4 h-4 mr-1" />
                  Nuevo Usuario
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5" style={{ color: BRAND_RED }} />
                    Crear Nuevo Usuario
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-2">
                  <div>
                    <Label>Nombre completo</Label>
                    <Input placeholder="German Rodriguez" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Usuario</Label>
                      <Input placeholder="german" value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} />
                    </div>
                    <div>
                      <Label>Contraseña</Label>
                      <Input type="password" placeholder="Minimo 4 caracteres" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <Label>Rol</Label>
                    <select
                      className="w-full h-10 border rounded-md px-3 text-sm"
                      style={{ borderColor: "hsl(210 20% 88%)" }}
                      value={newUser.role}
                      onChange={(e) => setNewUser({ ...newUser, role: e.target.value as "employee" | "manager" | "admin" })}
                    >
                      <option value="employee">Empleado</option>
                      <option value="manager">Manager</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </div>
                  <Button onClick={handleCreate} className="w-full font-medium transition-all duration-200 hover:shadow-lg hover:opacity-90" style={{ background: BRAND_RED }}>
                    Crear Usuario
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {employees?.map((emp) => {
                const empRole = emp.role as keyof typeof roleConfig || "employee";
                const empConfig = roleConfig[empRole] || roleConfig.employee;
                const EmpIcon = empConfig.icon;
                return (
                  <div
                    key={emp.id}
                    className="flex items-center justify-between p-4 rounded-xl border transition-all duration-200 hover:shadow-sm"
                    style={{ background: "white", borderColor: "hsl(210 20% 92%)" }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center"
                        style={{ background: empConfig.color + "12" }}
                      >
                        <EmpIcon className="w-5 h-5" style={{ color: empConfig.color }} />
                      </div>
                      <div>
                        <p className="font-semibold text-sm" style={{ color: "hsl(207 55% 15%)" }}>{emp.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs" style={{ color: "hsl(207 20% 45%)" }}>@{emp.username}</span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${empConfig.bg} ${empConfig.text}`}>
                            {empConfig.label}
                          </span>
                        </div>
                      </div>
                    </div>
                    {emp.username !== "admin" && (
                      <Button variant="ghost" size="sm" onClick={() => deleteEmployee.mutate({ id: emp.id })} className="hover:bg-red-50">
                        <Trash2 className="w-4 h-4" style={{ color: BRAND_RED }} />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
