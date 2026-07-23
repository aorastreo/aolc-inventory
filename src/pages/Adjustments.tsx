import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  ClipboardList, CheckCircle, Clock, XCircle, Plus, Eye, Trash2, ArrowLeft, Package, X, Barcode,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router";
import ProductAutocomplete from "@/components/ProductAutocomplete";

const BRAND_RED = "#B22234";
const BRAND_BLUE = "#1B3A5C";

export default function AdjustmentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const palletFilter = searchParams.get("palletId");
  const palletFilterNum = palletFilter ? Number(palletFilter) : null;

  const utils = trpc.useUtils();
  const { data: adjustments, isLoading } = trpc.inventory.adjustments.useQuery(
    palletFilterNum ? { storeId: 1, palletId: palletFilterNum } : { storeId: 1 }
  );
  const { data: pallets } = trpc.inventory.pallets.useQuery({ storeId: 1 });
  const { data: filteredPallet } = trpc.inventory.palletById.useQuery(
    { id: palletFilterNum! },
    { enabled: !!palletFilterNum }
  );

  const createAdj = trpc.inventory.createAdjustment.useMutation({ onSuccess: () => utils.inventory.adjustments.invalidate() });
  const completeAdj = trpc.inventory.completeAdjustment.useMutation({ onSuccess: () => { utils.inventory.adjustments.invalidate(); utils.inventory.products.invalidate(); } });
  const cancelAdj = trpc.inventory.cancelAdjustment.useMutation({ onSuccess: () => utils.inventory.adjustments.invalidate() });
  const addItem = trpc.inventory.addAdjustmentItem.useMutation({ onSuccess: () => { utils.inventory.adjustmentItems.invalidate(); utils.inventory.adjustments.invalidate(); } });
  const removeItem = trpc.inventory.removeAdjustmentItem.useMutation({ onSuccess: () => utils.inventory.adjustmentItems.invalidate() });

  const [viewingAdj, setViewingAdj] = useState<number | null>(null);
  const [newAdj, setNewAdj] = useState({ adjustmentId: "", description: "", palletId: palletFilter || "" });
  const [newItem, setNewItem] = useState({ nombre: "", precio: "", cantidad: 1, codigoBarras: "" });
  const [dialogOpen, setDialogOpen] = useState(false);

  // Pre-fill palletId when coming from a filtered view
  useEffect(() => {
    if (palletFilter) {
      setNewAdj(prev => ({ ...prev, palletId: palletFilter }));
    }
  }, [palletFilter]);

  const { data: adjDetail } = trpc.inventory.adjustmentById.useQuery({ id: viewingAdj! }, { enabled: !!viewingAdj });
  const { data: adjItems } = trpc.inventory.adjustmentItems.useQuery({ adjustmentId: viewingAdj! }, { enabled: !!viewingAdj });

  if (isLoading) return (
    <div className="flex items-center justify-center h-full">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: BRAND_RED }} />
    </div>
  );

  const getStatusConfig = (estado: string) => {
    switch (estado) {
      case "activo": return { icon: Clock, color: "#D97706", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", label: "Activo" };
      case "completado": return { icon: CheckCircle, color: "#16A34A", bg: "bg-green-50", text: "text-green-700", border: "border-green-200", label: "Completado" };
      case "cancelado": return { icon: XCircle, color: "#DC2626", bg: "bg-red-50", text: "text-red-700", border: "border-red-200", label: "Cancelado" };
      default: return { icon: Clock, color: "#9CA3AF", bg: "bg-gray-50", text: "text-gray-700", border: "border-gray-200", label: estado };
    }
  };

  const handleCreate = () => {
    if (!newAdj.adjustmentId || !newAdj.palletId) return;
    createAdj.mutate({
      storeId: 1, palletId: Number(newAdj.palletId), adjustmentId: newAdj.adjustmentId,
      description: newAdj.description, fecha: new Date().toISOString().split("T")[0],
      fechaHora: new Date().toLocaleString("es-CR"),
    });
    setNewAdj({ adjustmentId: "", description: "", palletId: "" });
    setDialogOpen(false);
  };

  const handleAddItem = () => {
    if (!viewingAdj || !newItem.nombre || !newItem.precio) return;
    addItem.mutate({
      adjustmentId: viewingAdj, nombre: newItem.nombre, precio: newItem.precio,
      cantidad: newItem.cantidad, codigoBarras: newItem.codigoBarras, orden: (adjItems?.length || 0) + 1,
    });
    setNewItem({ nombre: "", precio: "", cantidad: 1, codigoBarras: "" });
  };

  const formatCurrency = (value: string) => Number(value || 0).toLocaleString("es-CR", { style: "currency", currency: "CRC" });

  // Detail view
  if (viewingAdj && adjDetail) {
    const status = getStatusConfig(adjDetail.estado);
    const StatusIcon = status.icon;

    return (
      <div>
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="outline" size="sm" onClick={() => setViewingAdj(null)} style={{ color: BRAND_BLUE, borderColor: "hsl(210 20% 88%)" }}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver
          </Button>
          <div className="flex items-center gap-3 flex-1">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: status.color + "18" }}>
              <ClipboardList className="w-5 h-5" style={{ color: status.color }} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight" style={{ color: "hsl(207 55% 15%)" }}>{adjDetail.adjustmentId}</h1>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${status.bg} ${status.text} ${status.border} border`}>
                  {status.label}
                </span>
              </div>
              <p className="text-xs" style={{ color: "hsl(207 20% 45%)" }}>{adjDetail.description}</p>
            </div>
          </div>
        </div>

        {/* Add item form */}
        {adjDetail.estado === "activo" && (
          <Card className="mb-6 border shadow-sm">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: BRAND_BLUE }}>
                <Plus className="w-4 h-4" />
                Agregar Articulo al Ajuste
              </h3>
              <div className="space-y-4">
                {/* Autocomplete */}
                <ProductAutocomplete
                  nombre={newItem.nombre}
                  precio={newItem.precio}
                  codigoBarras={newItem.codigoBarras}
                  cantidad={newItem.cantidad}
                  onChange={(fields) => setNewItem({ ...newItem, ...fields })}
                />

                {/* Precio */}
                <div>
                  <Label>Precio</Label>
                  <Input type="number" placeholder="0" value={newItem.precio} onChange={(e) => setNewItem({ ...newItem, precio: e.target.value })} />
                </div>

                {/* Cantidad */}
                <div>
                  <Label>Cantidad</Label>
                  <Input type="number" placeholder="1" value={newItem.cantidad} onChange={(e) => setNewItem({ ...newItem, cantidad: Number(e.target.value) })} />
                </div>

                {/* Codigo de barras */}
                <div>
                  <Label className="flex items-center gap-1">
                    <Barcode className="w-3.5 h-3.5" />
                    Cod. Barras
                  </Label>
                  <Input placeholder="Opcional" value={newItem.codigoBarras} onChange={(e) => setNewItem({ ...newItem, codigoBarras: e.target.value })} />
                </div>

                <Button onClick={handleAddItem} className="font-medium transition-all duration-200 hover:shadow-lg hover:opacity-90" style={{ background: BRAND_RED }}>
                  <Plus className="w-4 h-4 mr-2" />
                  Agregar al Ajuste
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Items table */}
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden mb-6">
          <table className="w-full">
            <thead style={{ background: "hsl(0 0% 98%)" }}>
              <tr className="border-b" style={{ borderColor: "hsl(210 20% 94%)" }}>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: BRAND_BLUE }}>#</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: BRAND_BLUE }}>Nombre</th>
                <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: BRAND_BLUE }}>Precio</th>
                <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: BRAND_BLUE }}>Cant</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: BRAND_BLUE }}>Cod. Barras</th>
                {adjDetail.estado === "activo" && <th className="w-12"></th>}
              </tr>
            </thead>
            <tbody>
              {adjItems?.map((item, idx) => (
                <tr key={item.id} className="border-b hover:bg-gray-50/50 transition-colors" style={{ borderColor: "hsl(210 20% 94%)" }}>
                  <td className="px-4 py-3 text-sm" style={{ color: "hsl(207 20% 55%)" }}>{idx + 1}</td>
                  <td className="px-4 py-3 text-sm font-semibold" style={{ color: "hsl(207 55% 15%)" }}>{item.nombre}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium">{formatCurrency(String(item.precio))}</td>
                  <td className="px-4 py-3 text-sm text-right">{item.cantidad}</td>
                  <td className="px-4 py-3 text-sm font-mono text-xs" style={{ color: "hsl(207 20% 55%)" }}>{item.codigoBarras || "-"}</td>
                  {adjDetail.estado === "activo" && (
                    <td className="px-4 py-3">
                      <Button variant="ghost" size="sm" onClick={() => removeItem.mutate({ id: item.id })} className="hover:bg-red-50">
                        <Trash2 className="w-4 h-4" style={{ color: BRAND_RED }} />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Actions */}
        {adjDetail.estado === "activo" && (
          <div className="flex gap-3">
            <Button
              onClick={() => { completeAdj.mutate({ id: viewingAdj }); setViewingAdj(null); }}
              className="font-medium transition-all duration-200 hover:shadow-lg hover:opacity-90"
              style={{ background: "#16A34A" }}
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Completar Ajuste
            </Button>
            <Button
              variant="destructive"
              onClick={() => { cancelAdj.mutate({ id: viewingAdj }); setViewingAdj(null); }}
              className="font-medium"
            >
              <XCircle className="w-4 h-4 mr-2" />
              Cancelar Ajuste
            </Button>
          </div>
        )}
      </div>
    );
  }

  // List view
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "hsl(207 55% 15%)" }}>Ajustes</h1>
            {palletFilterNum && filteredPallet && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold" style={{ background: "rgba(178,34,52,0.1)", color: BRAND_RED }}>
                <Package className="w-3.5 h-3.5" />
                {filteredPallet.palletId}
                <button
                  onClick={() => { setSearchParams({}); setNewAdj({ adjustmentId: "", description: "", palletId: "" }); }}
                  className="ml-1 hover:opacity-70"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>
          <p className="text-sm mt-0.5" style={{ color: "hsl(207 20% 45%)" }}>
            {palletFilterNum && filteredPallet
              ? `Ajustes del contenedor: ${filteredPallet.description}`
              : "Gestiona los ajustes de inventario"}
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="font-medium transition-all duration-200 hover:shadow-lg hover:opacity-90" style={{ background: BRAND_RED }}>
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Ajuste
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ClipboardList className="w-5 h-5" style={{ color: BRAND_RED }} />
                Crear Nuevo Ajuste
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <Label>ID del Ajuste</Label>
                <Input placeholder="ej: P-014-AJ-001" value={newAdj.adjustmentId} onChange={(e) => setNewAdj({ ...newAdj, adjustmentId: e.target.value })} />
              </div>
              <div>
                <Label>Contenedor</Label>
                <select className="w-full h-10 border rounded-md px-3 text-sm" style={{ borderColor: "hsl(210 20% 88%)" }} value={newAdj.palletId} onChange={(e) => setNewAdj({ ...newAdj, palletId: e.target.value })}>
                  <option value="">Seleccionar contenedor</option>
                  {pallets?.map((p) => <option key={p.id} value={p.id}>{p.palletId} - {p.description}</option>)}
                </select>
              </div>
              <div>
                <Label>Descripcion</Label>
                <Input placeholder="Descripcion del ajuste" value={newAdj.description} onChange={(e) => setNewAdj({ ...newAdj, description: e.target.value })} />
              </div>
              <Button onClick={handleCreate} className="w-full font-medium transition-all duration-200 hover:shadow-lg hover:opacity-90" style={{ background: BRAND_RED }}>
                Crear Ajuste
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3">
        {adjustments?.map((adj) => {
          const status = getStatusConfig(adj.estado);
          const StatusIcon = status.icon;
          return (
            <Card key={adj.id} className="border shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer" onClick={() => setViewingAdj(adj.id)}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: status.color + "15" }}>
                      <ClipboardList className="w-5 h-5" style={{ color: status.color }} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-sm" style={{ color: "hsl(207 55% 15%)" }}>{adj.adjustmentId}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${status.bg} ${status.text} ${status.border} border`}>
                          {status.label}
                        </span>
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: "hsl(207 20% 45%)" }}>{adj.description || "Sin descripcion"}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: "hsl(207 20% 55%)" }}>{adj.fecha}</p>
                    </div>
                  </div>
                  <Eye className="w-4 h-4" style={{ color: "hsl(207 20% 60%)" }} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
