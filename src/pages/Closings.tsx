import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import {
  Receipt, Plus, Trash2, Banknote, CreditCard, Smartphone, FileX, Calculator,
  TrendingUp, Calendar, BarChart3, Printer, FileSpreadsheet, ArrowDownToLine, Pencil,
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { CheckCircle, AlertCircle } from "lucide-react";
import { BarChart, Bar, XAxis, ResponsiveContainer, Cell } from "recharts";
import { useLocalAuth } from "@/hooks/useLocalAuth";

const BRAND_RED = "#B22234";

function formatMoney(value: number) {
  return value.toLocaleString("es-CR");
}

function formatMoneyCurrency(value: number) {
  return value.toLocaleString("es-CR", { style: "currency", currency: "CRC", minimumFractionDigits: 0 });
}

const paymentConfig = [
  { key: "efectivo" as const, label: "EFECTIVO", icon: Banknote },
  { key: "tarjeta" as const, label: "TARJETA", icon: CreditCard },
  { key: "sinpe" as const, label: "SINPE", icon: Smartphone },
  { key: "sinFactura" as const, label: "SIN FACTURA", icon: FileX },
];

export default function ClosingsPage() {
  const { isEmployee, isAdmin, storeId: userStoreId } = useLocalAuth();
  const utils = trpc.useUtils();
  const { data: stores } = trpc.inventory.allStores.useQuery();
  const [adminStoreId, setAdminStoreId] = useState<number>(1);

  // Empleados ven solo su tienda. Admin puede cambiar.
  const effectiveStoreId = isAdmin ? adminStoreId : (userStoreId || 1);

  const { data: closings } = trpc.inventory.closings.useQuery({ storeId: effectiveStoreId });
  const { data: stats } = trpc.inventory.closingStats.useQuery({ storeId: effectiveStoreId });
  const { data: trend } = trpc.inventory.closingTrend.useQuery({ storeId: effectiveStoreId });
  const { data: paymentMethods } = trpc.inventory.closingByPaymentMethod.useQuery({ storeId: effectiveStoreId });
  const { data: weeklyBreakdown } = trpc.inventory.closingWeeklyBreakdown.useQuery({ storeId: effectiveStoreId });
  const { data: storeConfigData } = trpc.inventory.storeConfig.useQuery({ storeId: effectiveStoreId });
  const { data: pendingReviews } = trpc.inventory.pendingReviews.useQuery();

  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [reportGenerated, setReportGenerated] = useState(false);

  const { data: periodReport } = trpc.inventory.closingReportByPeriod.useQuery(
    { storeId: effectiveStoreId, desde, hasta },
    { enabled: reportGenerated && desde !== "" && hasta !== "" }
  );

  const createClosing = trpc.inventory.createClosing.useMutation({
    onSuccess: () => {
      utils.inventory.closings.invalidate();
      utils.inventory.closingStats.invalidate();
      utils.inventory.closingTrend.invalidate();
      utils.inventory.closingByPaymentMethod.invalidate();
      utils.inventory.closingWeeklyBreakdown.invalidate();
      utils.inventory.pendingReviews.invalidate();
      setCreateError("");
    },
    onError: (err) => setCreateError(err.message),
  });
  const deleteClosing = trpc.inventory.deleteClosing.useMutation({
    onSuccess: () => {
      utils.inventory.closings.invalidate();
      utils.inventory.closingStats.invalidate();
      utils.inventory.closingTrend.invalidate();
      utils.inventory.closingByPaymentMethod.invalidate();
      utils.inventory.closingWeeklyBreakdown.invalidate();
      utils.inventory.pendingReviews.invalidate();
    },
  });
  const markReviewed = trpc.inventory.markClosingReviewed.useMutation({
    onSuccess: () => {
      utils.inventory.closings.invalidate();
      utils.inventory.pendingReviews.invalidate();
    },
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newClosing, setNewClosing] = useState({
    fecha: "", dia: "", hora: "",
    efectivo: "", tarjeta: "", sinpe: "", sinFactura: "",
    observaciones: "",
  });
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editClosing, setEditClosing] = useState({ id: 0, fecha: "", dia: "", efectivo: "", tarjeta: "", sinpe: "", sinFactura: "", observaciones: "" });
  const [createError, setCreateError] = useState("");

  const updateClosing = trpc.inventory.updateClosing.useMutation({
    onSuccess: () => {
      utils.inventory.closings.invalidate();
      utils.inventory.closingStats.invalidate();
      utils.inventory.closingTrend.invalidate();
      utils.inventory.closingByPaymentMethod.invalidate();
      utils.inventory.closingWeeklyBreakdown.invalidate();
    },
  });

  // Helper: get today's date in YYYY-MM-DD using local timezone
  function getLocalDateString() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // Auto-fill the day when dialog opens (using today's local date)
  useEffect(() => {
    if (dialogOpen) {
      const hoy = getLocalDateString();
      handleDateChange(hoy);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen]);

  const totalCalculado = useMemo(() =>
    Number(newClosing.efectivo || 0) + Number(newClosing.tarjeta || 0) + Number(newClosing.sinpe || 0) + Number(newClosing.sinFactura || 0),
    [newClosing]
  );

  const handleDateChange = (fecha: string) => {
    const date = new Date(fecha + "T12:00:00");
    const diasSemana = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];
    const now = new Date();
    const hora = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    setNewClosing({ ...newClosing, fecha, dia: diasSemana[date.getDay()], hora });
  };

  const montoInicialDefault = storeConfigData?.montoInicial || "50000";

  const handleCreate = () => {
    if (!newClosing.fecha) return;
    setCreateError("");
    const userName = (document.cookie.match(/local_auth_user=([^;]+)/) || ["", ""])[1];
    createClosing.mutate({
      storeId: effectiveStoreId, fecha: newClosing.fecha, dia: newClosing.dia, hora: newClosing.hora,
      efectivo: newClosing.efectivo || "0", sinpe: newClosing.sinpe || "0",
      tarjeta: newClosing.tarjeta || "0", sinFactura: newClosing.sinFactura || "0",
      total: String(totalCalculado), inicial: montoInicialDefault,
      observaciones: newClosing.observaciones,
      createdBy: userName ? decodeURIComponent(userName) : undefined,
    });
  };

  // Close dialog on success
  useEffect(() => {
    if (createClosing.isSuccess) {
      setNewClosing({ fecha: new Date().toISOString().split("T")[0], dia: "", hora: "", efectivo: "", tarjeta: "", sinpe: "", sinFactura: "", observaciones: "" });
      setDialogOpen(false);
    }
  }, [createClosing.isSuccess]);

  const handleGenerate = () => {
    if (desde && hasta) setReportGenerated(true);
  };

  // Summary cards (hide TOTAL ACUMULADO for employees)
  const summaryCards = [
    { title: stats?.ultimo ? `ULTIMO: ${stats.ultimo.fecha}` : "ULTIMO", value: stats?.ultimo ? formatMoneyCurrency(stats.ultimo.total) : "-", grad: "from-[#6366F1] to-[#4F46E5]" },
    { title: "ESTA SEMANA", value: stats ? formatMoneyCurrency(stats.semana) : "-", sub: `${stats?.diasSemana || 0} dias cerrados`, grad: "from-[#10B981] to-[#059669]" },
    { title: "ESTE MES", value: stats ? formatMoneyCurrency(stats.mes) : "-", sub: `${stats?.diasMes || 0} dias cerrados`, grad: "from-[#F59E0B] to-[#D97706]" },
    ...(!isEmployee ? [{ title: "TOTAL ACUMULADO", value: stats ? formatMoneyCurrency(stats.total) : "-", sub: `${stats?.totalCierres || 0} cierres`, grad: "from-[#374151] to-[#1F2937]" }] : []),
  ];

  const chartData = trend?.map(t => ({ name: t.dia, total: t.total })) || [];

  return (
    <div>
      {/* Pending reviews alert for admin */}
      {isAdmin && pendingReviews && pendingReviews.length > 0 && (
        <div className="mb-4 p-4 rounded-lg border bg-amber-50 border-amber-200 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Cierres pendientes de revisar</p>
            <p className="text-xs text-amber-700">{pendingReviews.length} cierres sin revisar en todas las tiendas</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" style={{ color: "hsl(207 55% 15%)" }}>
            <Receipt className="w-6 h-6" style={{ color: BRAND_RED }} />
            Cierre de Caja
          </h1>
          {isAdmin ? (
            <select
              className="h-9 px-3 rounded-md border border-input bg-background text-sm"
              value={adminStoreId}
              onChange={(e) => setAdminStoreId(Number(e.target.value))}
            >
              {stores?.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          ) : (
            <span className="h-9 px-3 rounded-md border border-input bg-gray-50 text-sm flex items-center" style={{ color: "hsl(207 20% 45%)" }}>
              {stores?.find(s => s.id === effectiveStoreId)?.name || "Cargando..."}
            </span>
          )}
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="font-medium hover:shadow-lg hover:opacity-90 transition-all" style={{ background: BRAND_RED }}>
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Cierre
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Receipt className="w-5 h-5" style={{ color: BRAND_RED }} />
                Registrar Cierre de Caja
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Fecha</Label><Input type="date" value={newClosing.fecha} onChange={(e) => handleDateChange(e.target.value)} /></div>
                <div><Label>Dia</Label><Input value={newClosing.dia} readOnly className="bg-gray-50" /></div>
              </div>
              <div className="rounded-lg p-4 border" style={{ background: "rgba(217,119,6,0.06)", borderColor: "rgba(217,119,6,0.2)" }}>
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs font-semibold uppercase" style={{ color: "#B45309" }}>Monto Inicial (Caja Chica)</Label>
                    <p className="text-xs mt-0.5" style={{ color: "#D97706" }}>Este monto NO se cuenta en el total de ventas</p>
                  </div>
                  <p className="text-2xl font-bold" style={{ color: "#B45309" }}>₡{Number(montoInicialDefault).toLocaleString("es-CR")}</p>
                </div>
              </div>
              <div>
                <Label className="text-sm font-semibold" style={{ color: "#1B3A5C" }}>Ventas del dia</Label>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  {paymentConfig.map((pm) => {
                    const Icon = pm.icon;
                    return (
                      <div key={pm.key} className="rounded-lg p-3 border" style={{ background: "#DC262606", borderColor: "#DC262620" }}>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Icon className="w-3.5 h-3.5" style={{ color: "#DC2626" }} />
                          <Label className="text-[11px] font-medium" style={{ color: "#DC2626" }}>{pm.label}</Label>
                        </div>
                        <Input type="number" placeholder="0" min="0" value={newClosing[pm.key]} onChange={(e) => setNewClosing({ ...newClosing, [pm.key]: e.target.value })} className="h-9 text-right font-semibold" />
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="rounded-lg p-4 border" style={{ background: "rgba(22,163,74,0.06)", borderColor: "rgba(22,163,74,0.2)" }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calculator className="w-4 h-4" style={{ color: "#16A34A" }} />
                    <div>
                      <Label className="text-xs font-semibold" style={{ color: "#166534" }}>Total Ventas</Label>
                    </div>
                  </div>
                  <p className="text-3xl font-bold" style={{ color: "#16A34A" }}>{formatMoneyCurrency(totalCalculado)}</p>
                </div>
              </div>
              <div>
                <Label className="text-xs font-semibold" style={{ color: "#1B3A5C" }}>Observaciones (opcional)</Label>
                <textarea
                  className="w-full mt-1 p-3 border rounded-md text-sm"
                  style={{ borderColor: "hsl(210 20% 88%)", minHeight: 60 }}
                  placeholder="Ej: Se quedo sin cambio, problema con tarjeta, etc."
                  value={newClosing.observaciones}
                  onChange={(e) => setNewClosing({ ...newClosing, observaciones: e.target.value })}
                />
              </div>
              {createError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  {createError}
                </div>
              )}
              <Button onClick={handleCreate} className="w-full h-11 font-medium" style={{ background: BRAND_RED }}>
                Guardar Cierre
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold" style={{ color: "#1B3A5C" }}>Editar Cierre</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-medium mb-1.5 block" style={{ color: "hsl(207 20% 55%)" }}>Fecha</Label>
                  <Input type="date" value={editClosing.fecha} onChange={(e) => setEditClosing({ ...editClosing, fecha: e.target.value })} className="h-10" />
                </div>
                <div>
                  <Label className="text-xs font-medium mb-1.5 block" style={{ color: "hsl(207 20% 55%)" }}>Dia</Label>
                  <Input value={editClosing.dia} onChange={(e) => setEditClosing({ ...editClosing, dia: e.target.value })} placeholder="Ej: Lunes" className="h-10" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-medium mb-1.5 block" style={{ color: "hsl(207 20% 55%)" }}>Efectivo</Label>
                  <Input type="number" value={editClosing.efectivo} onChange={(e) => setEditClosing({ ...editClosing, efectivo: e.target.value })} placeholder="0" className="h-10" min={0} />
                </div>
                <div>
                  <Label className="text-xs font-medium mb-1.5 block" style={{ color: "hsl(207 20% 55%)" }}>Tarjeta</Label>
                  <Input type="number" value={editClosing.tarjeta} onChange={(e) => setEditClosing({ ...editClosing, tarjeta: e.target.value })} placeholder="0" className="h-10" min={0} />
                </div>
                <div>
                  <Label className="text-xs font-medium mb-1.5 block" style={{ color: "hsl(207 20% 55%)" }}>SINPE</Label>
                  <Input type="number" value={editClosing.sinpe} onChange={(e) => setEditClosing({ ...editClosing, sinpe: e.target.value })} placeholder="0" className="h-10" min={0} />
                </div>
                <div>
                  <Label className="text-xs font-medium mb-1.5 block" style={{ color: "hsl(207 20% 55%)" }}>Sin Factura</Label>
                  <Input type="number" value={editClosing.sinFactura} onChange={(e) => setEditClosing({ ...editClosing, sinFactura: e.target.value })} placeholder="0" className="h-10" min={0} />
                </div>
              </div>
              <Button onClick={() => { updateClosing.mutate({ id: editClosing.id, fecha: editClosing.fecha, dia: editClosing.dia, efectivo: Number(editClosing.efectivo) || 0, tarjeta: Number(editClosing.tarjeta) || 0, sinpe: Number(editClosing.sinpe) || 0, sinFactura: Number(editClosing.sinFactura) || 0 }); setEditDialogOpen(false); }} className="w-full h-11 font-medium" style={{ background: BRAND_RED }}>
                Guardar Cambios
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className={`grid grid-cols-1 md:grid-cols-2 ${isEmployee ? "lg:grid-cols-3" : "lg:grid-cols-4"} gap-4 mb-6`}>
        {summaryCards.map((card) => (
          <Card key={card.title} className="border-0 shadow-sm overflow-hidden">
            <CardContent className="p-0">
              <div className={`bg-gradient-to-br ${card.grad} p-5 text-white h-full`}>
                <div className="flex items-center gap-2 mb-3 opacity-80">
                  <Calendar className="w-4 h-4" />
                  <p className="text-xs font-medium uppercase tracking-wider">{card.title}</p>
                </div>
                <p className="text-2xl font-bold tracking-tight">{card.value}</p>
                {card.sub && <p className="text-xs mt-1 opacity-70">{card.sub}</p>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Trend Chart */}
      <Card className="border shadow-sm mb-6">
        <CardContent className="p-6">
          <h3 className="text-sm font-semibold mb-6 flex items-center gap-2" style={{ color: "hsl(207 55% 15%)" }}>
            <TrendingUp className="w-4 h-4" style={{ color: BRAND_RED }} />
            Tendencia de Ventas (Ultimos 7 Dias)
          </h3>
          {chartData.length > 0 ? (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 10, left: 10, bottom: 5 }} barCategoryGap="20%">
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#6B7280" }} />
                  <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                    {chartData.map((_, i) => (<Cell key={i} fill="#8B5CF6" />))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="text-center py-8 text-sm" style={{ color: "hsl(207 20% 55%)" }}>No hay datos suficientes</div>
          )}
        </CardContent>
      </Card>

      {/* Payment Methods */}
      <Card className="border shadow-sm mb-6">
        <CardContent className="p-6">
          <h3 className="text-sm font-semibold mb-6 flex items-center gap-2" style={{ color: "hsl(207 55% 15%)" }}>
            <Receipt className="w-4 h-4" style={{ color: BRAND_RED }} />
            Por Metodo de Pago
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {paymentMethods?.map((pm) => {
              const config = paymentConfig.find(p => p.key === pm.metodo);
              const Icon = config?.icon || Banknote;
              return (
                <div key={pm.metodo} className="text-center p-5 rounded-xl border" style={{ borderColor: "hsl(210 20% 90%)" }}>
                  <div className="w-12 h-12 rounded-lg flex items-center justify-center mx-auto mb-3" style={{ background: "#DC262615" }}>
                    <Icon className="w-6 h-6" style={{ color: "#DC2626" }} />
                  </div>
                  <p className="text-xs font-semibold tracking-wider mb-2" style={{ color: "hsl(207 20% 55%)" }}>{pm.label}</p>
                  <p className="text-xl font-bold" style={{ color: "hsl(207 55% 15%)" }}>{formatMoney(pm.total)}</p>
                  <p className="text-xs mt-1 font-medium" style={{ color: "hsl(207 20% 55%)" }}>{pm.porcentaje}%</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Weekly Breakdown - Como Vamos Esta Semana */}
      <Card className="border shadow-sm mb-6">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: "hsl(207 55% 15%)" }}>
              <BarChart3 className="w-4 h-4" style={{ color: BRAND_RED }} />
              Como Vamos Esta Semana
            </h3>
            {weeklyBreakdown && (
              <p className="text-xs" style={{ color: "hsl(207 20% 55%)" }}>Semana {weeklyBreakdown.semana} del {weeklyBreakdown.anio}</p>
            )}
          </div>
          <div className="space-y-3">
            {weeklyBreakdown?.dias.map((d) => (
              <div key={d.dia} className="flex items-center gap-3">
                <div className="w-10 text-xs font-medium text-right" style={{ color: "hsl(207 20% 55%)" }}>{d.dia}</div>
                <div className="flex-1 h-8 bg-gray-100 rounded-md overflow-hidden relative">
                  {d.hasData && (
                    <div
                      className="h-full rounded-md transition-all duration-500"
                      style={{ width: `${d.porcentaje}%`, background: "linear-gradient(90deg, #8B5CF6, #A78BFA)" }}
                    />
                  )}
                </div>
                <div className="w-20 text-right">
                  <span className={`text-xs font-semibold ${d.hasData ? "" : "text-gray-300"}`} style={{ color: d.hasData ? "hsl(207 55% 15%)" : undefined }}>
                    {d.hasData ? formatMoney(d.total) : "-"}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t flex items-center justify-between" style={{ borderColor: "hsl(210 20% 94%)" }}>
            <span className="text-sm font-semibold" style={{ color: "hsl(207 55% 15%)" }}>Total semana:</span>
            <span className="text-xl font-bold" style={{ color: "hsl(207 55% 15%)" }}>
              {weeklyBreakdown ? formatMoney(weeklyBreakdown.totalSemana) : "0"}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Reporte por Periodo */}
      <Card className="border shadow-sm mb-6">
        <CardContent className="p-6">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: "hsl(207 55% 15%)" }}>
            <FileSpreadsheet className="w-4 h-4" style={{ color: BRAND_RED }} />
            Reporte por Periodo
          </h3>
          <div className="flex items-end gap-3 mb-6">
            <div>
              <Label className="text-xs">Desde</Label>
              <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-10 mt-1" />
            </div>
            <div>
              <Label className="text-xs">Hasta</Label>
              <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-10 mt-1" />
            </div>
            <Button onClick={handleGenerate} className="h-10 font-medium" style={{ background: BRAND_RED }}>
              <TrendingUp className="w-4 h-4 mr-2" />
              Generar
            </Button>
            <Button variant="outline" className="h-10 font-medium border-green-600 text-green-600 hover:bg-green-50" disabled={!periodReport}>
              <Printer className="w-4 h-4 mr-2" />
              Imprimir
            </Button>
            <Button variant="outline" className="h-10 font-medium border-green-600 text-green-600 hover:bg-green-50" disabled={!periodReport}>
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Excel
            </Button>
          </div>

          {/* Period stats */}
          {periodReport && (
            <>
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="p-4 rounded-xl border" style={{ borderColor: "hsl(210 20% 90%)" }}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(22,163,74,0.1)" }}>
                      <ArrowDownToLine className="w-4 h-4" style={{ color: "#16A34A" }} />
                    </div>
                    <p className="text-xs" style={{ color: "hsl(207 20% 55%)" }}>Total Ventas</p>
                  </div>
                  <p className="text-xl font-bold" style={{ color: "hsl(207 55% 15%)" }}>{formatMoney(periodReport.totalVentas)}</p>
                </div>
                <div className="p-4 rounded-xl border" style={{ borderColor: "hsl(210 20% 90%)" }}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(59,130,246,0.1)" }}>
                      <Calendar className="w-4 h-4" style={{ color: "#3B82F6" }} />
                    </div>
                    <p className="text-xs" style={{ color: "hsl(207 20% 55%)" }}>Dias con Cierre</p>
                  </div>
                  <p className="text-xl font-bold" style={{ color: "hsl(207 55% 15%)" }}>{periodReport.diasConCierre}</p>
                </div>
                <div className="p-4 rounded-xl border" style={{ borderColor: "hsl(210 20% 90%)" }}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(139,92,246,0.1)" }}>
                      <TrendingUp className="w-4 h-4" style={{ color: "#8B5CF6" }} />
                    </div>
                    <p className="text-xs" style={{ color: "hsl(207 20% 55%)" }}>Promedio por Dia</p>
                  </div>
                  <p className="text-xl font-bold" style={{ color: "hsl(207 55% 15%)" }}>{formatMoney(periodReport.promedioDia)}</p>
                </div>
              </div>

              {/* Period table */}
              <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: "hsl(210 20% 90%)" }}>
                <table className="w-full">
                  <thead style={{ background: "hsl(0 0% 98%)" }}>
                    <tr className="border-b" style={{ borderColor: "hsl(210 20% 94%)" }}>
                      {["FECHA", "DIA", "EFECTIVO", "TARJETA", "SINPE", "SIN FACT.", "TOTAL"].map((h) => (
                        <th key={h} className="px-3 py-3 text-[10px] font-semibold uppercase tracking-wider text-left" style={{ color: "#1B3A5C" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {periodReport.rows.map((row, idx) => (
                      <tr key={idx} className="border-b hover:bg-gray-50/50 transition-colors" style={{ borderColor: "hsl(210 20% 94%)" }}>
                        <td className="px-3 py-3 text-sm" style={{ color: "hsl(207 55% 15%)" }}>{row.fecha}</td>
                        <td className="px-3 py-3 text-sm capitalize" style={{ color: "hsl(207 20% 45%)" }}>{row.dia}</td>
                        <td className="px-3 py-3 text-sm text-right">{formatMoney(row.efectivo)}</td>
                        <td className="px-3 py-3 text-sm text-right">{formatMoney(row.tarjeta)}</td>
                        <td className="px-3 py-3 text-sm text-right">{formatMoney(row.sinpe)}</td>
                        <td className="px-3 py-3 text-sm text-right">{formatMoney(row.sinFactura)}</td>
                        <td className="px-3 py-3 text-sm text-right font-bold" style={{ color: "#16A34A" }}>{formatMoney(row.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Recent closings list */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold mb-3" style={{ color: "hsl(207 55% 15%)" }}>Cierres Recientes</h3>
        {closings?.map((closing) => {
          const totalVentas = Number(closing.efectivo || 0) + Number(closing.tarjeta || 0) + Number(closing.sinpe || 0) + Number(closing.sinFactura || 0);
          const diferencia = Number(closing.diferencia || 0);
          const hasDiferencia = Math.abs(diferencia) > 100;
          return (
            <Card key={closing.id} className="border shadow-sm hover:shadow-md transition-all">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: closing.revisado ? "rgba(22,163,74,0.08)" : "rgba(217,119,6,0.08)" }}>
                      <Receipt className="w-5 h-5" style={{ color: closing.revisado ? "#16A34A" : "#D97706" }} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-sm" style={{ color: "hsl(207 55% 15%)" }}>{closing.fecha}</h3>
                        {closing.revisado ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-50 text-green-700 border border-green-200">
                            <CheckCircle className="w-3 h-3" /> Revisado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            <AlertCircle className="w-3 h-3" /> Pendiente
                          </span>
                        )}
                      </div>
                      <p className="text-xs" style={{ color: "hsl(207 20% 45%)" }}>
                        {closing.dia} {closing.hora ? `· ${closing.hora}` : ""}
                        {closing.createdBy ? ` · ${closing.createdBy}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "#16A34A" }}>Ventas</p>
                      <p className="text-lg font-bold" style={{ color: "#16A34A" }}>{formatMoneyCurrency(totalVentas)}</p>
                    </div>
                    {isAdmin && (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => { setEditClosing({ id: closing.id, fecha: closing.fecha, dia: closing.dia || "", efectivo: String(closing.efectivo || ""), tarjeta: String(closing.tarjeta || ""), sinpe: String(closing.sinpe || ""), sinFactura: String(closing.sinFactura || ""), observaciones: closing.observaciones || "" }); setEditDialogOpen(true); }} className="hover:bg-blue-50">
                          <Pencil className="w-4 h-4" style={{ color: "#1B3A5C" }} />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => markReviewed.mutate({ id: closing.id, revisado: !closing.revisado })} className="hover:bg-green-50">
                          <CheckCircle className="w-4 h-4" style={{ color: closing.revisado ? "#DC2626" : "#16A34A" }} />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => deleteClosing.mutate({ id: closing.id })} className="hover:bg-red-50">
                          <Trash2 className="w-4 h-4" style={{ color: BRAND_RED }} />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                {hasDiferencia && (
                  <div className="mt-3 p-2 rounded-md text-xs font-semibold text-center" style={{ background: diferencia < 0 ? "rgba(220,38,38,0.06)" : "rgba(217,119,6,0.06)", color: diferencia < 0 ? "#DC2626" : "#D97706", border: `1px solid ${diferencia < 0 ? "rgba(220,38,38,0.15)" : "rgba(217,119,6,0.15)"}` }}>
                    {diferencia < 0 ? "FALTANTE" : "SOBRANTE"}: {formatMoneyCurrency(Math.abs(diferencia))}
                  </div>
                )}
                {closing.observaciones && (
                  <div className="mt-2 p-2 rounded-md text-xs bg-gray-50 text-gray-600 border border-gray-100">
                    📝 {closing.observaciones}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
