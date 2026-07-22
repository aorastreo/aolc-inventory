import { trpc } from "@/providers/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Receipt, Plus, Trash2, TrendingUp, Save, Calculator, Banknote, CreditCard, Smartphone, FileX } from "lucide-react";
import { useState, useMemo } from "react";

const BRAND_RED = "#B22234";
const BRAND_BLUE = "#1B3A5C";
const CAJA_CHICA = 50000;

export default function ClosingsPage() {
  const utils = trpc.useUtils();
  const { data: closings, isLoading } = trpc.inventory.closings.useQuery({ storeId: 1 });

  const createClosing = trpc.inventory.createClosing.useMutation({ onSuccess: () => utils.inventory.closings.invalidate() });
  const deleteClosing = trpc.inventory.deleteClosing.useMutation({ onSuccess: () => utils.inventory.closings.invalidate() });

  const [newClosing, setNewClosing] = useState({
    fecha: new Date().toISOString().split("T")[0], dia: "",
    efectivo: "", tarjeta: "", sinpe: "", sinFactura: "", inicial: String(CAJA_CHICA),
  });
  const [dialogOpen, setDialogOpen] = useState(false);

  const totalCalculado = useMemo(() => {
    return Number(newClosing.efectivo || 0) + Number(newClosing.tarjeta || 0) + Number(newClosing.sinpe || 0) + Number(newClosing.sinFactura || 0);
  }, [newClosing.efectivo, newClosing.tarjeta, newClosing.sinpe, newClosing.sinFactura]);

  if (isLoading) return (
    <div className="flex items-center justify-center h-full">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: BRAND_RED }} />
    </div>
  );

  const formatCurrency = (value: string | number | null) => {
    const num = typeof value === "string" ? Number(value || 0) : Number(value || 0);
    return num.toLocaleString("es-CR", { style: "currency", currency: "CRC", minimumFractionDigits: 0 });
  };

  const handleDateChange = (fecha: string) => {
    const date = new Date(fecha + "T12:00:00");
    const diasSemana = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];
    setNewClosing({ ...newClosing, fecha, dia: diasSemana[date.getDay()] });
  };

  const handleCreate = () => {
    if (!newClosing.fecha) return;
    createClosing.mutate({
      storeId: 1, fecha: newClosing.fecha, dia: newClosing.dia,
      efectivo: newClosing.efectivo || "0", sinpe: newClosing.sinpe || "0",
      tarjeta: newClosing.tarjeta || "0", sinFactura: newClosing.sinFactura || "0",
      total: String(totalCalculado), inicial: String(CAJA_CHICA),
    });
    setNewClosing({ fecha: new Date().toISOString().split("T")[0], dia: "", efectivo: "", tarjeta: "", sinpe: "", sinFactura: "", inicial: String(CAJA_CHICA) });
    setDialogOpen(false);
  };

  const paymentMethods = [
    { key: "efectivo", label: "Venta Efectivo", icon: Banknote, color: "#16A34A" },
    { key: "tarjeta", label: "Venta Tarjeta", icon: CreditCard, color: "#2563EB" },
    { key: "sinpe", label: "SINPE Movil", icon: Smartphone, color: "#7C3AED" },
    { key: "sinFactura", label: "Ventas Sin Factura", icon: FileX, color: "#DC2626" },
  ] as const;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "hsl(207 55% 15%)" }}>Cierres de Caja</h1>
          <p className="text-sm mt-0.5" style={{ color: "hsl(207 20% 45%)" }}>Registro diario de ventas</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="font-medium transition-all duration-200 hover:shadow-lg hover:opacity-90" style={{ background: BRAND_RED }}>
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
              {/* Fecha y Dia */}
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Fecha</Label><Input type="date" value={newClosing.fecha} onChange={(e) => handleDateChange(e.target.value)} /></div>
                <div><Label>Dia</Label><Input value={newClosing.dia} readOnly className="bg-gray-50" /></div>
              </div>

              {/* Caja Chica */}
              <div className="rounded-lg p-4 border" style={{ background: "rgba(217,119,6,0.06)", borderColor: "rgba(217,119,6,0.2)" }}>
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#B45309" }}>Monto Inicial (Caja Chica)</Label>
                    <p className="text-xs mt-0.5" style={{ color: "#D97706" }}>Este monto NO se cuenta en el total de ventas</p>
                  </div>
                  <p className="text-2xl font-bold" style={{ color: "#B45309" }}>{formatCurrency(CAJA_CHICA)}</p>
                </div>
              </div>

              {/* Payment methods */}
              <div>
                <Label className="text-sm font-semibold" style={{ color: BRAND_BLUE }}>Ventas del dia</Label>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  {paymentMethods.map((pm) => {
                    const Icon = pm.icon;
                    return (
                      <div key={pm.key} className="rounded-lg p-3 border" style={{ background: pm.color + "06", borderColor: pm.color + "20" }}>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Icon className="w-3.5 h-3.5" style={{ color: pm.color }} />
                          <Label className="text-[11px] font-medium" style={{ color: pm.color }}>{pm.label}</Label>
                        </div>
                        <Input
                          type="number" placeholder="0" min="0"
                          value={newClosing[pm.key]}
                          onChange={(e) => setNewClosing({ ...newClosing, [pm.key]: e.target.value })}
                          className="h-9 text-right font-semibold"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Total */}
              <div className="rounded-lg p-4 border" style={{ background: "rgba(22,163,74,0.06)", borderColor: "rgba(22,163,74,0.2)" }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calculator className="w-4 h-4" style={{ color: "#16A34A" }} />
                    <div>
                      <Label className="text-xs font-semibold" style={{ color: "#166534" }}>Total Ventas</Label>
                      <p className="text-[10px]" style={{ color: "#16A34A" }}>Efectivo + Tarjeta + SINPE + Sin Factura</p>
                    </div>
                  </div>
                  <p className="text-3xl font-bold" style={{ color: "#16A34A" }}>{formatCurrency(totalCalculado)}</p>
                </div>
              </div>

              <Button onClick={handleCreate} className="w-full h-11 font-medium transition-all duration-200 hover:shadow-lg hover:opacity-90" style={{ background: BRAND_RED }}>
                <Save className="w-4 h-4 mr-2" />
                Guardar Cierre
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* List */}
      <div className="space-y-2">
        {closings?.map((closing) => {
          const totalVentas = Number(closing.efectivo || 0) + Number(closing.tarjeta || 0) + Number(closing.sinpe || 0) + Number(closing.sinFactura || 0);
          return (
            <Card key={closing.id} className="border shadow-sm hover:shadow-md transition-all duration-200">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "rgba(27,58,92,0.08)" }}>
                      <Receipt className="w-5 h-5" style={{ color: BRAND_BLUE }} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm" style={{ color: "hsl(207 55% 15%)" }}>{closing.fecha}</h3>
                      <p className="text-xs" style={{ color: "hsl(207 20% 45%)" }}>{closing.dia}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="hidden md:flex items-center gap-3">
                      {[
                        { label: "Efectivo", value: closing.efectivo },
                        { label: "Tarjeta", value: closing.tarjeta },
                        { label: "SINPE", value: closing.sinpe },
                        { label: "Sin Fact.", value: closing.sinFactura },
                      ].map((pm) => (
                        <div key={pm.label} className="text-right">
                          <p className="text-[10px] uppercase tracking-wider font-medium" style={{ color: "hsl(207 20% 55%)" }}>{pm.label}</p>
                          <p className="text-sm font-semibold" style={{ color: "hsl(207 55% 15%)" }}>{formatCurrency(pm.value)}</p>
                        </div>
                      ))}
                    </div>
                    <div className="text-right rounded-lg px-4 py-2" style={{ background: "rgba(22,163,74,0.06)" }}>
                      <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "#16A34A" }}>Total Ventas</p>
                      <p className="text-lg font-bold" style={{ color: "#16A34A" }}>{formatCurrency(totalVentas)}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => deleteClosing.mutate({ id: closing.id })} className="hover:bg-red-50">
                      <Trash2 className="w-4 h-4" style={{ color: BRAND_RED }} />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Total acumulado */}
      {closings && closings.length > 0 && (
        <Card className="mt-4 border shadow-sm" style={{ background: "linear-gradient(135deg, rgba(27,58,92,0.04) 0%, rgba(27,58,92,0.02) 100%)" }}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "rgba(27,58,92,0.1)" }}>
                  <TrendingUp className="w-5 h-5" style={{ color: BRAND_BLUE }} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: BRAND_BLUE }}>Total acumulado en ventas</p>
                  <p className="text-xs" style={{ color: "hsl(207 20% 45%)" }}>{closings.length} cierres registrados</p>
                </div>
              </div>
              <p className="text-2xl font-bold" style={{ color: BRAND_BLUE }}>
                {formatCurrency(closings.reduce((sum, c) => sum + Number(c.efectivo || 0) + Number(c.tarjeta || 0) + Number(c.sinpe || 0) + Number(c.sinFactura || 0), 0))}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
