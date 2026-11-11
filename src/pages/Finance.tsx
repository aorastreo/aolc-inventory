import { useMemo, useState } from "react";
import { trpc } from "@/providers/trpc";
import { useLocalAuth } from "@/hooks/useLocalAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Wallet, Plus, Trash2, TrendingUp, TrendingDown, AlertTriangle,
  CheckCircle2, ArrowDownCircle, ArrowUpCircle, Store,
} from "lucide-react";

const BRAND_RED = "#B22234";
const BRAND_BLUE = "#1B3A5C";

function money(n: number) {
  return `₡${Number(n || 0).toLocaleString("es-CR", { maximumFractionDigits: 0 })}`;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function weekStart() {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1; // Monday
  d.setDate(d.getDate() - diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const METODOS = [
  { id: "efectivo", label: "Efectivo" },
  { id: "sinpe", label: "SINPE" },
  { id: "tarjeta", label: "Tarjeta" },
  { id: "transferencia", label: "Transferencia" },
  { id: "otro", label: "Otro" },
] as const;

type Tipo = "ingreso" | "egreso";

export default function FinancePage() {
  const { user } = useLocalAuth();
  const utils = trpc.useUtils();
  const { data: financeStores } = trpc.finance.financeStores.useQuery();
  const { data: categories } = trpc.finance.categories.useQuery();

  const [storeFilter, setStoreFilter] = useState<number | "all">("all");
  const [desde, setDesde] = useState(monthStart());
  const [hasta, setHasta] = useState(todayStr());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formError, setFormError] = useState("");

  const [form, setForm] = useState({
    storeId: "" as string,
    tipo: "ingreso" as Tipo,
    categoria: "ventas",
    monto: "",
    fecha: todayStr(),
    metodoPago: "efectivo" as typeof METODOS[number]["id"],
    descripcion: "",
  });

  const listInput = {
    storeId: storeFilter === "all" ? undefined : storeFilter,
    desde,
    hasta,
  };

  const { data: summary, isLoading: loadingSummary } = trpc.finance.summary.useQuery(listInput);
  const { data: entries, isLoading: loadingList } = trpc.finance.list.useQuery(listInput);

  const createEntry = trpc.finance.create.useMutation({
    onSuccess: () => {
      utils.finance.list.invalidate();
      utils.finance.summary.invalidate();
      setDialogOpen(false);
      setFormError("");
      setForm((f) => ({
        ...f,
        monto: "",
        descripcion: "",
        fecha: todayStr(),
      }));
    },
    onError: (err) => setFormError(err.message),
  });

  const removeEntry = trpc.finance.remove.useMutation({
    onSuccess: () => {
      utils.finance.list.invalidate();
      utils.finance.summary.invalidate();
    },
    onError: (err) => alert(err.message),
  });

  const catOptions = useMemo(() => {
    if (!categories) return [];
    return form.tipo === "ingreso" ? categories.ingreso : categories.egreso;
  }, [categories, form.tipo]);

  const catLabel = (tipo: string, id: string) => {
    const list = tipo === "ingreso" ? categories?.ingreso : categories?.egreso;
    return list?.find((c) => c.id === id)?.label || id;
  };

  const storeLabel = (id: number) => financeStores?.find((s) => s.id === id)?.name || `Tienda #${id}`;

  const openCreate = (tipo: Tipo = "ingreso") => {
    const defaultStore = storeFilter !== "all"
      ? String(storeFilter)
      : (financeStores?.[0] ? String(financeStores[0].id) : "");
    const defaultCat = tipo === "ingreso" ? "ventas" : "varios";
    setForm({
      storeId: defaultStore,
      tipo,
      categoria: defaultCat,
      monto: "",
      fecha: todayStr(),
      metodoPago: "efectivo",
      descripcion: "",
    });
    setFormError("");
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    const storeId = Number(form.storeId);
    const monto = Number(form.monto);
    if (!storeId) {
      setFormError("Elegí una tienda");
      return;
    }
    if (!monto || monto <= 0) {
      setFormError("Monto inválido");
      return;
    }
    if (!form.fecha) {
      setFormError("Fecha requerida");
      return;
    }
    createEntry.mutate({
      storeId,
      tipo: form.tipo,
      categoria: form.categoria,
      monto,
      fecha: form.fecha,
      metodoPago: form.metodoPago,
      descripcion: form.descripcion.trim() || undefined,
    });
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" style={{ color: "hsl(207 55% 15%)" }}>
            <Wallet className="w-6 h-6" style={{ color: BRAND_RED }} />
            Finanzas
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "hsl(207 20% 45%)" }}>
            Libro manual de ingresos y egresos · Los Chiles, Pavón y Santa Rosa · no se conecta a cierres ni inventario
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-10 font-medium" onClick={() => openCreate("ingreso")}>
            <ArrowUpCircle className="w-4 h-4 mr-2 text-green-600" />
            Digitar ingreso
          </Button>
          <Button className="h-10 font-medium" style={{ background: BRAND_RED }} onClick={() => openCreate("egreso")}>
            <ArrowDownCircle className="w-4 h-4 mr-2" />
            Digitar egreso
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="mb-5 border shadow-sm">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setStoreFilter("all")}
              className="px-3 py-1.5 rounded-md text-sm font-medium border"
              style={{
                background: storeFilter === "all" ? BRAND_BLUE : "#fff",
                color: storeFilter === "all" ? "#fff" : BRAND_BLUE,
                borderColor: "hsl(210 20% 88%)",
              }}
            >
              Todas las tiendas
            </button>
            {(financeStores || []).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStoreFilter(s.id)}
                className="px-3 py-1.5 rounded-md text-sm font-medium border flex items-center gap-1.5"
                style={{
                  background: storeFilter === s.id ? BRAND_BLUE : "#fff",
                  color: storeFilter === s.id ? "#fff" : BRAND_BLUE,
                  borderColor: "hsl(210 20% 88%)",
                }}
              >
                <Store className="w-3.5 h-3.5" />
                {s.name}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-xs">Desde</Label>
              <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-9 w-40" />
            </div>
            <div>
              <Label className="text-xs">Hasta</Label>
              <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-9 w-40" />
            </div>
            <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => { setDesde(todayStr()); setHasta(todayStr()); }}>Hoy</Button>
            <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => { setDesde(weekStart()); setHasta(todayStr()); }}>Esta semana</Button>
            <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => { setDesde(monthStart()); setHasta(todayStr()); }}>Este mes</Button>
          </div>
        </CardContent>
      </Card>

      {/* Alerts */}
      {summary?.alerts?.map((a) => (
        <div
          key={a.code}
          className="mb-3 p-4 rounded-lg border flex gap-3 items-start"
          style={{
            background: a.level === "critical" ? "#FEF2F2" : a.level === "warning" ? "#FFFBEB" : "#F0FDF4",
            borderColor: a.level === "critical" ? "#FECACA" : a.level === "warning" ? "#FDE68A" : "#BBF7D0",
          }}
        >
          {a.level === "ok" ? (
            <CheckCircle2 className="w-5 h-5 mt-0.5 text-green-600 shrink-0" />
          ) : a.level === "critical" ? (
            <AlertTriangle className="w-5 h-5 mt-0.5 text-red-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 mt-0.5 text-amber-600 shrink-0" />
          )}
          <div>
            <p className="text-sm font-semibold" style={{ color: "hsl(207 55% 15%)" }}>{a.title}</p>
            <p className="text-sm mt-0.5" style={{ color: "hsl(207 20% 40%)" }}>{a.detail}</p>
          </div>
        </div>
      ))}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Kpi label="Ingresos" value={money(summary?.ingresos || 0)} icon={TrendingUp} color="#16A34A" />
        <Kpi label="Egresos" value={money(summary?.egresos || 0)} icon={TrendingDown} color={BRAND_RED} />
        <Kpi
          label="Caja neta"
          value={money(summary?.netoCaja || 0)}
          icon={Wallet}
          color={(summary?.netoCaja || 0) >= 0 ? BRAND_BLUE : "#DC2626"}
        />
        <Kpi label="Compras mercadería" value={money(summary?.comprasMercaderia || 0)} icon={ArrowDownCircle} color="#B45309" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card className="border shadow-sm lg:col-span-1">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: BRAND_BLUE }}>Desglose del periodo</p>
            <div className="space-y-2 text-sm">
              <Row label="Ventas digitadas" value={money(summary?.ventas || 0)} />
              <Row label="Otros ingresos" value={money(summary?.otrosIngresos || 0)} />
              <Row label="Gastos operativos" value={money(summary?.gastosOperativos || 0)} />
              <Row label="Utilidad operativa*" value={money(summary?.utilidadOperativa || 0)} bold />
              <p className="text-[11px] pt-2" style={{ color: "hsl(207 20% 55%)" }}>
                *Ventas + otros − gastos operativos (sin compras de mercadería). Las compras de contenedores se ven aparte en flujo de caja.
              </p>
              {summary?.ventasDeltaPct != null && (
                <p className="text-xs pt-1" style={{ color: summary.ventasDeltaPct >= 0 ? "#16A34A" : "#DC2626" }}>
                  Ventas vs periodo anterior: {summary.ventasDeltaPct >= 0 ? "+" : ""}{summary.ventasDeltaPct.toFixed(0)}%
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm lg:col-span-2">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: BRAND_BLUE }}>Por tienda</p>
            {loadingSummary ? (
              <p className="text-sm text-gray-500">Cargando...</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left" style={{ borderColor: "hsl(210 20% 92%)" }}>
                      <th className="py-2 font-semibold" style={{ color: BRAND_BLUE }}>Tienda</th>
                      <th className="py-2 font-semibold text-right" style={{ color: BRAND_BLUE }}>Ingresos</th>
                      <th className="py-2 font-semibold text-right" style={{ color: BRAND_BLUE }}>Egresos</th>
                      <th className="py-2 font-semibold text-right" style={{ color: BRAND_BLUE }}>Neto</th>
                      <th className="py-2 font-semibold text-right" style={{ color: BRAND_BLUE }}>Compras merc.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(summary?.byStore || []).map((s) => (
                      <tr key={s.storeId} className="border-b" style={{ borderColor: "hsl(210 20% 94%)" }}>
                        <td className="py-2.5 font-medium">{s.name}</td>
                        <td className="py-2.5 text-right text-green-700">{money(s.ingresos)}</td>
                        <td className="py-2.5 text-right text-red-700">{money(s.egresos)}</td>
                        <td className="py-2.5 text-right font-semibold" style={{ color: s.neto >= 0 ? BRAND_BLUE : "#DC2626" }}>{money(s.neto)}</td>
                        <td className="py-2.5 text-right">{money(s.comprasMercaderia)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Movements */}
      <Card className="border shadow-sm">
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "hsl(210 20% 92%)" }}>
            <p className="text-sm font-semibold" style={{ color: BRAND_BLUE }}>
              Movimientos digitados {summary ? `(${summary.movimientos})` : ""}
            </p>
            <Button size="sm" style={{ background: BRAND_RED }} onClick={() => openCreate("ingreso")}>
              <Plus className="w-4 h-4 mr-1" /> Nuevo
            </Button>
          </div>
          {loadingList ? (
            <p className="p-4 text-sm text-gray-500">Cargando...</p>
          ) : !entries?.length ? (
            <p className="p-6 text-sm" style={{ color: "hsl(207 20% 50%)" }}>
              Todavía no hay movimientos. Empezá digitando las ventas del día y los gastos (alquiler, planilla, pago de contenedor, etc.).
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead style={{ background: "hsl(0 0% 98%)" }}>
                  <tr className="border-b text-left" style={{ borderColor: "hsl(210 20% 92%)" }}>
                    <th className="px-4 py-2.5 text-xs font-semibold uppercase" style={{ color: BRAND_BLUE }}>Fecha</th>
                    <th className="px-4 py-2.5 text-xs font-semibold uppercase" style={{ color: BRAND_BLUE }}>Tienda</th>
                    <th className="px-4 py-2.5 text-xs font-semibold uppercase" style={{ color: BRAND_BLUE }}>Tipo</th>
                    <th className="px-4 py-2.5 text-xs font-semibold uppercase" style={{ color: BRAND_BLUE }}>Categoría</th>
                    <th className="px-4 py-2.5 text-xs font-semibold uppercase" style={{ color: BRAND_BLUE }}>Método</th>
                    <th className="px-4 py-2.5 text-xs font-semibold uppercase text-right" style={{ color: BRAND_BLUE }}>Monto</th>
                    <th className="px-4 py-2.5 text-xs font-semibold uppercase" style={{ color: BRAND_BLUE }}>Nota</th>
                    <th className="w-12" />
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-b hover:bg-gray-50/60" style={{ borderColor: "hsl(210 20% 94%)" }}>
                      <td className="px-4 py-2.5 whitespace-nowrap">{e.fecha}</td>
                      <td className="px-4 py-2.5">{storeLabel(e.storeId)}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${e.tipo === "ingreso" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                          {e.tipo === "ingreso" ? "Ingreso" : "Egreso"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">{catLabel(e.tipo, e.categoria)}</td>
                      <td className="px-4 py-2.5 capitalize">{e.metodoPago}</td>
                      <td className={`px-4 py-2.5 text-right font-semibold ${e.tipo === "ingreso" ? "text-green-700" : "text-red-700"}`}>
                        {e.tipo === "ingreso" ? "+" : "−"}{money(Number(e.monto))}
                      </td>
                      <td className="px-4 py-2.5 text-xs max-w-[200px] truncate" style={{ color: "hsl(207 20% 45%)" }}>
                        {e.descripcion || "—"}
                      </td>
                      <td className="px-2 py-2.5">
                        <button
                          type="button"
                          className="p-1.5 rounded hover:bg-red-50 text-red-600"
                          title="Eliminar"
                          onClick={() => {
                            if (confirm("¿Eliminar este movimiento?")) removeEntry.mutate({ id: e.id });
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{form.tipo === "ingreso" ? "Digitar ingreso" : "Digitar egreso"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 h-9 rounded-md text-sm font-medium border"
                style={{ background: form.tipo === "ingreso" ? "#16A34A" : "#fff", color: form.tipo === "ingreso" ? "#fff" : "#16A34A" }}
                onClick={() => setForm((f) => ({ ...f, tipo: "ingreso", categoria: "ventas" }))}
              >
                Ingreso
              </button>
              <button
                type="button"
                className="flex-1 h-9 rounded-md text-sm font-medium border"
                style={{ background: form.tipo === "egreso" ? BRAND_RED : "#fff", color: form.tipo === "egreso" ? "#fff" : BRAND_RED }}
                onClick={() => setForm((f) => ({ ...f, tipo: "egreso", categoria: "varios" }))}
              >
                Egreso
              </button>
            </div>

            <div>
              <Label>Tienda</Label>
              <select
                className="w-full h-10 border rounded-md px-3 text-sm"
                value={form.storeId}
                onChange={(e) => setForm((f) => ({ ...f, storeId: e.target.value }))}
              >
                <option value="">Seleccionar...</option>
                {(financeStores || []).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div>
              <Label>Categoría</Label>
              <select
                className="w-full h-10 border rounded-md px-3 text-sm"
                value={form.categoria}
                onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
              >
                {catOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
              {form.tipo === "egreso" && form.categoria === "compras_mercaderia" && (
                <p className="text-[11px] mt-1" style={{ color: "hsl(207 20% 50%)" }}>
                  Usá esta categoría cuando pagues un contenedor/pallet. Sale de caja, pero no es gasto operativo como alquiler.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Monto (₡)</Label>
                <Input
                  type="number"
                  min={0}
                  step="1"
                  value={form.monto}
                  onChange={(e) => setForm((f) => ({ ...f, monto: e.target.value }))}
                  className="h-10"
                  placeholder="0"
                />
              </div>
              <div>
                <Label>Fecha</Label>
                <Input type="date" value={form.fecha} onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))} className="h-10" />
              </div>
            </div>

            <div>
              <Label>Método de pago</Label>
              <select
                className="w-full h-10 border rounded-md px-3 text-sm"
                value={form.metodoPago}
                onChange={(e) => setForm((f) => ({ ...f, metodoPago: e.target.value as any }))}
              >
                {METODOS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>

            <div>
              <Label>Nota (opcional)</Label>
              <Input
                value={form.descripcion}
                onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                className="h-10"
                placeholder="Ej. Contenedor #42, alquiler marzo..."
              />
            </div>

            {formError && <p className="text-sm text-red-600">{formError}</p>}

            <Button
              className="w-full h-11 font-medium"
              style={{ background: form.tipo === "ingreso" ? "#16A34A" : BRAND_RED }}
              onClick={handleSubmit}
              disabled={createEntry.isPending}
            >
              {createEntry.isPending ? "Guardando..." : "Guardar movimiento"}
            </Button>
            {user?.name && (
              <p className="text-[11px] text-center" style={{ color: "hsl(207 20% 55%)" }}>
                Quedará registrado por {user.name}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Kpi({ label, value, icon: Icon, color }: { label: string; value: string; icon: any; color: string }) {
  return (
    <Card className="border shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium" style={{ color: "hsl(207 20% 50%)" }}>{label}</p>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
        <p className="text-xl font-bold tracking-tight" style={{ color }}>{value}</p>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span style={{ color: "hsl(207 20% 45%)" }}>{label}</span>
      <span className={bold ? "font-bold" : "font-medium"} style={{ color: "hsl(207 55% 15%)" }}>{value}</span>
    </div>
  );
}
