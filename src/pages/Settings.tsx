import { trpc } from "@/providers/trpc";
import { useLocalAuth } from "@/hooks/useLocalAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Users, Plus, Trash2, Shield, UserCircle } from "lucide-react";
import { useState } from "react";

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

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Configuracion</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCircle className="w-5 h-5 text-blue-500" />
              Mi Cuenta
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div>
                <Label className="text-gray-500">Nombre</Label>
                <p className="font-medium">{user?.name}</p>
              </div>
              <div>
                <Label className="text-gray-500">Usuario</Label>
                <p className="font-medium">{user?.username}</p>
              </div>
              <div>
                <Label className="text-gray-500">Rol</Label>
                <p className="font-medium capitalize">{user?.role}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Users Management */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-green-500" />
              Usuarios
            </CardTitle>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="w-4 h-4 mr-1" />
                  Nuevo
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Crear Nuevo Usuario</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Nombre completo</Label>
                    <Input placeholder="German Rodriguez" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} />
                  </div>
                  <div>
                    <Label>Usuario</Label>
                    <Input placeholder="german" value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} />
                  </div>
                  <div>
                    <Label>Contraseña</Label>
                    <Input type="password" placeholder="Minimo 4 caracteres" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
                  </div>
                  <div>
                    <Label>Rol</Label>
                    <select
                      className="w-full border rounded-md px-3 py-2 text-sm"
                      value={newUser.role}
                      onChange={(e) => setNewUser({ ...newUser, role: e.target.value as "employee" | "manager" | "admin" })}
                    >
                      <option value="employee">Empleado</option>
                      <option value="manager">Manager</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </div>
                  <Button onClick={handleCreate} className="w-full bg-blue-600 hover:bg-blue-700">Crear Usuario</Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {employees?.map((emp) => (
                <div key={emp.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Shield className={`w-4 h-4 ${emp.role === 'admin' ? 'text-red-500' : emp.role === 'manager' ? 'text-blue-500' : 'text-gray-400'}`} />
                    <div>
                      <p className="font-medium text-sm">{emp.name}</p>
                      <p className="text-xs text-gray-500">@{emp.username} - {emp.role}</p>
                    </div>
                  </div>
                  {emp.username !== "admin" && (
                    <Button variant="ghost" size="sm" onClick={() => deleteEmployee.mutate({ id: emp.id })}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
