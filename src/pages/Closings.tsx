import { trpc } from "@/providers/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Receipt, Plus, Trash2, TrendingUp, Save, Calculator } from "lucide-react";
import { useState, useMemo } from "react";

const CAJA_CHICA = 50000; // Monto inicial fijo

export default function ClosingsPage() {
  const utils = trpc.useUtils();
  const { data: closings, isLoading } = trpc.inventory.closings.useQuery({ storeId: 1 });

  const createClosing = trpc.inventory.createClosing.useMutation({ onSuccess: () => utils.inventory.closings.invalidate() });
  const deleteClosing = trpc.inventory.deleteClosing.useMutation({ onSuccess: () => utils.inventory.closings.invalidate() });

  const [newClosing, setNewClosing] = useState({
    fecha: new Date().toISOString().split("T")[0],
    dia: "",
    efectivo: "",
    tarjeta: "",
    sinpe: "",
    sinFactura: "",
    inicial: String(CAJA_CHICA),
  });
  const [dialogOpen, setDialogOpen] = useState(false);

  // Calcular total automaticamente
  const totalCalculado = useMemo(() => {
    const ef = Number(newClosing.efectivo || 0);
    const ta = Number(newClosing.tarjeta || 0);
    const si = Number(newClosing.sinpe || 0);
    const sf = Number(newClosing.sinFactura || 0);
    return ef + ta + si + sf;
  }, [newClosing.efectivo, newClosing.tarjeta, newClosing.sinpe, newClosing.sinFactura]);

  if (isLoading) return <div className="flex items-center justify-center h-full">Cargando...</div>;

  const formatCurrency = (value: string | number | null) => {
    const num = typeof value === "string" ? Number(value || 0) : Number(value || 0);
    return num.toLocaleString("es-CR", { style: "currency", currency: "CRC", minimumFractionDigits: 0 });
  };

  const handleCreate = () => {
    if (!newClosing.fecha) return;
    createClosing.mutate({
      storeId: 1,
      fecha: newClosing.fecha,
      dia: newClosing.dia,
      efectivo: newClosing.efectivo || "0",
      sinpe: newClosing.sinpe || "0",
      tarjeta: newClosing.tarjeta || "0",
      sinFactura: newClosing.sinFactura || "0",
      total: String(totalCalculado),
      inicial: String(CAJA_CHICA),
    });
    setNewClosing({ fecha: new Date().toISOString().split("T")[0], dia: "", efectivo: "", tarjeta: "", sinpe: "", sinFactura: "", inicial: String(CAJA_CHICA) });
    setDialogOpen(false);
  };

  const handleDateChange = (fecha: string) => {
    const date = new Date(fecha + "T12:00:00"); // Fix timezone issue
    const diasSemana = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];
    const diaNombre = diasSemana[date.getDay()];
    setNewClosing({ ...newClosing, fecha, dia: diaNombre });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Cierres de Caja</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Cierre
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Registrar Cierre de Caja</DialogTitle></DialogHeader>
            <div className="space-y-3">
              {/* Fecha */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Fecha</Label>
                  <Input type="date" value={newClosing.fecha} onChange={(e) => handleDateChange(e.target.value)} />
                </div>
                <div>
                  <Label>Dia</Label>
                  <Input value={newClosing.dia} readOnly className="bg-gray-50" />
                </div>
              </div>

              {/* Monto Inicial - Caja Chica */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <Label className="text-yellow-800 font-medium">Monto Inicial (Caja Chica)</Label>
                <p className="text-2xl font-bold text-yellow-700">{formatCurrency(CAJA_CHICA)}</p>
                <p className="text-xs text-yellow-600">Este monto NO se cuenta en el total de ventas</p>
              </div>

              {/* Ventas */}
              <div className="space-y-2">
                <Label className="font-medium text-gray-700">Ventas del dia</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm text-gray-500">Venta Efectivo</Label>
                    <Input type="number" placeholder="0" min="0" value={newClosing.efectivo} onChange={(e) => setNewClosing({ ...newClosing, efectivo: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-sm text-gray-500">Venta Tarjeta</Label>
                    <Input type="number" placeholder="0" min="0" value={newClosing.tarjeta} onChange={(e) => setNewClosing({ ...newClosing, tarjeta: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm text-gray-500">SINPE Movil</Label>
                    <Input type="number" placeholder="0" min="0" value={newClosing.sinpe} onChange={(e) => setNewClosing({ ...newClosing, sinpe: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-sm text-gray-500">Ventas Sin Factura</Label>
                    <Input type="number" placeholder="0" min="0" value={newClosing.sinFactura} onChange={(e) => setNewClosing({ ...newClosing, sinFactura: e.target.value })} />
                  </div>
                </div>
              </div>

              {/* Total Ventas - Calculado automaticamente */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-green-800 font-medium flex items-center gap-1">
                      <Calculator className="w-4 h-4" />
                      Total Ventas
                    </Label>
                    <p className="text-xs text-green-600">Efectivo + Tarjeta + SINPE + Sin Factura</p>
                  </div>
                  <p className="text-3xl font-bold text-green-700">{formatCurrency(totalCalculado)}</p>
                </div>
              </div>

              <Button onClick={handleCreate} className="w-full bg-blue-600 hover:bg-blue-700">
                <Save className="w-4 h-4 mr-2" />
                Guardar Cierre
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Lista de cierres */}
      <div className="space-y-2">
        {closings?.map((closing) => {
          const totalVentas = Number(closing.efectivo || 0) + Number(closing.tarjeta || 0) + Number(closing.sinpe || 0) + Number(closing.sinFactura || 0);
          return (
            <Card key={closing.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-orange-100 p-2 rounded-lg">
                      <Receipt className="w-5 h-5 text-orange-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-800">{closing.fecha}</h3>
                      <p className="text-sm text-gray-500">{closing.dia}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-xs text-gray-400">Efectivo</p>
                      <p className="text-sm font-medium">{formatCurrency(closing.efectivo)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400">Tarjeta</p>
                      <p className="text-sm font-medium">{formatCurrency(closing.tarjeta)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400">SINPE</p>
                      <p className="text-sm font-medium">{formatCurrency(closing.sinpe)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400">Sin Fact.</p>
                      <p className="text-sm font-medium">{formatCurrency(closing.sinFactura)}</p>
                    </div>
                    <div className="text-right bg-green-50 px-3 py-2 rounded-lg">
                      <p className="text-xs text-green-600">Total Ventas</p>
                      <p className="text-lg font-bold text-green-700">{formatCurrency(totalVentas)}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => deleteClosing.mutate({ id: closing.id })}>
                      <Trash2 className="w-4 h-4 text-red-500" />
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
        <Card className="mt-4 bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <TrendingUp className="w-6 h-6 text-blue-600" />
                <div>
                  <p className="text-sm text-blue-600 font-medium">Total acumulado en ventas</p>
                  <p className="text-xs text-blue-400">{closings.length} cierres registrados</p>
                </div>
              </div>
              <p className="text-2xl font-bold text-blue-700">
                {formatCurrency(closings.reduce((sum, c) => {
                  return sum + Number(c.efectivo || 0) + Number(c.tarjeta || 0) + Number(c.sinpe || 0) + Number(c.sinFactura || 0);
                }, 0))}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
