import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowLeftRight, Plus, Trash2, Barcode, Download, CheckCircle, XCircle, Clock,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";

const BRAND_RED = "#B22234";
const BRAND_BLUE = "#1B3A5C";

export default function TransfersPage() {
  const utils = trpc.useUtils();
  const { data: transfersList, isLoading } = trpc.inventory.getTransfers.useQuery({});

  const createTransfer = trpc.inventory.createTransfer.useMutation({
    onSuccess: () => { utils.inventory.getTransfers.invalidate(); setShowCreate(false); },
  });
  const addItem = trpc.inventory.addTransferItem.useMutation({
    onSuccess: () => { utils.inventory.getTransferItems.invalidate(); setBarcode(""); setScannedProduct(null); setScanQty(1); barcodeRef.current?.focus(); },
  });
  const removeItem = trpc.inventory.removeTransferItem.useMutation({
    onSuccess: () => utils.inventory.getTransferItems.invalidate(),
  });
  const completeTransfer = trpc.inventory.completeTransfer.useMutation({
    onSuccess: () => { utils.inventory.getTransfers.invalidate(); setViewingTransfer(null); },
  });

  const [showCreate, setShowCreate] = useState(false);
  const [destino, setDestino] = useState("");

  // Viewing
  const [viewingTransfer, setViewingTransfer] = useState<number | null>(null);
  const { data: transferDetail } = trpc.inventory.getTransferItems.useQuery(
    { transferId: viewingTransfer! },
    { enabled: !!viewingTransfer }
  );
  const currentTransfer = transfersList?.find(t => t.id === viewingTransfer);

  // Scanning
  const [barcode, setBarcode] = useState("");
  const [scannedProduct, setScannedProduct] = useState<any>(null);
  const [scanQty, setScanQty] = useState(1);
  const barcodeRef = useRef<HTMLInputElement>(null);

  // Search by barcode across all products (storeId=1 for now)
  const { data: foundProduct } = trpc.inventory.searchProductByBarcode.useQuery(
    { storeId: 1, barcode },
    { enabled: barcode.length >= 5 && !!viewingTransfer && currentTransfer?.estado === "activo" }
  );

  useEffect(() => {
    if (foundProduct && barcode.length >= 5) {
      setScannedProduct(foundProduct);
      setScanQty(1);
    }
  }, [foundProduct]);

  const handleAddItem = () => {
    if (!viewingTransfer || !scannedProduct || scanQty < 1) return;
    addItem.mutate({
      transferId: viewingTransfer,
      codigoBarras: scannedProduct.codigoBarras || barcode,
      nombre: scannedProduct.nombre,
      precio: String(scannedProduct.precio),
      cantidad: scanQty,
      orden: (transferDetail?.length || 0) + 1,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && scannedProduct) {
      e.preventDefault();
      handleAddItem();
    }
  };

  const handleCreate = () => {
    if (!destino.trim()) return;
    createTransfer.mutate({
      fromStoreId: 1,
      toStoreId: 1,
      fecha: new Date().toISOString().split("T")[0],
    });
    setDestino("");
  };

  // Export QUPOS format
  const exportQupos = () => {
    if (!transferDetail || transferDetail.length === 0) return;
    let csv = "CODIGO ARTICULO,DESCRIPCION,CATEGORIA,SUBCATEGORIA,ESTADO,CANTIDAD,PRECIO\n";
    transferDetail.forEach(item => {
      csv += `${item.codigoBarras || ""},${item.nombre},2,FNCQ,Nuevo,${item.cantidad},${item.precio}\n`;
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `qupos-transferencia-${currentTransfer?.id || 0}-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const formatCurrency = (value: string) => Number(value || 0).toLocaleString("es-CR", { style: "currency", currency: "CRC" });

  const getStatusConfig = (estado: string) => {
    switch (estado) {
      case "activo": return { icon: Clock, color: "#D97706", bg: "bg-amber-50", text: "text-amber-700", label: "Activo" };
      case "completado": return { icon: CheckCircle, color: "#16A34A", bg: "bg-green-50", text: "text-green-700", label: "Completado" };
      case "cancelado": return { icon: XCircle, color: "#DC2626", bg: "bg-red-50", text: "text-red-700", label: "Cancelado" };
      default: return { icon: Clock, color: "#9CA3AF", bg: "bg-gray-50", text: "text-gray-700", label: estado };
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
                <h1 className="text-xl font-bold tracking-tight" style={{ color: "hsl(207 55% 15%)" }}>{currentTransfer.fecha}</h1>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${status.bg} ${status.text} ${status.border} border`}>
                  {status.label}
                </span>
              </div>
              <p className="text-xs" style={{ color: "hsl(207 20% 45%)" }}>Transferencia #{currentTransfer.id}</p>
            </div>
          </div>
        </div>

        {/* Stats + Export */}
        {transferDetail && transferDetail.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 mb-5">
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: "rgba(178,34,52,0.12)", color: BRAND_RED }}>
              <ArrowLeftRight className="w-4 h-4" />
              <span>{transferDetail.length} productos | {transferDetail.reduce((s, i) => s + i.cantidad, 0)} unidades</span>
            </div>
            <Button variant="outline" size="sm" onClick={exportQupos} className="font-medium" style={{ color: BRAND_BLUE, borderColor: "hsl(210 20% 88%)" }}>
              <Download className="w-4 h-4 mr-2" />
              Descargar para Qupos
            </Button>
          </div>
        )}

        {/* Scanner */}
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
                    placeholder="Escanea codigo de barras..."
                    value={barcode}
                    onChange={(e) => { setBarcode(e.target.value); if (e.target.value.length < 5) setScannedProduct(null); }}
                    onKeyDown={handleKeyDown}
                    className="pl-10 h-12 text-lg font-mono"
                    autoFocus
                  />
                </div>

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
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-32">
                        <Label className="text-xs">Cantidad a enviar</Label>
                        <Input type="number" min={1} value={scanQty} onChange={(e) => setScanQty(Number(e.target.value))} className="h-10 text-center" />
                      </div>
                      <Button onClick={handleAddItem} className="h-10 mt-5 font-medium" style={{ background: BRAND_RED }}>
                        <Plus className="w-4 h-4 mr-2" />
                        Agregar
                      </Button>
                    </div>
                  </div>
                )}

                {barcode.length >= 5 && !scannedProduct && (
                  <p className="text-sm" style={{ color: "#DC2626" }}>Producto no encontrado</p>
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

        {currentTransfer.estado === "activo" && (
          <Button onClick={() => completeTransfer.mutate({ id: viewingTransfer })} className="font-medium" style={{ background: "#16A34A" }}>
            <CheckCircle className="w-4 h-4 mr-2" />
            Completar Transferencia
          </Button>
        )}
      </div>
    );
  }

  // List view
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "hsl(207 55% 15%)" }}>Transferencias</h1>
          <p className="text-sm mt-0.5" style={{ color: "hsl(207 20% 45%)" }}>Escanea productos y exporta para Qupos</p>
        </div>
        <Button className="font-medium" style={{ background: BRAND_RED }} onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Nueva Transferencia
        </Button>
      </div>

      {showCreate && (
        <Card className="mb-6 border shadow-sm">
          <CardContent className="p-5">
            <h3 className="text-sm font-semibold mb-4" style={{ color: BRAND_BLUE }}>Crear Transferencia</h3>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <Label className="text-xs">A que tienda va?</Label>
                <Input placeholder="Ej: Santa Rosa, Pavon, Tienda 2..." value={destino} onChange={(e) => setDestino(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleCreate()} className="h-10" />
              </div>
              <Button onClick={handleCreate} className="h-10 font-medium" style={{ background: BRAND_RED }}>
                Crear
              </Button>
              <Button variant="outline" onClick={() => setShowCreate(false)} className="h-10">
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {transfersList?.map((t) => {
          const status = getStatusConfig(t.estado);
          return (
            <Card key={t.id} className="border shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer" onClick={() => setViewingTransfer(t.id)}>
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
