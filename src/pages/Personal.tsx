import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Users, Clock, AlertTriangle, Plus, Trash2, Pencil, CalendarDays, Store, Scale,
} from "lucide-react";

const BRAND_RED = "#B22234";
const BRAND_BLUE = "#1B3A5C";

type Tab = "empleados" | "horarios" | "excepciones" | "resumen" | "liquidacion";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function money(n: string | number) {
  return `₡${Number(n || 0).toLocaleString("es-CR", { maximumFractionDigits: 0 })}`;
}

const TIPO_LABEL: Record<string, string> = {
  ausencia: "No llegó",
  tardanza: "Llegó tarde",
  salida_tarde: "Salió más tarde",
};

export default function PersonalPage() {
  const utils = trpc.useUtils();
  const { data: hrStores } = trpc.hr.stores.useQuery();
  const [tab, setTab] = useState<Tab>("excepciones");
  const [storeFilter, setStoreFilter] = useState<number | "all">("all");

  const storeIdNum = storeFilter === "all" ? undefined : storeFilter;
  const [desde, setDesde] = useState(monthStart());
  const [hasta, setHasta] = useState(todayStr());

  const { data: employees, isLoading: loadingEmps } = trpc.hr.employees.useQuery({ storeId: storeIdNum });
  const { data: events, isLoading: loadingEvents } = trpc.hr.events.useQuery({
    storeId: storeIdNum,
    desde,
    hasta,
  });
  const { data: summary } = trpc.hr.summaryByEmployee.useQuery({
    storeId: storeIdNum,
    desde,
    hasta,
  });

  const storeName = (id: number) => hrStores?.find((s) => s.id === id)?.name || `Tienda ${id}`;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "hsl(207 55% 15%)" }}>Personal</h1>
          <p className="text-sm mt-0.5" style={{ color: "hsl(207 20% 45%)" }}>
            Empleados, horarios, excepciones y liquidación (leyes de Costa Rica)
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Store className="w-4 h-4" style={{ color: BRAND_BLUE }} />
          <select
            className="h-10 border rounded-md px-3 text-sm bg-white"
            style={{ borderColor: "hsl(210 20% 88%)" }}
            value={storeFilter === "all" ? "all" : String(storeFilter)}
            onChange={(e) => setStoreFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
          >
            <option value="all">Todas las tiendas</option>
            {hrStores?.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4" style={{ color: BRAND_BLUE }} />
          <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-10 w-auto" />
          <span className="text-xs" style={{ color: "hsl(207 20% 45%)" }}>a</span>
          <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-10 w-auto" />
        </div>
      </div>

      <div className="flex gap-1 mb-4 border-b overflow-x-auto" style={{ borderColor: "hsl(210 20% 90%)" }}>
        {([
          ["excepciones", "Excepciones"],
          ["empleados", "Empleados"],
          ["horarios", "Horarios"],
          ["resumen", "Resumen"],
          ["liquidacion", "Liquidación"],
        ] as [Tab, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-[1px] whitespace-nowrap"
            style={{
              borderColor: tab === id ? BRAND_RED : "transparent",
              color: tab === id ? BRAND_RED : "hsl(207 20% 45%)",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "excepciones" && (
        <ExceptionsTab
          storeFilter={storeFilter}
          stores={hrStores || []}
          employees={employees || []}
          events={events || []}
          loading={loadingEvents}
          storeName={storeName}
          utils={utils}
        />
      )}
      {tab === "empleados" && (
        <EmployeesTab
          storeFilter={storeFilter}
          stores={hrStores || []}
          employees={employees || []}
          loading={loadingEmps}
          storeName={storeName}
          utils={utils}
        />
      )}
      {tab === "horarios" && (
        <SchedulesTab storeFilter={storeFilter} stores={hrStores || []} utils={utils} />
      )}
      {tab === "resumen" && (
        <SummaryTab rows={summary || []} storeName={storeName} desde={desde} hasta={hasta} />
      )}
      {tab === "liquidacion" && (
        <LiquidacionTab
          storeFilter={storeFilter}
          stores={hrStores || []}
          employees={employees || []}
          storeName={storeName}
          utils={utils}
        />
      )}
    </div>
  );
}

function EmployeesTab({
  storeFilter, stores, employees, loading, storeName, utils,
}: {
  storeFilter: number | "all";
  stores: { id: number; name: string }[];
  employees: any[];
  loading: boolean;
  storeName: (id: number) => string;
  utils: ReturnType<typeof trpc.useUtils>;
}) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    storeId: "",
    cedula: "",
    nombre: "",
    apellidos: "",
    puesto: "",
    salarioBase: "",
    tipoSalario: "quincenal" as "semanal" | "quincenal" | "mensual",
    fechaIngreso: todayStr(),
    telefono: "",
  });

  const createEmp = trpc.hr.createEmployee.useMutation({
    onSuccess: () => { utils.hr.employees.invalidate(); utils.hr.summaryByEmployee.invalidate(); setOpen(false); reset(); },
    onError: (e) => setError(e.message),
  });
  const updateEmp = trpc.hr.updateEmployee.useMutation({
    onSuccess: () => { utils.hr.employees.invalidate(); utils.hr.summaryByEmployee.invalidate(); setOpen(false); reset(); },
    onError: (e) => setError(e.message),
  });
  const deleteEmp = trpc.hr.deleteEmployee.useMutation({
    onSuccess: () => { utils.hr.employees.invalidate(); utils.hr.summaryByEmployee.invalidate(); },
  });

  function reset() {
    setEditingId(null);
    setError("");
    setForm({
      storeId: storeFilter === "all" ? "" : String(storeFilter),
      cedula: "",
      nombre: "",
      apellidos: "",
      puesto: "",
      salarioBase: "",
      tipoSalario: "quincenal",
      fechaIngreso: todayStr(),
      telefono: "",
    });
  }

  function openCreate() {
    reset();
    setOpen(true);
  }

  function openEdit(emp: any) {
    setEditingId(emp.id);
    setError("");
    setForm({
      storeId: String(emp.storeId),
      cedula: emp.cedula || "",
      nombre: emp.nombre,
      apellidos: emp.apellidos,
      puesto: emp.puesto,
      salarioBase: String(emp.salarioBase),
      tipoSalario: emp.tipoSalario,
      fechaIngreso: emp.fechaIngreso,
      telefono: emp.telefono || "",
    });
    setOpen(true);
  }

  function save() {
    setError("");
    if (!form.storeId || !form.nombre.trim() || !form.apellidos.trim() || !form.puesto.trim() || !form.salarioBase) {
      setError("Completá tienda, nombre, apellidos, puesto y salario");
      return;
    }
    const payload = {
      storeId: Number(form.storeId),
      cedula: form.cedula || undefined,
      nombre: form.nombre,
      apellidos: form.apellidos,
      puesto: form.puesto,
      salarioBase: form.salarioBase,
      tipoSalario: form.tipoSalario,
      fechaIngreso: form.fechaIngreso,
      telefono: form.telefono || undefined,
    };
    if (editingId) updateEmp.mutate({ id: editingId, ...payload });
    else createEmp.mutate(payload);
  }

  if (loading) return <p className="text-sm" style={{ color: "hsl(207 20% 45%)" }}>Cargando…</p>;

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button onClick={openCreate} className="font-medium" style={{ background: BRAND_RED }}>
          <Plus className="w-4 h-4 mr-2" />
          Nuevo empleado
        </Button>
      </div>

      <div className="space-y-3">
        {employees.length === 0 && (
          <Card className="border shadow-sm">
            <CardContent className="p-6 text-sm" style={{ color: "hsl(207 20% 45%)" }}>
              Todavía no hay empleados. Agregá el primero para poder registrar faltas o tardanzas.
            </CardContent>
          </Card>
        )}
        {employees.map((emp) => (
          <Card key={emp.id} className="border shadow-sm">
            <CardContent className="p-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Users className="w-4 h-4 shrink-0" style={{ color: BRAND_BLUE }} />
                  <h3 className="font-semibold text-sm" style={{ color: "hsl(207 55% 15%)" }}>
                    {emp.nombre} {emp.apellidos}
                  </h3>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
                    style={{ background: emp.estado === "activo" ? "rgba(22,163,74,0.12)" : "rgba(107,114,128,0.12)", color: emp.estado === "activo" ? "#16A34A" : "#6B7280" }}>
                    {emp.estado}
                  </span>
                </div>
                <p className="text-xs mt-1" style={{ color: "hsl(207 20% 45%)" }}>
                  {emp.puesto} · {storeName(emp.storeId)} · Ingreso {emp.fechaIngreso}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "hsl(207 20% 55%)" }}>
                  {money(emp.salarioBase)} / {emp.tipoSalario}
                  {emp.cedula ? ` · Céd. ${emp.cedula}` : ""}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="sm" className="h-10 w-10 p-0" onClick={() => openEdit(emp)}>
                  <Pencil className="w-4 h-4" style={{ color: BRAND_BLUE }} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-10 w-10 p-0"
                  onClick={() => {
                    if (confirm(`¿Quitar a ${emp.nombre} ${emp.apellidos}?`)) deleteEmp.mutate({ id: emp.id });
                  }}
                >
                  <Trash2 className="w-4 h-4" style={{ color: BRAND_RED }} />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar empleado" : "Nuevo empleado"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <Label>Tienda</Label>
              <select
                className="w-full h-10 border rounded-md px-3 text-sm"
                style={{ borderColor: "hsl(210 20% 88%)" }}
                value={form.storeId}
                onChange={(e) => setForm({ ...form, storeId: e.target.value })}
              >
                <option value="">Seleccionar</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Nombre</Label>
                <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
              </div>
              <div>
                <Label>Apellidos</Label>
                <Input value={form.apellidos} onChange={(e) => setForm({ ...form, apellidos: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Puesto</Label>
                <Input value={form.puesto} onChange={(e) => setForm({ ...form, puesto: e.target.value })} />
              </div>
              <div>
                <Label>Cédula</Label>
                <Input value={form.cedula} onChange={(e) => setForm({ ...form, cedula: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Salario base</Label>
                <Input type="number" value={form.salarioBase} onChange={(e) => setForm({ ...form, salarioBase: e.target.value })} />
              </div>
              <div>
                <Label>Tipo de pago</Label>
                <select
                  className="w-full h-10 border rounded-md px-3 text-sm"
                  style={{ borderColor: "hsl(210 20% 88%)" }}
                  value={form.tipoSalario}
                  onChange={(e) => setForm({ ...form, tipoSalario: e.target.value as any })}
                >
                  <option value="semanal">Semanal</option>
                  <option value="quincenal">Quincenal</option>
                  <option value="mensual">Mensual</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Fecha de ingreso</Label>
                <Input type="date" value={form.fechaIngreso} onChange={(e) => setForm({ ...form, fechaIngreso: e.target.value })} />
              </div>
              <div>
                <Label>Teléfono</Label>
                <Input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button
              className="w-full font-medium"
              style={{ background: BRAND_RED }}
              disabled={createEmp.isPending || updateEmp.isPending}
              onClick={save}
            >
              {createEmp.isPending || updateEmp.isPending ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SchedulesTab({
  storeFilter, stores, utils,
}: {
  storeFilter: number | "all";
  stores: { id: number; name: string }[];
  utils: ReturnType<typeof trpc.useUtils>;
}) {
  const [selectedStore, setSelectedStore] = useState<number | "">(
    storeFilter === "all" ? (stores[0]?.id ?? "") : storeFilter,
  );

  useEffect(() => {
    if (storeFilter !== "all") {
      setSelectedStore(storeFilter);
      return;
    }
    if (!selectedStore && stores[0]?.id) setSelectedStore(stores[0].id);
  }, [storeFilter, stores, selectedStore]);

  const storeId = typeof selectedStore === "number" ? selectedStore : Number(selectedStore) || 0;

  const { data: schedule, isLoading } = trpc.hr.schedule.useQuery(
    { storeId },
    { enabled: storeId > 0 },
  );

  const [days, setDays] = useState<any[] | null>(null);
  const [error, setError] = useState("");
  const [savedNote, setSavedNote] = useState("");

  const displayDays = days ?? schedule ?? [];

  useEffect(() => {
    setDays(null);
    setError("");
    setSavedNote("");
  }, [storeId, schedule]);

  const saveSchedule = trpc.hr.saveSchedule.useMutation({
    onSuccess: () => {
      utils.hr.schedule.invalidate();
      setDays(null);
      setSavedNote("Horario guardado");
      setError("");
    },
    onError: (e) => setError(e.message),
  });

  function updateDay(diaSemana: number, patch: Record<string, unknown>) {
    const base = (days ?? schedule ?? []).map((d: any) => ({ ...d }));
    const idx = base.findIndex((d: any) => d.diaSemana === diaSemana);
    if (idx >= 0) base[idx] = { ...base[idx], ...patch };
    setDays(base);
    setSavedNote("");
  }

  if (!stores.length) {
    return <p className="text-sm" style={{ color: "hsl(207 20% 45%)" }}>No hay tiendas configuradas.</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Label className="text-sm">Tienda</Label>
        <select
          className="h-10 border rounded-md px-3 text-sm bg-white"
          style={{ borderColor: "hsl(210 20% 88%)" }}
          value={storeId || ""}
          onChange={(e) => setSelectedStore(Number(e.target.value))}
        >
          {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <Button
          className="font-medium"
          style={{ background: BRAND_BLUE }}
          disabled={!storeId || saveSchedule.isPending || displayDays.length === 0}
          onClick={() => {
            saveSchedule.mutate({
              storeId,
              days: displayDays.map((d: any) => ({
                diaSemana: d.diaSemana,
                laborable: !!d.laborable,
                horaEntrada: d.horaEntrada,
                horaSalida: d.horaSalida,
              })),
            });
          }}
        >
          {saveSchedule.isPending ? "Guardando…" : "Guardar horario"}
        </Button>
      </div>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
      {savedNote && <p className="text-sm text-green-700 mb-3">{savedNote}</p>}
      {isLoading && <p className="text-sm" style={{ color: "hsl(207 20% 45%)" }}>Cargando horario…</p>}

      <div className="space-y-2">
        {displayDays.map((d: any) => (
          <Card key={d.diaSemana} className="border shadow-sm">
            <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-4 gap-3 items-center">
              <div className="font-semibold text-sm" style={{ color: "hsl(207 55% 15%)" }}>
                {d.diaLabel || `Día ${d.diaSemana}`}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!d.laborable}
                  onChange={(e) => updateDay(d.diaSemana, { laborable: e.target.checked })}
                />
                Laborable
              </label>
              <div>
                <Label className="text-xs">Entrada</Label>
                <Input
                  type="time"
                  value={d.horaEntrada}
                  disabled={!d.laborable}
                  onChange={(e) => updateDay(d.diaSemana, { horaEntrada: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Salida</Label>
                <Input
                  type="time"
                  value={d.horaSalida}
                  disabled={!d.laborable}
                  onChange={(e) => updateDay(d.diaSemana, { horaSalida: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-xs mt-3" style={{ color: "hsl(207 20% 45%)" }}>
        Cada tienda tiene su propio horario. Las tardanzas y salidas tarde se calculan contra este horario.
      </p>
    </div>
  );
}

function ExceptionsTab({
  storeFilter, stores, employees, events, loading, storeName, utils,
}: {
  storeFilter: number | "all";
  stores: { id: number; name: string }[];
  employees: any[];
  events: any[];
  loading: boolean;
  storeName: (id: number) => string;
  utils: ReturnType<typeof trpc.useUtils>;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    storeId: storeFilter === "all" ? "" : String(storeFilter),
    employeeId: "",
    fecha: todayStr(),
    tipo: "tardanza" as "ausencia" | "tardanza" | "salida_tarde",
    horaReal: "",
    justificada: false,
    nota: "",
  });

  const empsForStore = useMemo(() => {
    if (!form.storeId) return employees.filter((e) => e.estado === "activo");
    return employees.filter((e) => e.estado === "activo" && e.storeId === Number(form.storeId));
  }, [employees, form.storeId]);

  const createEvent = trpc.hr.createEvent.useMutation({
    onSuccess: () => {
      utils.hr.events.invalidate();
      utils.hr.summaryByEmployee.invalidate();
      setOpen(false);
      setError("");
      setForm({
        storeId: storeFilter === "all" ? "" : String(storeFilter),
        employeeId: "",
        fecha: todayStr(),
        tipo: "tardanza",
        horaReal: "",
        justificada: false,
        nota: "",
      });
    },
    onError: (e) => setError(e.message),
  });
  const deleteEvent = trpc.hr.deleteEvent.useMutation({
    onSuccess: () => { utils.hr.events.invalidate(); utils.hr.summaryByEmployee.invalidate(); },
  });

  function save() {
    setError("");
    if (!form.storeId || !form.employeeId || !form.fecha) {
      setError("Completá tienda, empleado y fecha");
      return;
    }
    if (form.tipo !== "ausencia" && !form.horaReal) {
      setError("Indicá la hora real");
      return;
    }
    createEvent.mutate({
      storeId: Number(form.storeId),
      employeeId: Number(form.employeeId),
      fecha: form.fecha,
      tipo: form.tipo,
      horaReal: form.tipo === "ausencia" ? undefined : form.horaReal,
      justificada: form.justificada,
      nota: form.nota || undefined,
    });
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <p className="text-sm" style={{ color: "hsl(207 20% 45%)" }}>
          Solo registrá lo que salió de lo normal. Si no hay registro, se asume que cumplió horario.
        </p>
        <Button
          className="font-medium shrink-0"
          style={{ background: BRAND_RED }}
          onClick={() => {
            setError("");
            setForm({
              storeId: storeFilter === "all" ? "" : String(storeFilter),
              employeeId: "",
              fecha: todayStr(),
              tipo: "tardanza",
              horaReal: "",
              justificada: false,
              nota: "",
            });
            setOpen(true);
          }}
        >
          <Plus className="w-4 h-4 mr-2" />
          Registrar excepción
        </Button>
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: "hsl(207 20% 45%)" }}>Cargando…</p>
      ) : events.length === 0 ? (
        <Card className="border shadow-sm">
          <CardContent className="p-6 text-sm" style={{ color: "hsl(207 20% 45%)" }}>
            No hay excepciones en este rango. Si alguien faltó o llegó tarde, registralo acá.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {events.map((ev) => (
            <Card key={ev.id} className="border shadow-sm">
              <CardContent className="p-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: ev.tipo === "salida_tarde" ? "#16A34A" : BRAND_RED }} />
                    <span className="font-semibold text-sm" style={{ color: "hsl(207 55% 15%)" }}>
                      {TIPO_LABEL[ev.tipo] || ev.tipo}
                    </span>
                    <span className="text-xs" style={{ color: "hsl(207 20% 45%)" }}>{ev.fecha}</span>
                    {ev.justificada && (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                        Justificada
                      </span>
                    )}
                  </div>
                  <p className="text-sm mt-1" style={{ color: "hsl(207 55% 15%)" }}>{ev.empleadoNombre}</p>
                  <p className="text-xs mt-0.5" style={{ color: "hsl(207 20% 45%)" }}>
                    {storeName(ev.storeId)}
                    {ev.horaProgramada ? ` · Programado ${ev.horaProgramada}` : ""}
                    {ev.horaReal ? ` · Real ${ev.horaReal}` : ""}
                    {ev.tipo !== "ausencia" ? ` · ${ev.minutos} min` : ""}
                  </p>
                  {ev.nota && <p className="text-xs mt-1 italic" style={{ color: "hsl(207 20% 55%)" }}>{ev.nota}</p>}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-10 w-10 p-0 shrink-0"
                  onClick={() => {
                    if (confirm("¿Eliminar esta excepción?")) deleteEvent.mutate({ id: ev.id });
                  }}
                >
                  <Trash2 className="w-4 h-4" style={{ color: BRAND_RED }} />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar excepción</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <Label>Qué pasó</Label>
              <select
                className="w-full h-10 border rounded-md px-3 text-sm"
                style={{ borderColor: "hsl(210 20% 88%)" }}
                value={form.tipo}
                onChange={(e) => setForm({ ...form, tipo: e.target.value as any, horaReal: "" })}
              >
                <option value="ausencia">No llegó</option>
                <option value="tardanza">Llegó tarde</option>
                <option value="salida_tarde">Salió más tarde</option>
              </select>
            </div>
            <div>
              <Label>Tienda</Label>
              <select
                className="w-full h-10 border rounded-md px-3 text-sm"
                style={{ borderColor: "hsl(210 20% 88%)" }}
                value={form.storeId}
                onChange={(e) => setForm({ ...form, storeId: e.target.value, employeeId: "" })}
              >
                <option value="">Seleccionar</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <Label>Empleado</Label>
              <select
                className="w-full h-10 border rounded-md px-3 text-sm"
                style={{ borderColor: "hsl(210 20% 88%)" }}
                value={form.employeeId}
                onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
              >
                <option value="">Seleccionar</option>
                {empsForStore.map((e) => (
                  <option key={e.id} value={e.id}>{e.nombre} {e.apellidos}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Fecha</Label>
                <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
              </div>
              {form.tipo !== "ausencia" && (
                <div>
                  <Label>{form.tipo === "tardanza" ? "Hora en que llegó" : "Hora en que salió"}</Label>
                  <Input type="time" value={form.horaReal} onChange={(e) => setForm({ ...form, horaReal: e.target.value })} />
                </div>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.justificada}
                onChange={(e) => setForm({ ...form, justificada: e.target.checked })}
              />
              Justificada
            </label>
            <div>
              <Label>Nota (opcional)</Label>
              <Input value={form.nota} onChange={(e) => setForm({ ...form, nota: e.target.value })} placeholder="Ej. tráfico, permiso, etc." />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button
              className="w-full font-medium"
              style={{ background: BRAND_RED }}
              disabled={createEvent.isPending}
              onClick={save}
            >
              {createEvent.isPending ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryTab({
  rows, storeName, desde, hasta,
}: {
  rows: any[];
  storeName: (id: number) => string;
  desde: string;
  hasta: string;
}) {
  return (
    <div>
      <p className="text-sm mb-4" style={{ color: "hsl(207 20% 45%)" }}>
        Totales del {desde} al {hasta}. Solo cuenta lo que registraste como excepción.
      </p>
      {rows.length === 0 ? (
        <Card className="border shadow-sm">
          <CardContent className="p-6 text-sm" style={{ color: "hsl(207 20% 45%)" }}>
            No hay empleados activos para mostrar.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Card key={r.employeeId} className="border shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-4 h-4" style={{ color: BRAND_BLUE }} />
                  <h3 className="font-semibold text-sm" style={{ color: "hsl(207 55% 15%)" }}>{r.nombre}</h3>
                  <span className="text-xs" style={{ color: "hsl(207 20% 45%)" }}>{storeName(r.storeId)} · {r.puesto}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="rounded-lg px-3 py-2" style={{ background: "hsl(210 40% 98%)" }}>
                    <div style={{ color: "hsl(207 20% 45%)" }}>Ausencias</div>
                    <div className="font-bold text-sm" style={{ color: "hsl(207 55% 15%)" }}>
                      {r.ausencias}{r.ausenciasInjustificadas ? ` (${r.ausenciasInjustificadas} inj.)` : ""}
                    </div>
                  </div>
                  <div className="rounded-lg px-3 py-2" style={{ background: "hsl(210 40% 98%)" }}>
                    <div style={{ color: "hsl(207 20% 45%)" }}>Tardanzas</div>
                    <div className="font-bold text-sm" style={{ color: "hsl(207 55% 15%)" }}>
                      {r.tardanzas} · {r.minutosTarde} min
                    </div>
                  </div>
                  <div className="rounded-lg px-3 py-2" style={{ background: "hsl(210 40% 98%)" }}>
                    <div style={{ color: "hsl(207 20% 45%)" }}>Salidas tarde</div>
                    <div className="font-bold text-sm" style={{ color: "hsl(207 55% 15%)" }}>
                      {r.salidasTarde}
                    </div>
                  </div>
                  <div className="rounded-lg px-3 py-2" style={{ background: "hsl(210 40% 98%)" }}>
                    <div style={{ color: "hsl(207 20% 45%)" }}>Min. extra</div>
                    <div className="font-bold text-sm" style={{ color: "hsl(207 55% 15%)" }}>
                      {r.minutosExtra} min
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

const SALIDA_LABEL: Record<string, string> = {
  renuncia: "Renuncia",
  despido_con_responsabilidad: "Despido con responsabilidad",
  despido_sin_responsabilidad: "Despido sin responsabilidad",
};

function LiquidacionTab({
  storeFilter, stores, employees, storeName, utils,
}: {
  storeFilter: number | "all";
  stores: { id: number; name: string }[];
  employees: any[];
  storeName: (id: number) => string;
  utils: ReturnType<typeof trpc.useUtils>;
}) {
  const storeIdNum = storeFilter === "all" ? undefined : storeFilter;
  const { data: saved, isLoading: loadingSaved } = trpc.hr.liquidaciones.useQuery({ storeId: storeIdNum });

  const [form, setForm] = useState({
    employeeId: "",
    tipoSalida: "despido_con_responsabilidad" as "renuncia" | "despido_con_responsabilidad" | "despido_sin_responsabilidad",
    fechaSalida: todayStr(),
    promedioMensual: "",
    pagaPreaviso: true,
    diasVacaciones: "",
    sumaSalariosAguinaldo: "",
    salariosPendientes: "",
    marcarInactivo: true,
    nota: "",
  });
  const [preview, setPreview] = useState<any | null>(null);
  const [error, setError] = useState("");

  const emps = useMemo(() => {
    const list = employees.filter((e) => e.estado === "activo");
    if (storeFilter === "all") return list;
    return list.filter((e) => e.storeId === storeFilter);
  }, [employees, storeFilter]);

  const selected = emps.find((e) => e.id === Number(form.employeeId));

  useEffect(() => {
    if (selected && !form.promedioMensual) {
      setForm((f) => ({ ...f, promedioMensual: String(selected.salarioBase) }));
    }
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const previewMut = trpc.hr.previewLiquidacion.useMutation({
    onSuccess: (data) => { setPreview(data); setError(""); },
    onError: (e) => setError(e.message),
  });
  const saveMut = trpc.hr.saveLiquidacion.useMutation({
    onSuccess: () => {
      utils.hr.liquidaciones.invalidate();
      utils.hr.employees.invalidate();
      setError("");
      alert("Liquidación guardada");
    },
    onError: (e) => setError(e.message),
  });
  const deleteMut = trpc.hr.deleteLiquidacion.useMutation({
    onSuccess: () => utils.hr.liquidaciones.invalidate(),
  });

  function buildInput() {
    return {
      employeeId: Number(form.employeeId),
      tipoSalida: form.tipoSalida,
      fechaSalida: form.fechaSalida,
      promedioMensual: form.promedioMensual || undefined,
      pagaPreaviso: form.pagaPreaviso,
      diasVacaciones: form.diasVacaciones !== "" ? Number(form.diasVacaciones) : undefined,
      sumaSalariosAguinaldo: form.sumaSalariosAguinaldo || undefined,
      salariosPendientes: form.salariosPendientes || undefined,
      marcarInactivo: form.marcarInactivo,
      nota: form.nota || undefined,
    };
  }

  function calc() {
    setError("");
    if (!form.employeeId) {
      setError("Seleccioná un empleado");
      return;
    }
    previewMut.mutate(buildInput());
  }

  return (
    <div className="space-y-6">
      <Card className="border shadow-sm">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Scale className="w-5 h-5" style={{ color: BRAND_RED }} />
            <h2 className="font-semibold" style={{ color: "hsl(207 55% 15%)" }}>Calcular liquidación</h2>
          </div>
          <p className="text-xs" style={{ color: "hsl(207 20% 45%)" }}>
            Estimación según Código de Trabajo (Arts. 28–30), aguinaldo y vacaciones. Orientativo — confirmá casos especiales con MTSS o abogado laboral.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Empleado</Label>
              <select
                className="w-full h-10 border rounded-md px-3 text-sm"
                style={{ borderColor: "hsl(210 20% 88%)" }}
                value={form.employeeId}
                onChange={(e) => {
                  const emp = emps.find((x) => x.id === Number(e.target.value));
                  setForm({
                    ...form,
                    employeeId: e.target.value,
                    promedioMensual: emp ? String(emp.salarioBase) : "",
                  });
                  setPreview(null);
                }}
              >
                <option value="">Seleccionar</option>
                {emps.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre} {e.apellidos} · {storeName(e.storeId)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Tipo de salida</Label>
              <select
                className="w-full h-10 border rounded-md px-3 text-sm"
                style={{ borderColor: "hsl(210 20% 88%)" }}
                value={form.tipoSalida}
                onChange={(e) => {
                  setForm({ ...form, tipoSalida: e.target.value as any });
                  setPreview(null);
                }}
              >
                <option value="renuncia">Renuncia</option>
                <option value="despido_con_responsabilidad">Despido con responsabilidad</option>
                <option value="despido_sin_responsabilidad">Despido sin responsabilidad (falta grave)</option>
              </select>
            </div>
            <div>
              <Label>Fecha de salida</Label>
              <Input
                type="date"
                value={form.fechaSalida}
                onChange={(e) => { setForm({ ...form, fechaSalida: e.target.value }); setPreview(null); }}
              />
            </div>
            <div>
              <Label>Promedio salarial mensual (últimos 6 meses)</Label>
              <Input
                type="number"
                value={form.promedioMensual}
                onChange={(e) => setForm({ ...form, promedioMensual: e.target.value })}
                placeholder="Ej. 450000"
              />
            </div>
            <div>
              <Label>Días vacaciones a pagar (opcional)</Label>
              <Input
                type="number"
                value={form.diasVacaciones}
                onChange={(e) => setForm({ ...form, diasVacaciones: e.target.value })}
                placeholder="Vacío = cálculo proporcional"
              />
            </div>
            <div>
              <Label>Suma salarios aguinaldo (opcional)</Label>
              <Input
                type="number"
                value={form.sumaSalariosAguinaldo}
                onChange={(e) => setForm({ ...form, sumaSalariosAguinaldo: e.target.value })}
                placeholder="Vacío = promedio × meses del período"
              />
            </div>
            <div>
              <Label>Salarios pendientes</Label>
              <Input
                type="number"
                value={form.salariosPendientes}
                onChange={(e) => setForm({ ...form, salariosPendientes: e.target.value })}
                placeholder="0"
              />
            </div>
            <div>
              <Label>Nota</Label>
              <Input value={form.nota} onChange={(e) => setForm({ ...form, nota: e.target.value })} />
            </div>
          </div>

          {form.tipoSalida === "despido_con_responsabilidad" && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.pagaPreaviso}
                onChange={(e) => setForm({ ...form, pagaPreaviso: e.target.checked })}
              />
              Pagar preaviso en dinero (no se trabajó el aviso)
            </label>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.marcarInactivo}
              onChange={(e) => setForm({ ...form, marcarInactivo: e.target.checked })}
            />
            Al guardar, marcar empleado como inactivo
          </label>

          {selected && (
            <p className="text-xs" style={{ color: "hsl(207 20% 45%)" }}>
              Ingreso: {selected.fechaIngreso} · Puesto: {selected.puesto} · Pago: {selected.tipoSalario}
            </p>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              className="font-medium"
              style={{ background: BRAND_BLUE }}
              disabled={previewMut.isPending}
              onClick={calc}
            >
              {previewMut.isPending ? "Calculando…" : "Calcular"}
            </Button>
            <Button
              className="font-medium"
              style={{ background: BRAND_RED }}
              disabled={!preview || saveMut.isPending}
              onClick={() => {
                if (!confirm(`¿Guardar liquidación por ${money(preview.total)}?`)) return;
                saveMut.mutate(buildInput());
              }}
            >
              {saveMut.isPending ? "Guardando…" : "Guardar liquidación"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {preview && (
        <Card className="border shadow-sm">
          <CardContent className="p-5 space-y-4">
            <div>
              <h3 className="font-semibold text-lg" style={{ color: "hsl(207 55% 15%)" }}>
                {preview.employee.nombre}
              </h3>
              <p className="text-xs" style={{ color: "hsl(207 20% 45%)" }}>
                {SALIDA_LABEL[form.tipoSalida]} · Antigüedad {preview.antigüedadLabel} · Diario {money(preview.salarioDiario)}
              </p>
            </div>

            <div className="space-y-2">
              {preview.rubros.map((r: any) => (
                <div
                  key={r.id}
                  className="flex items-start justify-between gap-3 py-2 border-b"
                  style={{ borderColor: "hsl(210 20% 94%)" }}
                >
                  <div>
                    <div className="text-sm font-medium" style={{ color: "hsl(207 55% 15%)" }}>{r.label}</div>
                    <div className="text-xs" style={{ color: "hsl(207 20% 45%)" }}>{r.detalle}</div>
                  </div>
                  <div className="font-semibold text-sm whitespace-nowrap">{money(r.monto)}</div>
                </div>
              ))}
            </div>

            <div
              className="flex items-center justify-between rounded-lg px-4 py-3"
              style={{ background: "rgba(178,34,52,0.08)" }}
            >
              <span className="font-bold" style={{ color: BRAND_RED }}>Total estimado</span>
              <span className="font-bold text-lg" style={{ color: BRAND_RED }}>{money(preview.total)}</span>
            </div>

            {preview.advertencias?.length > 0 && (
              <ul className="text-xs space-y-1" style={{ color: "#92400E" }}>
                {preview.advertencias.map((a: string, i: number) => (
                  <li key={i}>• {a}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <div>
        <h3 className="font-semibold mb-3" style={{ color: "hsl(207 55% 15%)" }}>Liquidaciones guardadas</h3>
        {loadingSaved ? (
          <p className="text-sm" style={{ color: "hsl(207 20% 45%)" }}>Cargando…</p>
        ) : !saved?.length ? (
          <Card className="border shadow-sm">
            <CardContent className="p-5 text-sm" style={{ color: "hsl(207 20% 45%)" }}>
              Todavía no hay liquidaciones guardadas.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {saved.map((row) => (
              <Card key={row.id} className="border shadow-sm">
                <CardContent className="p-4 flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-sm" style={{ color: "hsl(207 55% 15%)" }}>
                      {row.empleadoNombre}
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: "hsl(207 20% 45%)" }}>
                      {row.tipoSalidaLabel} · Salida {row.fechaSalida} · {storeName(row.storeId)}
                    </p>
                    <p className="text-sm font-bold mt-1" style={{ color: BRAND_RED }}>{money(row.total)}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-10 w-10 p-0"
                    onClick={() => {
                      if (confirm("¿Eliminar esta liquidación guardada?")) deleteMut.mutate({ id: row.id });
                    }}
                  >
                    <Trash2 className="w-4 h-4" style={{ color: BRAND_RED }} />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
