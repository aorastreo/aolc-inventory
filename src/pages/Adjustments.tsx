import { trpc } from "@/providers/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ClipboardList, CheckCircle, Clock, XCircle, Plus, Eye, Trash2, ArrowLeft, Save, RotateCcw } from "lucide-react";
import { useState } from "react";

export default function AdjustmentsPage() {
  const utils = trpc.useUtils();
  const { data: adjustments, isLoading } = trpc.inventory.adjustments.useQuery({ storeId: 1 });
  const { data: pallets } = trpc.inventory.pallets.useQuery({ storeId: 1 });

  const createAdj = trpc.inventory.createAdjustment.useMutation({ onSuccess: () => utils.inventory.adjustments.invalidate() });
  const completeAdj = trpc.inventory.completeAdjustment.useMutation({ onSuccess: () => { utils.inventory.adjustments.invalidate(); utils.inventory.products.invalidate(); } });
  const cancelAdj = trpc.inventory.cancelAdjustment.useMutation({ onSuccess: () => utils.inventory.adjustments.invalidate() });
  const addItem = trpc.inventory.addAdjustmentItem.useMutation({ onSuccess: () => { utils.inventory.adjustmentItems.invalidate(); utils.inventory.adjustments.invalidate(); } });
  const removeItem = trpc.inventory.removeAdjustmentItem.useMutation({ onSuccess: () => utils.inventory.adjustmentItems.invalidate() });

  const [viewingAdj, setViewingAdj] = useState<number | null>(null);
  const [newAdj, setNewAdj] = useState({ adjustmentId: "", description: "", palletId: "" });
  const [newItem, setNewItem] = useState({ nombre: "", precio: "", cantidad: 1, codigoBarras: "" });
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: adjDetail } = trpc.inventory.adjustmentById.useQuery(
    { id: viewingAdj! },
    { enabled: !!viewingAdj }
  );
  const { data: adjItems } = trpc.inventory.adjustmentItems.useQuery(
    { adjustmentId: viewingAdj! },
    { enabled: !!viewingAdj }
  );

  if (isLoading) return <div className="flex items-center justify-center h-full">Cargando...</div>;

  const getStatusIcon = (estado: string) => {
    switch (estado) {
      case "activo": return <Clock className="w-5 h-5 text-yellow-500" />;
      case "completado": return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "cancelado": return <XCircle className="w-5 h-5 text-red-500" />;
      default: return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusColor = (estado: string) => {
    switch (estado) {
      case "activo": return "bg-yellow-100 text-yellow-800";
      case "completado": return "bg-green-100 text-green-800";
      case "cancelado": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const handleCreate = () => {
    if (!newAdj.adjustmentId || !newAdj.palletId) return;
    createAdj.mutate({
      storeId: 1,
      palletId: Number(newAdj.palletId),
      adjustmentId: newAdj.adjustmentId,
      description: newAdj.description,
      fecha: new Date().toISOString().split("T")[0],
      fechaHora: new Date().toLocaleString("es-CR"),
    });
    setNewAdj({ adjustmentId: "", description: "", palletId: "" });
    setDialogOpen(false);
  };

  const handleAddItem = () => {
    if (!viewingAdj || !newItem.nombre || !newItem.precio) return;
    addItem.mutate({
      adjustmentId: viewingAdj,
      nombre: newItem.nombre,
      precio: newItem.precio,
      cantidad: newItem.cantidad,
      codigoBarras: newItem.codigoBarras,
      orden: (adjItems?.length || 0) + 1,
    });
    setNewItem({ nombre: "", precio: "", cantidad: 1, codigoBarras: "" });
  };

  const formatCurrency = (value: string) => {
    return Number(value || 0).toLocaleString("es-CR", { style: "currency", currency: "CRC" });
  };

  // Detail view
  if (viewingAdj && adjDetail) {
    return (
      <div>
        <div className="flex items-center gap-4 mb-6">
          <Button variant="outline" onClick={() => setViewingAdj(null)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{adjDetail.adjustmentId}</h1>
            <p className="text-sm text-gray-500">{adjDetail.description}</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(adjDetail.estado)}`}>
            {adjDetail.estado}
          </span>
        </div>

        {adjDetail.estado === "activo" && (
          <Card className="mb-6">
            <CardContent className="p-4">
              <h3 className="font-semibold mb-3">Agregar Articulo al Ajuste</h3>
              <div className="grid grid-cols-4 gap-3">
                <Input placeholder="Nombre" value={newItem.nombre} onChange={(e) => setNewItem({ ...newItem, nombre: e.target.value })} />
                <Input placeholder="Precio" type="number" value={newItem.precio} onChange={(e) => setNewItem({ ...newItem, precio: e.target.value })} />
                <Input placeholder="Cantidad" type="number" value={newItem.cantidad} onChange={(e) => setNewItem({ ...newItem, cantidad: Number(e.target.value) })} />
                <Input placeholder="Cod. Barras" value={newItem.codigoBarras} onChange={(e) => setNewItem({ ...newItem, codigoBarras: e.target.value })} />
              </div>
              <Button onClick={handleAddItem} className="mt-3 bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-2" />
                Agregar al Ajuste
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="bg-white rounded-lg border shadow-sm mb-6">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">#</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Nombre</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">Precio</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">Cant</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Cod. Barras</th>
                {adjDetail.estado === "activo" && <th className="px-4 py-3"></th>}
              </tr>
            </thead>
            <tbody>
              {adjItems?.map((item, idx) => (
                <tr key={item.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm">{idx + 1}</td>
                  <td className="px-4 py-3 text-sm font-medium">{item.nombre}</td>
                  <td className="px-4 py-3 text-sm text-right">{formatCurrency(String(item.precio))}</td>
                  <td className="px-4 py-3 text-sm text-right">{item.cantidad}</td>
                  <td className="px-4 py-3 text-sm">{item.codigoBarras || "-"}</td>
                  {adjDetail.estado === "activo" && (
                    <td className="px-4 py-3">
                      <Button variant="ghost" size="sm" onClick={() => removeItem.mutate({ id: item.id })}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {adjDetail.estado === "activo" && (
          <div className="flex gap-3">
            <Button onClick={() => { completeAdj.mutate({ id: viewingAdj }); setViewingAdj(null); }} className="bg-green-600 hover:bg-green-700">
              <CheckCircle className="w-4 h-4 mr-2" />
              Completar Ajuste
            </Button>
            <Button variant="destructive" onClick={() => { cancelAdj.mutate({ id: viewingAdj }); setViewingAdj(null); }}>
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
        <h1 className="text-2xl font-bold text-gray-800">Ajustes</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Ajuste
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Crear Nuevo Ajuste</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>ID del Ajuste</Label>
                <Input placeholder="ej: P-014-AJ-001" value={newAdj.adjustmentId} onChange={(e) => setNewAdj({ ...newAdj, adjustmentId: e.target.value })} />
              </div>
              <div>
                <Label>Contenedor</Label>
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  value={newAdj.palletId}
                  onChange={(e) => setNewAdj({ ...newAdj, palletId: e.target.value })}
                >
                  <option value="">Seleccionar contenedor</option>
                  {pallets?.map((p) => (
                    <option key={p.id} value={p.id}>{p.palletId} - {p.description}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Descripcion</Label>
                <Input placeholder="Descripcion del ajuste" value={newAdj.description} onChange={(e) => setNewAdj({ ...newAdj, description: e.target.value })} />
              </div>
              <Button onClick={handleCreate} className="w-full bg-blue-600 hover:bg-blue-700">Crear Ajuste</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3">
        {adjustments?.map((adj) => (
          <Card key={adj.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setViewingAdj(adj.id)}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="bg-purple-100 p-3 rounded-lg">
                    <ClipboardList className="w-6 h-6 text-purple-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-800">{adj.adjustmentId}</h3>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(adj.estado)}`}>{adj.estado}</span>
                    </div>
                    <p className="text-sm text-gray-500">{adj.description}</p>
                    <p className="text-xs text-gray-400">{adj.fecha}</p>
                  </div>
                </div>
                <Eye className="w-5 h-5 text-gray-400" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
