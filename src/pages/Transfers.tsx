import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  ArrowLeftRight, Plus, Trash2, Search, Package, CheckCircle, XCircle, Clock, Barcode, Download, Store,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";

const BRAND_RED = "#B22234";
const BRAND_BLUE = "#1B3A5C";

export default function TransfersPage() {
  const utils = trpc.useUtils();
  const { data: stores } = trpc.inventory.stores.useQuery();
  const { data: transfersList, isLoading } = trpc.inventory.getTransfers.useQuery({ storeId: 1 });

  const createTransfer = trpc.inventory.createTransfer.useMutation({
    onSuccess: () => { utils.inventory.getTransfers.invalidate(); setDialogOpen(false); },
  });
  const addItem = trpc.inventory.addTransferItem.useMutation({
    onSuccess: () => { utils.inventory.getTransferItems.invalidate(); setBarcode(""); barcodeRef.current?.focus(); },
  });
  const removeItem = trpc.inventory.removeTransferItem.useMutation({
    onSuccess: () => utils.inventory.getTransferItems.invalidate(),
  });
  const completeTransfer = trpc.inventory.completeTransfer.useMutation({
    onSuccess: () => { utils.inventory.getTransfers.invalidate(); setViewingTransfer(null); },
  });
  const cancelTransfer = trpc.inventory.cancelTransfer.useMutation({
    onSuccess: () => { utils.inventory.getTransfers.invalidate(); setViewingTransfer(null); },
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTransfer, setNewTransfer] = useState({ fromStoreId: "", toStoreId: "", fecha: new Date().toISOString().split("T")[0] });
  const [transferError, setTransferError] = useState("");

  // Viewing a single transfer
  const [viewingTransfer, setViewingTransfer] = useState<number | null>(null);
  const { data: transferDetail } = trpc.inventory.getTransferItems.useQuery(
    { transferId: viewingTransfer! },
    { enabled: !!viewingTransfer }
  );
  const currentTransfer = transfersList?.find(t => t.id === viewingTransfer);

  // Barcode scanning
  const [barcode, setBarcode] = useState("");
  const [scannedProduct, setScannedProduct] = useState<any>(null);
  const [scanQty, setScanQty] = useState(1);
  const barcodeRef = useRef<HTMLInputElement>(null);

  // Search product query
  const { data: foundProduct, isFetching: searching } = trpc.inventory.searchProductByBarcode.useQuery(
    { storeId: Number(newTransfer.fromStoreId) || 1, barcode },
    { enabled: barcode.length >= 5 && !!viewingTransfer && currentTransfer?.estado === "activo" }
  );

  // Auto-detect when product is found
  useEffect(() => {
    if (foundProduct && barcode.length >= 5) {
      setScannedProduct(foundProduct);
      setScanQty(1);
    }
  }, [foundProduct]);

  // Handle barcode scan (Enter key)
  const handleBarcodeKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && scannedProduct && viewingTransfer) {
      e.preventDefault();
      handleAddItem();
    }
  };

  const handleAddItem = () => {
    if (!viewingTransfer || !scannedProduct || scanQty < 1) return;
    addItem.mutate({
      transferId: viewingTransfer,
      codigoBarras: scannedProduct.codigoBarras,
      nombre: scannedProduct.nombre,
      precio: String(scannedProduct.precio),
      cantidad: scanQty,
      orden: (transferDetail?.length || 0) + 1,
    });
    setScannedProduct(null);
    setBarcode("");
  };

  const handleCreateTransfer = () => {
    setTransferError("");
    if (!newTransfer.fromStoreId) { setTransferError("Seleccione tienda origen"); return; }
    if (!newTransfer.toStoreId) { setTransferError("Seleccione tienda destino"); return; }
    if (newTransfer.fromStoreId === newTransfer.toStoreId) { setTransferError("Tienda origen y destino deben ser diferentes"); return; }
    createTransfer.mutate({
      fromStoreId: Number(newTransfer.fromStoreId),
      toStoreId: Number(newTransfer.toStoreId),
      fecha: newTransfer.fecha,
    });
    setNewTransfer({ fromStoreId: "", toStoreId: "", fecha: new Date().toISOString().split("T")[0] });
    setTransferError("");
  };

  // Export to CSV
  const exportToCSV = () => {
    if (!transferDetail || transferDetail.length === 0 || !currentTransfer) return;
    const fromStore = stores?.find(s => s.id === currentTransfer.fromStoreId)?.name || "Origen";
    const toStore = stores?.find(s => s.id === currentTransfer.toStoreId)?.name || "Destino";

    let csv = "Codigo Barras,Nombre,Precio Unitario,Cantidad,Subtotal\n";
    let total = 0;
    let totalQty = 0;
    transferDetail.forEach(item => {
      const subtotal = Number(item.precio) * item.cantidad;
      total += subtotal;
      totalQty += item.cantidad;
      csv += `${item.codigoBarras || ""},"${item.nombre}",${item.precio},${item.cantidad},${subtotal}\n`;
    });
    csv += `,,TOTAL:,${totalQty},${total}\n`;
    csv += `,,De:,${fromStore},\n`;
    csv += `,,Para:,${toStore},\n`;
    csv += `,,Fecha:,${currentTransfer.fecha},\n`;

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `transferencia-${currentTransfer.id}-${currentTransfer.fecha}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const formatCurrency = (value: string) => Number(value || 0).toLocaleString("es-CR", { style: "currency", currency: "CRC" });

  const getStatusConfig = (estado: string) => {
    switch (estado) {
      case "activo": return { icon: Clock, color: "#D97706", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", label: "Activo" };
      case "completado": return { icon: CheckCircle, color: "#16A34A", bg: "bg-green-50", text: "text-green-700", border: "border-green-200", label: "Completado" };
      case "cancelado": return { icon: XCircle, color: "#DC2626", bg: "bg-red-50", text: "text-red-700", border: "border-red-200", label: "Cancelado" };
      default: return { icon: Clock, color: "#9CA3AF", bg: "bg-gray-50", text: "text-gray-700", border: "border-gray-200", label: estado };
    }
  };

  if (isLoading) return (
    <div className="flex items-center justify-center h-full">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: BRAND_RED }} />
    </div>
  );

  // Detail view
  if (viewingTransfer && currentTransfer) {
    const status = getStatusConfig(currentTransfer.estado);
    const StatusIcon = status.icon;

    return (
      <div>
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="outline" size="sm" onClick={() => setViewingTransfer(null)} style={{ color: BRAND_BLUE, borderColor: "hsl(210 20% 88%)" }}>
            <ArrowLeftRight className="w-4 h-4 mr-2" />
            Volver
          </Button>
          <div className="flex items-center gap-3 flex-1">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: status.color + "18" }}>
              <ArrowLeftRight className="w-5 h-5" style={{ color: status.color }} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight" style={{ color: "hsl(207 55% 15%)" }}>Transferencia #{currentTransfer.id}</h1>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${status.bg} ${status.text} ${status.border} border`}>
                  {status.label}
                </span>
              </div>
              <p className="text-xs" style={{ color: "hsl(207 20% 45%)" }}>
                De: {stores?.find(s => s.id === currentTransfer.fromStoreId)?.name || "?"} → {stores?.find(s => s.id === currentTransfer.toStoreId)?.name || "?"} | {currentTransfer.fecha}
              </p>
            </div>
          </div>
        </div>

        {/* Stats bar */}
        {transferDetail && transferDetail.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 mb-5">
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: "rgba(178,34,52,0.12)", color: BRAND_RED }}>
              <Package className="w-4 h-4" />
              <span>{transferDetail.length} productos | {transferDetail.reduce((s, i) => s + i.cantidad, 0)} unidades | {transferDetail.reduce((s, i) => s + Number(i.precio) * i.cantidad, 0).toLocaleString("es-CR")}</span>
            </div>
            {currentTransfer.estado !== "cancelado" && (
              <Button variant="outline" size="sm" onClick={exportToCSV} className="font-medium" style={{ color: BRAND_BLUE, borderColor: "hsl(210 20% 88%)" }}>
                <Download className="w-4 h-4 mr-2" />
                Descargar Excel
              </Button>
            )}
          </div>
        )}

        {/* Barcode scanner */}
        {currentTransfer.estado === "activo" && (
          <Card className="mb-6 border shadow-sm">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: BRAND_BLUE }}>
                <Barcode className="w-4 h-4" />
                Escanear Producto
              </h3>
              <div className="space-y-4">
                <div className="relative">
                  <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "hsl(207 20% 55%)" }} />
                  <Input
                    ref={barcodeRef}
                    placeholder="Escanee codigo de barras con la pistola..."
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    onKeyDown={handleBarcodeKeyDown}
                    className="pl-10 h-12 text-lg font-mono"
                    autoFocus
                  />
                </div>

                {searching && (
                  <p className="text-sm" style={{ color: "hsl(207 20% 55%)" }}>Buscando...</p>
                )}

                {scannedProduct && (
                  <div className="p-4 rounded-lg border" style={{ background: "hsl(0 0% 98%)", borderColor: "hsl(210 20% 90%)" }}>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <Label className="text-xs" style={{ color: "hsl(207 20% 55%)" }}>Nombre</Label>
                        <p className="text-sm font-semibold" style={{ color: "hsl(207 55% 15%)" }}>{scannedProduct.nombre}</p>
                      </div>
                      <div>
                        <Label className="text-xs" style={{ color: "hsl(207 20% 55%)" }}>Precio</Label>
                        <p className="text-sm font-semibold" style={{ color: "hsl(207 55% 15%)" }}>{formatCurrency(String(scannedProduct.precio))}</p>
                      </div>
                      <div>
                        <Label className="text-xs" style={{ color: "hsl(207 20% 55%)" }}>Stock disponible</Label>
                        <p className="text-sm font-semibold" style={{ color: BRAND_BLUE }}>{scannedProduct.cantidad} unidades</p>
                      </div>
                      <div>
                        <Label className="text-xs" style={{ color: "hsl(207 20% 55%)" }}>Cod. Barras</Label>
                        <p className="text-sm font-mono" style={{ color: "hsl(207 55% 15%)" }}>{scannedProduct.codigoBarras}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-32">
                        <Label className="text-xs">Cantidad a enviar</Label>
                        <Input type="number" min={1} max={scannedProduct.cantidad} value={scanQty} onChange={(e) => setScanQty(Number(e.target.value))} className="h-10 text-center" />
                      </div>
                      <Button onClick={handleAddItem} className="h-10 mt-5 font-medium" style={{ background: BRAND_RED }}>
                        <Plus className="w-4 h-4 mr-2" />
                        Agregar
                      </Button>
                    </div>
                  </div>
                )}

                {barcode.length >= 5 && !scannedProduct && !searching && (
                  <p className="text-sm" style={{ color: "#DC2626" }}>Producto no encontrado en esta tienda</p>
                )}
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
                {currentTransfer.estado === "activo" && <th className="w-12"></th>}
              </tr>
            </thead>
            <tbody>
              {[...(transferDetail || [])].reverse().map((item, idx) => (
                <tr key={item.id} className="border-b hover:bg-gray-50/50 transition-colors" style={{ borderColor: "hsl(210 20% 94%)" }}>
                  <td className="px-4 py-3 text-sm" style={{ color: "hsl(207 20% 55%)" }}>{idx + 1}</td>
                  <td className="px-4 py-3 text-sm font-semibold" style={{ color: "hsl(207 55% 15%)" }}>{item.nombre}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium">{formatCurrency(String(item.precio))}</td>
                  <td className="px-4 py-3 text-sm text-right">{item.cantidad}</td>
                  <td className="px-4 py-3 text-sm font-mono text-xs" style={{ color: "hsl(207 20% 55%)" }}>{item.codigoBarras || "-"}</td>
                  {currentTransfer.estado === "activo" && (
                    <td className="px-4 py-3">
                      <Button variant="ghost" size="sm" onClick={() => removeItem.mutate({ id: item.id })} className="hover:bg-red-50 h-8 w-8 p-0">
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
        {currentTransfer.estado === "activo" && (
          <div className="flex gap-3">
            <Button onClick={() => completeTransfer.mutate({ id: viewingTransfer })} className="font-medium" style={{ background: "#16A34A" }}>
              <CheckCircle className="w-4 h-4 mr-2" />
              Completar Transferencia
            </Button>
            <Button variant="destructive" onClick={() => cancelTransfer.mutate({ id: viewingTransfer })} className="font-medium">
              <XCircle className="w-4 h-4 mr-2" />
              Cancelar
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
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "hsl(207 55% 15%)" }}>Transferencias</h1>
          </div>
          <p className="text-sm mt-0.5" style={{ color: "hsl(207 20% 45%)" }}>Gestiona transferencias de mercaderia entre tiendas</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="font-medium" style={{ background: BRAND_RED }}>
              <Plus className="w-4 h-4 mr-2" />
              Nueva Transferencia
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ArrowLeftRight className="w-5 h-5" style={{ color: BRAND_RED }} />
                Crear Transferencia
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <Label>Tienda Origen</Label>
                <select className="w-full h-10 border rounded-md px-3 text-sm" style={{ borderColor: "hsl(210 20% 88%)" }} value={newTransfer.fromStoreId} onChange={(e) => { setTransferError(""); setNewTransfer({ ...newTransfer, fromStoreId: e.target.value }); }}>
                  <option value="">Seleccionar tienda origen</option>
                  {stores?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <Label>Tienda Destino</Label>
                <select className="w-full h-10 border rounded-md px-3 text-sm" style={{ borderColor: "hsl(210 20% 88%)" }} value={newTransfer.toStoreId} onChange={(e) => { setTransferError(""); setNewTransfer({ ...newTransfer, toStoreId: e.target.value }); }}>
                  <option value="">Seleccionar tienda destino</option>
                  {stores?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <Label>Fecha</Label>
                <Input type="date" value={newTransfer.fecha} onChange={(e) => setNewTransfer({ ...newTransfer, fecha: e.target.value })} />
              </div>
              {transferError && (
                <p className="text-sm font-medium px-3 py-2 rounded-lg bg-red-50" style={{ color: "#DC2626" }}>{transferError}</p>
              )}
              <Button onClick={handleCreateTransfer} className="w-full font-medium" style={{ background: BRAND_RED }}>
                Crear Transferencia
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3">
        {transfersList?.map((t) => {
          const status = getStatusConfig(t.estado);
          const StatusIcon = status.icon;
          return (
            <Card key={t.id} className="border shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer" onClick={() => { setViewingTransfer(t.id); setBarcode(""); setScannedProduct(null); }}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: status.color + "15" }}>
                      <ArrowLeftRight className="w-5 h-5" style={{ color: status.color }} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-sm" style={{ color: "hsl(207 55% 15%)" }}>Transferencia #{t.id}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${status.bg} ${status.text} ${status.border} border`}>
                          {status.label}
                        </span>
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: "hsl(207 20% 45%)" }}>
                        {stores?.find(s => s.id === t.fromStoreId)?.name || "?"} → {stores?.find(s => s.id === t.toStoreId)?.name || "?"}
                      </p>
                      <p className="text-[10px] mt-0.5" style={{ color: "hsl(207 20% 55%)" }}>{t.fecha}</p>
                    </div>
                  </div>
                  <ArrowLeftRight className="w-4 h-4" style={{ color: "hsl(207 20% 60%)" }} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
