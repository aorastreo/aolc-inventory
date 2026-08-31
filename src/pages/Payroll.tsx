import { useState, useMemo } from "react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Users, Calendar, DollarSign, TrendingUp, Search, Plus, Pencil, Trash2,
  Wallet, CreditCard, ArrowDown, ArrowUp, CheckCircle, AlertCircle,
  Briefcase, Banknote, BarChart3, X
} from "lucide-react";

const BRAND_RED = "#B22234";
const BRAND_BLUE = "#1B3A5C";

type Tab = "empleados" | "periodos" | "pagos" | "reporte";

export default function PayrollPage() {
  const [activeTab, setActiveTab] = useState<Tab>("empleados");
  const utils = trpc.useUtils();

  // Queries
  const { data: employees, isLoading: loadingEmps } = trpc.inventory.payrollEmployees.useQuery({});
  const { data: periods, isLoading: loadingPeriods } = trpc.inventory.payrollPeriods.useQuery();
  const { data: payments, isLoading: loadingPayments } = trpc.inventory.payrollPayments.useQuery();

  // Stats
  const activeEmployees = employees?.filter(e => e.estado === "activo").length || 0;
  const totalSalaries = employees?.reduce((s, e) => s + Number(e.salarioBase || 0), 0) || 0;
  const pendingPayments = payments?.filter(p => p.estado === "pendiente").length || 0;
  const totalPaid = payments?.filter(p => p.estado === "pagado").reduce((s, p) => s + Number(p.netoPagar || 0), 0) || 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "hsl(207 55% 15%)" }}>Planilla</h1>
          <p className="text-sm mt-0.5" style={{ color: "hsl(207 20% 45%)" }}>Control de nomina y pagos de empleados</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard icon={Users} label="Empleados Activos" value={String(activeEmployees)} color="#1B3A5C" />
        <StatCard icon={DollarSign} label="Total Salarios/Mes" value={`₡${totalSalaries.toLocaleString("es-CR")}`} color="#16A34A" />
        <StatCard icon={AlertCircle} label="Pagos Pendientes" value={String(pendingPayments)} color="#D97706" />
        <StatCard icon={CheckCircle} label="Total Pagado" value={`₡${totalPaid.toLocaleString("es-CR")}`} color="#8B5CF6" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b" style={{ borderColor: "hsl(210 20% 90%)" }}>
        {(["empleados", "periodos", "pagos", "reporte"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-[1px]"
            style={{
              borderColor: activeTab === tab ? BRAND_RED : "transparent",
              color: activeTab === tab ? BRAND_RED : "hsl(207 20% 45%)",
            }}
          >
            {tab === "empleados" ? "Empleados" : tab === "periodos" ? "Periodos" : tab === "pagos" ? "Pagos" : "Reporte"}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === "empleados" && <EmployeesTab employees={employees || []} loading={loadingEmps} utils={utils} />}
      {activeTab === "periodos" && <PeriodsTab periods={periods || []} loading={loadingPeriods} utils={utils} />}
      {activeTab === "pagos" && <PaymentsTab employees={employees || []} periods={periods || []} payments={payments || []} loading={loadingPayments} utils={utils} />}
      {activeTab === "reporte" && <ReportTab periods={periods || []} />}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: color + "15" }}>
            <Icon className="w-5 h-5" style={{ color }} />
          </div>
          <div>
            <p className="text-xs font-medium" style={{ color: "hsl(207 20% 45%)" }}>{label}</p>
            <p className="text-lg font-bold" style={{ color: "hsl(207 55% 15%)" }}>{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// EMPLOYEES TAB
// ============================================
function EmployeesTab({ employees, loading, utils }: { employees: any[]; loading: boolean; utils: any }) {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ storeId: 1, cedula: "", nombre: "", apellidos: "", puesto: "", salarioBase: "", tipoSalario: "quincenal" as const, fechaIngreso: "", telefono: "", correo: "", cuentaBancaria: "", banco: "" });

  const createEmp = trpc.inventory.createPayrollEmployee.useMutation({
    onSuccess: () => { utils.inventory.payrollEmployees.invalidate(); setDialogOpen(false); setForm({ storeId: 1, cedula: "", nombre: "", apellidos: "", puesto: "", salarioBase: "", tipoSalario: "quincenal", fechaIngreso: "", telefono: "", correo: "", cuentaBancaria: "", banco: "" }); },
    onError: (err) => alert("Error al guardar: " + err.message),
  });
  const updateEmp = trpc.inventory.updatePayrollEmployee.useMutation({
    onSuccess: () => { utils.inventory.payrollEmployees.invalidate(); setDialogOpen(false); setEditing(null); },
    onError: (err) => alert("Error al actualizar: " + err.message),
  });
  const deleteEmp = trpc.inventory.deletePayrollEmployee.useMutation({ onSuccess: () => utils.inventory.payrollEmployees.invalidate() });

  const filtered = employees.filter(e =>
    e.nombre?.toLowerCase().includes(search.toLowerCase()) ||
    e.apellidos?.toLowerCase().includes(search.toLowerCase()) ||
    e.cedula?.includes(search) ||
    e.puesto?.toLowerCase().includes(search.toLowerCase())
  );

  const openEdit = (emp: any) => {
    setEditing(emp);
    setForm({
      storeId: emp.storeId, cedula: emp.cedula, nombre: emp.nombre, apellidos: emp.apellidos,
      puesto: emp.puesto, salarioBase: String(emp.salarioBase), tipoSalario: emp.tipoSalario,
      fechaIngreso: emp.fechaIngreso, telefono: emp.telefono || "", correo: emp.correo || "",
      cuentaBancaria: emp.cuentaBancaria || "", banco: emp.banco || "",
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.nombre.trim() || !form.apellidos.trim() || !form.puesto.trim() || !form.salarioBase || !form.fechaIngreso) {
      alert("Por favor complete los campos obligatorios: Nombre, Apellidos, Puesto, Salario Base y Fecha de Ingreso");
      return;
    }
    if (editing) {
      updateEmp.mutate({ id: editing.id, ...form, salarioBase: String(form.salarioBase) });
    } else {
      createEmp.mutate({ ...form, salarioBase: String(form.salarioBase) });
    }
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-b-2 rounded-full" style={{ borderColor: BRAND_RED }} /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "hsl(207 20% 55%)" }} />
          <Input placeholder="Buscar empleado..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={() => { setEditing(null); setForm({ storeId: 1, cedula: "", nombre: "", apellidos: "", puesto: "", salarioBase: "", tipoSalario: "quincenal", fechaIngreso: "", telefono: "", correo: "", cuentaBancaria: "", banco: "" }); setDialogOpen(true); }} style={{ background: BRAND_RED }}>
          <Plus className="w-4 h-4 mr-2" /> Nuevo Empleado
        </Button>
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <table className="w-full">
          <thead style={{ background: "hsl(0 0% 98%)" }}>
            <tr className="border-b" style={{ borderColor: "hsl(210 20% 94%)" }}>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase" style={{ color: BRAND_BLUE }}>Nombre</th>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase" style={{ color: BRAND_BLUE }}>Cedula</th>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase" style={{ color: BRAND_BLUE }}>Puesto</th>
              <th className="text-right px-4 py-3 text-xs font-semibold uppercase" style={{ color: BRAND_BLUE }}>Salario Base</th>
              <th className="text-center px-4 py-3 text-xs font-semibold uppercase" style={{ color: BRAND_BLUE }}>Estado</th>
              <th className="w-24"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((emp) => (
              <tr key={emp.id} className="border-b hover:bg-gray-50/50 transition-colors" style={{ borderColor: "hsl(210 20% 94%)" }}>
                <td className="px-4 py-3 text-sm font-semibold" style={{ color: "hsl(207 55% 15%)" }}>{emp.nombre} {emp.apellidos}</td>
                <td className="px-4 py-3 text-sm" style={{ color: "hsl(207 20% 45%)" }}>{emp.cedula}</td>
                <td className="px-4 py-3 text-sm" style={{ color: "hsl(207 20% 45%)" }}>{emp.puesto}</td>
                <td className="px-4 py-3 text-sm text-right font-semibold">₡{Number(emp.salarioBase).toLocaleString("es-CR")}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${emp.estado === "activo" ? "bg-green-50 text-green-700 border border-green-200" : "bg-gray-50 text-gray-600 border border-gray-200"}`}>
                    {emp.estado}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 justify-end">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(emp)} className="h-8 w-8 p-0 hover:bg-blue-50"><Pencil className="w-3.5 h-3.5" style={{ color: BRAND_BLUE }} /></Button>
                    <Button variant="ghost" size="sm" onClick={() => { if (confirm("Eliminar empleado?")) deleteEmp.mutate({ id: emp.id }); }} className="h-8 w-8 p-0 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" style={{ color: BRAND_RED }} /></Button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="text-center py-12 text-sm" style={{ color: "hsl(207 20% 55%)" }}>No hay empleados registrados</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-lg font-semibold" style={{ color: BRAND_BLUE }}>{editing ? "Editar Empleado" : "Nuevo Empleado"}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Nombre</Label><Input value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} /></div>
              <div><Label className="text-xs">Apellidos</Label><Input value={form.apellidos} onChange={e => setForm({...form, apellidos: e.target.value})} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Cedula</Label><Input value={form.cedula} onChange={e => setForm({...form, cedula: e.target.value})} /></div>
              <div><Label className="text-xs">Puesto</Label><Input value={form.puesto} onChange={e => setForm({...form, puesto: e.target.value})} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Salario Base</Label><Input type="number" value={form.salarioBase} onChange={e => setForm({...form, salarioBase: e.target.value})} /></div>
              <div><Label className="text-xs">Tipo Salario</Label>
                <select className="w-full h-10 border rounded-md px-3 text-sm" style={{ borderColor: "hsl(210 20% 88%)" }} value={form.tipoSalario} onChange={e => setForm({...form, tipoSalario: e.target.value as any})}>
                  <option value="quincenal">Quincenal</option><option value="mensual">Mensual</option><option value="semanal">Semanal</option><option value="hora">Por Hora</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Fecha Ingreso</Label><Input type="date" value={form.fechaIngreso} onChange={e => setForm({...form, fechaIngreso: e.target.value})} /></div>
              <div><Label className="text-xs">Telefono</Label><Input value={form.telefono} onChange={e => setForm({...form, telefono: e.target.value})} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Banco</Label><Input value={form.banco} onChange={e => setForm({...form, banco: e.target.value})} /></div>
              <div><Label className="text-xs">Cuenta Bancaria</Label><Input value={form.cuentaBancaria} onChange={e => setForm({...form, cuentaBancaria: e.target.value})} /></div>
            </div>
            <div><Label className="text-xs">Correo</Label><Input type="email" value={form.correo} onChange={e => setForm({...form, correo: e.target.value})} /></div>
            <Button onClick={handleSave} className="w-full font-medium" style={{ background: BRAND_RED }}>Guardar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================
// PERIODS TAB
// ============================================
function PeriodsTab({ periods, loading, utils }: { periods: any[]; loading: boolean; utils: any }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ nombre: "", tipo: "quincenal" as const, fechaInicio: "", fechaFin: "" });

  const createPeriod = trpc.inventory.createPayrollPeriod.useMutation({ onSuccess: () => { utils.inventory.payrollPeriods.invalidate(); setDialogOpen(false); setForm({ nombre: "", tipo: "quincenal", fechaInicio: "", fechaFin: "" }); } });
  const updatePeriod = trpc.inventory.updatePayrollPeriod.useMutation({ onSuccess: () => utils.inventory.payrollPeriods.invalidate() });

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-b-2 rounded-full" style={{ borderColor: BRAND_RED }} /></div>;

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button onClick={() => setDialogOpen(true)} style={{ background: BRAND_RED }}><Plus className="w-4 h-4 mr-2" /> Nuevo Periodo</Button>
      </div>
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <table className="w-full">
          <thead style={{ background: "hsl(0 0% 98%)" }}>
            <tr className="border-b" style={{ borderColor: "hsl(210 20% 94%)" }}>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase" style={{ color: BRAND_BLUE }}>Periodo</th>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase" style={{ color: BRAND_BLUE }}>Tipo</th>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase" style={{ color: BRAND_BLUE }}>Fecha Inicio</th>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase" style={{ color: BRAND_BLUE }}>Fecha Fin</th>
              <th className="text-center px-4 py-3 text-xs font-semibold uppercase" style={{ color: BRAND_BLUE }}>Estado</th>
              <th className="w-20"></th>
            </tr>
          </thead>
          <tbody>
            {periods.map((p) => (
              <tr key={p.id} className="border-b hover:bg-gray-50/50 transition-colors" style={{ borderColor: "hsl(210 20% 94%)" }}>
                <td className="px-4 py-3 text-sm font-semibold" style={{ color: "hsl(207 55% 15%)" }}>{p.nombre}</td>
                <td className="px-4 py-3 text-sm capitalize" style={{ color: "hsl(207 20% 45%)" }}>{p.tipo}</td>
                <td className="px-4 py-3 text-sm" style={{ color: "hsl(207 20% 45%)" }}>{p.fechaInicio}</td>
                <td className="px-4 py-3 text-sm" style={{ color: "hsl(207 20% 45%)" }}>{p.fechaFin}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${p.estado === "abierto" ? "bg-green-50 text-green-700 border border-green-200" : p.estado === "cerrado" ? "bg-gray-50 text-gray-600 border border-gray-200" : "bg-amber-50 text-amber-700 border border-amber-200"}`}>
                    {p.estado}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {p.estado === "abierto" && (
                    <Button variant="ghost" size="sm" onClick={() => { if (confirm("Cerrar periodo?")) updatePeriod.mutate({ id: p.id, estado: "cerrado" }); }} className="h-8 w-8 p-0 hover:bg-blue-50" title="Cerrar periodo">
                      <CheckCircle className="w-3.5 h-3.5" style={{ color: BRAND_BLUE }} />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {periods.length === 0 && (
              <tr><td colSpan={6} className="text-center py-12 text-sm" style={{ color: "hsl(207 20% 55%)" }}>No hay periodos registrados</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-lg font-semibold" style={{ color: BRAND_BLUE }}>Nuevo Periodo</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div><Label className="text-xs">Nombre del Periodo</Label><Input placeholder="ej: Quincena Agosto 2026" value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} /></div>
            <div><Label className="text-xs">Tipo</Label>
              <select className="w-full h-10 border rounded-md px-3 text-sm" style={{ borderColor: "hsl(210 20% 88%)" }} value={form.tipo} onChange={e => setForm({...form, tipo: e.target.value as any})}>
                <option value="quincenal">Quincenal</option><option value="mensual">Mensual</option><option value="semanal">Semanal</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Fecha Inicio</Label><Input type="date" value={form.fechaInicio} onChange={e => setForm({...form, fechaInicio: e.target.value})} /></div>
              <div><Label className="text-xs">Fecha Fin</Label><Input type="date" value={form.fechaFin} onChange={e => setForm({...form, fechaFin: e.target.value})} /></div>
            </div>
            <Button onClick={() => createPeriod.mutate(form)} className="w-full font-medium" style={{ background: BRAND_RED }}>Crear Periodo</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================
// PAYMENTS TAB
// ============================================
function PaymentsTab({ employees, periods, payments, loading, utils }: { employees: any[]; periods: any[]; payments: any[]; loading: boolean; utils: any }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ employeeId: "", periodId: "", salarioBase: "", horasExtra: "", montoHorasExtra: "", comisiones: "", aguinaldo: "", vacaciones: "", ccss: "", renta: "", adelantos: "", ausencias: "", otrasDeducciones: "", formaPago: "transferencia" as const, observaciones: "" });

  const createPayment = trpc.inventory.createPayrollPayment.useMutation({ onSuccess: () => { utils.inventory.payrollPayments.invalidate(); setDialogOpen(false); resetForm(); } });
  const deletePayment = trpc.inventory.deletePayrollPayment.useMutation({ onSuccess: () => utils.inventory.payrollPayments.invalidate() });

  const resetForm = () => setForm({ employeeId: "", periodId: "", salarioBase: "", horasExtra: "", montoHorasExtra: "", comisiones: "", aguinaldo: "", vacaciones: "", ccss: "", renta: "", adelantos: "", ausencias: "", otrasDeducciones: "", formaPago: "transferencia", observaciones: "" });

  const totals = useMemo(() => {
    const salarioBase = Number(form.salarioBase || 0);
    const montoHorasExtra = Number(form.montoHorasExtra || 0);
    const comisiones = Number(form.comisiones || 0);
    const aguinaldo = Number(form.aguinaldo || 0);
    const vacaciones = Number(form.vacaciones || 0);
    const ccss = Number(form.ccss || 0);
    const renta = Number(form.renta || 0);
    const adelantos = Number(form.adelantos || 0);
    const ausencias = Number(form.ausencias || 0);
    const otrasDeducciones = Number(form.otrasDeducciones || 0);
    const totalIngresos = salarioBase + montoHorasExtra + comisiones + aguinaldo + vacaciones;
    const totalDeducciones = ccss + renta + adelantos + ausencias + otrasDeducciones;
    const neto = totalIngresos - totalDeducciones;
    return { totalIngresos, totalDeducciones, neto };
  }, [form]);

  const onSelectEmployee = (empId: string) => {
    const emp = employees.find(e => String(e.id) === empId);
    if (emp) {
      setForm(prev => ({ ...prev, employeeId: empId, salarioBase: String(emp.salarioBase || "") }));
    }
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-b-2 rounded-full" style={{ borderColor: BRAND_RED }} /></div>;

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button onClick={() => { resetForm(); setDialogOpen(true); }} style={{ background: BRAND_RED }}><Plus className="w-4 h-4 mr-2" /> Nuevo Pago</Button>
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <table className="w-full">
          <thead style={{ background: "hsl(0 0% 98%)" }}>
            <tr className="border-b" style={{ borderColor: "hsl(210 20% 94%)" }}>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase" style={{ color: BRAND_BLUE }}>Empleado</th>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase" style={{ color: BRAND_BLUE }}>Periodo</th>
              <th className="text-right px-4 py-3 text-xs font-semibold uppercase" style={{ color: BRAND_BLUE }}>Ingresos</th>
              <th className="text-right px-4 py-3 text-xs font-semibold uppercase" style={{ color: BRAND_BLUE }}>Deducciones</th>
              <th className="text-right px-4 py-3 text-xs font-semibold uppercase" style={{ color: BRAND_BLUE }}>Neto</th>
              <th className="text-center px-4 py-3 text-xs font-semibold uppercase" style={{ color: BRAND_BLUE }}>Estado</th>
              <th className="w-16"></th>
            </tr>
          </thead>
          <tbody>
            {payments.map((pay) => {
              const emp = employees.find(e => e.id === pay.employeeId);
              const per = periods.find(p => p.id === pay.periodId);
              return (
                <tr key={pay.id} className="border-b hover:bg-gray-50/50 transition-colors" style={{ borderColor: "hsl(210 20% 94%)" }}>
                  <td className="px-4 py-3 text-sm font-semibold" style={{ color: "hsl(207 55% 15%)" }}>{emp ? `${emp.nombre} ${emp.apellidos}` : "—"}</td>
                  <td className="px-4 py-3 text-sm" style={{ color: "hsl(207 20% 45%)" }}>{per?.nombre || "—"}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium" style={{ color: "#16A34A" }}>₡{Number(pay.totalIngresos).toLocaleString("es-CR")}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium" style={{ color: "#DC2626" }}>₡{Number(pay.totalDeducciones).toLocaleString("es-CR")}</td>
                  <td className="px-4 py-3 text-sm text-right font-bold" style={{ color: BRAND_BLUE }}>₡{Number(pay.netoPagar).toLocaleString("es-CR")}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${pay.estado === "pagado" ? "bg-green-50 text-green-700 border border-green-200" : pay.estado === "pendiente" ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-gray-50 text-gray-600 border border-gray-200"}`}>
                      {pay.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {pay.estado !== "anulado" && (
                      <Button variant="ghost" size="sm" onClick={() => { if (confirm("Anular este pago?")) deletePayment.mutate({ id: pay.id }); }} className="h-8 w-8 p-0 hover:bg-red-50">
                        <Trash2 className="w-3.5 h-3.5" style={{ color: BRAND_RED }} />
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
            {payments.length === 0 && (
              <tr><td colSpan={7} className="text-center py-12 text-sm" style={{ color: "hsl(207 20% 55%)" }}>No hay pagos registrados</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Payment Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-lg font-semibold" style={{ color: BRAND_BLUE }}>Registrar Pago de Planilla</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            {/* Employee & Period */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Empleado</Label>
                <select className="w-full h-10 border rounded-md px-3 text-sm" style={{ borderColor: "hsl(210 20% 88%)" }} value={form.employeeId} onChange={e => onSelectEmployee(e.target.value)}>
                  <option value="">Seleccionar...</option>
                  {employees.filter(e => e.estado === "activo").map(e => <option key={e.id} value={e.id}>{e.nombre} {e.apellidos}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">Periodo</Label>
                <select className="w-full h-10 border rounded-md px-3 text-sm" style={{ borderColor: "hsl(210 20% 88%)" }} value={form.periodId} onChange={e => setForm({...form, periodId: e.target.value})}>
                  <option value="">Seleccionar...</option>
                  {periods.filter(p => p.estado !== "cerrado").map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
            </div>

            {/* Ingresos */}
            <div className="p-4 rounded-lg border" style={{ background: "rgba(22,163,74,0.04)", borderColor: "rgba(22,163,74,0.15)" }}>
              <h4 className="text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-1" style={{ color: "#16A34A" }}><ArrowUp className="w-3 h-3" /> Ingresos</h4>
              <div className="grid grid-cols-3 gap-3">
                <div><Label className="text-xs">Salario Base</Label><Input type="number" value={form.salarioBase} onChange={e => setForm({...form, salarioBase: e.target.value})} /></div>
                <div><Label className="text-xs">Horas Extra (h)</Label><Input type="number" value={form.horasExtra} onChange={e => setForm({...form, horasExtra: e.target.value})} /></div>
                <div><Label className="text-xs">Monto H.Extra</Label><Input type="number" value={form.montoHorasExtra} onChange={e => setForm({...form, montoHorasExtra: e.target.value})} /></div>
                <div><Label className="text-xs">Comisiones</Label><Input type="number" value={form.comisiones} onChange={e => setForm({...form, comisiones: e.target.value})} /></div>
                <div><Label className="text-xs">Aguinaldo</Label><Input type="number" value={form.aguinaldo} onChange={e => setForm({...form, aguinaldo: e.target.value})} /></div>
                <div><Label className="text-xs">Vacaciones</Label><Input type="number" value={form.vacaciones} onChange={e => setForm({...form, vacaciones: e.target.value})} /></div>
              </div>
              <div className="mt-3 text-right text-sm font-bold" style={{ color: "#16A34A" }}>Total Ingresos: ₡{totals.totalIngresos.toLocaleString("es-CR")}</div>
            </div>

            {/* Deducciones */}
            <div className="p-4 rounded-lg border" style={{ background: "rgba(220,38,38,0.04)", borderColor: "rgba(220,38,38,0.15)" }}>
              <h4 className="text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-1" style={{ color: "#DC2626" }}><ArrowDown className="w-3 h-3" /> Deducciones</h4>
              <div className="grid grid-cols-3 gap-3">
                <div><Label className="text-xs">CCSS</Label><Input type="number" value={form.ccss} onChange={e => setForm({...form, ccss: e.target.value})} /></div>
                <div><Label className="text-xs">Renta</Label><Input type="number" value={form.renta} onChange={e => setForm({...form, renta: e.target.value})} /></div>
                <div><Label className="text-xs">Adelantos</Label><Input type="number" value={form.adelantos} onChange={e => setForm({...form, adelantos: e.target.value})} /></div>
                <div><Label className="text-xs">Ausencias</Label><Input type="number" value={form.ausencias} onChange={e => setForm({...form, ausencias: e.target.value})} /></div>
                <div><Label className="text-xs">Otras Deduc.</Label><Input type="number" value={form.otrasDeducciones} onChange={e => setForm({...form, otrasDeducciones: e.target.value})} /></div>
                <div><Label className="text-xs">Forma de Pago</Label>
                  <select className="w-full h-10 border rounded-md px-3 text-sm" style={{ borderColor: "hsl(210 20% 88%)" }} value={form.formaPago} onChange={e => setForm({...form, formaPago: e.target.value as any})}>
                    <option value="transferencia">Transferencia</option><option value="cheque">Cheque</option><option value="efectivo">Efectivo</option>
                  </select>
                </div>
              </div>
              <div className="mt-3 text-right text-sm font-bold" style={{ color: "#DC2626" }}>Total Deducciones: ₡{totals.totalDeducciones.toLocaleString("es-CR")}</div>
            </div>

            {/* Total */}
            <div className="p-4 rounded-lg text-center" style={{ background: "hsl(207 55% 12%)", color: "white" }}>
              <p className="text-xs font-medium opacity-70 uppercase tracking-wider">Neto a Pagar</p>
              <p className="text-3xl font-bold mt-1">₡{totals.neto.toLocaleString("es-CR")}</p>
            </div>

            <div><Label className="text-xs">Observaciones</Label><Input value={form.observaciones} onChange={e => setForm({...form, observaciones: e.target.value})} placeholder="Opcional" /></div>

            <Button onClick={() => createPayment.mutate({
              employeeId: Number(form.employeeId), periodId: Number(form.periodId), salarioBase: form.salarioBase,
              horasExtra: form.horasExtra, montoHorasExtra: form.montoHorasExtra, comisiones: form.comisiones,
              aguinaldo: form.aguinaldo, vacaciones: form.vacaciones, ccss: form.ccss, renta: form.renta,
              adelantos: form.adelantos, ausencias: form.ausencias, otrasDeducciones: form.otrasDeducciones,
              formaPago: form.formaPago, observaciones: form.observaciones,
            })} disabled={!form.employeeId || !form.periodId || !form.salarioBase} className="w-full font-medium" style={{ background: BRAND_RED }}>
              Guardar Pago
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================
// REPORT TAB
// ============================================
function ReportTab({ periods }: { periods: any[] }) {
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);
  const { data: report, isLoading } = trpc.inventory.payrollReportByPeriod.useQuery(
    { periodId: selectedPeriodId! },
    { enabled: !!selectedPeriodId }
  );

  return (
    <div>
      <div className="mb-4">
        <Label className="text-xs">Seleccionar Periodo</Label>
        <select className="w-full max-w-sm h-10 border rounded-md px-3 text-sm mt-1" style={{ borderColor: "hsl(210 20% 88%)" }} value={selectedPeriodId || ""} onChange={e => setSelectedPeriodId(Number(e.target.value) || null)}>
          <option value="">Seleccionar periodo...</option>
          {periods.map(p => <option key={p.id} value={p.id}>{p.nombre} ({p.fechaInicio} - {p.fechaFin})</option>)}
        </select>
      </div>

      {isLoading && <div className="flex justify-center py-8"><div className="animate-spin h-8 w-8 border-b-2 rounded-full" style={{ borderColor: BRAND_RED }} /></div>}

      {report && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-0 shadow-sm"><CardContent className="p-4">
              <p className="text-xs font-medium" style={{ color: "hsl(207 20% 45%)" }}>Total Pagos</p>
              <p className="text-2xl font-bold" style={{ color: "hsl(207 55% 15%)" }}>{report.totalPagos}</p>
            </CardContent></Card>
            <Card className="border-0 shadow-sm"><CardContent className="p-4">
              <p className="text-xs font-medium" style={{ color: "hsl(207 20% 45%)" }}>Total Ingresos</p>
              <p className="text-2xl font-bold" style={{ color: "#16A34A" }}>₡{Number(report.totalIngresos).toLocaleString("es-CR")}</p>
            </CardContent></Card>
            <Card className="border-0 shadow-sm"><CardContent className="p-4">
              <p className="text-xs font-medium" style={{ color: "hsl(207 20% 45%)" }}>Total Deducciones</p>
              <p className="text-2xl font-bold" style={{ color: "#DC2626" }}>₡{Number(report.totalDeducciones).toLocaleString("es-CR")}</p>
            </CardContent></Card>
            <Card className="border-0 shadow-sm"><CardContent className="p-4">
              <p className="text-xs font-medium" style={{ color: "hsl(207 20% 45%)" }}>Neto Total</p>
              <p className="text-2xl font-bold" style={{ color: BRAND_BLUE }}>₡{Number(report.totalNeto).toLocaleString("es-CR")}</p>
            </CardContent></Card>
          </div>

          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <table className="w-full">
              <thead style={{ background: "hsl(0 0% 98%)" }}>
                <tr className="border-b" style={{ borderColor: "hsl(210 20% 94%)" }}>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase" style={{ color: BRAND_BLUE }}>#</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase" style={{ color: BRAND_BLUE }}>Ingresos</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase" style={{ color: BRAND_BLUE }}>Deducciones</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase" style={{ color: BRAND_BLUE }}>Neto</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold uppercase" style={{ color: BRAND_BLUE }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {report.payments.map((pay: any, idx: number) => (
                  <tr key={pay.id} className="border-b hover:bg-gray-50/50" style={{ borderColor: "hsl(210 20% 94%)" }}>
                    <td className="px-4 py-3 text-sm" style={{ color: "hsl(207 20% 55%)" }}>{idx + 1}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium" style={{ color: "#16A34A" }}>₡{Number(pay.totalIngresos).toLocaleString("es-CR")}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium" style={{ color: "#DC2626" }}>₡{Number(pay.totalDeducciones).toLocaleString("es-CR")}</td>
                    <td className="px-4 py-3 text-sm text-right font-bold" style={{ color: BRAND_BLUE }}>₡{Number(pay.netoPagar).toLocaleString("es-CR")}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${pay.estado === "pagado" ? "bg-green-50 text-green-700 border" : pay.estado === "pendiente" ? "bg-amber-50 text-amber-700 border" : "bg-gray-50 text-gray-600 border"}`}>
                        {pay.estado}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
