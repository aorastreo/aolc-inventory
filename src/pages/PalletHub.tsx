import { trpc } from "@/providers/trpc";
import { useActiveStore } from "@/hooks/useActiveStore";
import { useParams, useNavigate, useSearchParams, Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import ProductAutocomplete from "@/components/ProductAutocomplete";
import MarginGauge from "@/components/MarginGauge";
import {
  ArrowLeft, Search, Plus, Trash2, Package, Barcode, Pencil, Check, X,
  ClipboardList, ArrowLeftRight, TrendingUp, Eye, Clock, CheckCircle, XCircle, Container,
} from "lucide-react";
import { useState, useMemo } from "react";

const BRAND_RED = "#B22234";
const BRAND_BLUE = "#1B3A5C";

type TabKey = "productos" | "ajustes" | "rentabilidad" | "transferencias";

const fmt = (n: number) => n.toLocaleString("es-CR", { style: "currency", currency: "CRC" });

export default function PalletHubPage() {
  const { palletId } = useParams<{ palletId: string }>();
  const palletIdNum = Number(palletId);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab") as TabKey | null;
  const activeTab: TabKey =
    tabParam && ["productos", "ajustes", "rentabilidad", "transferencias"].includes(tabParam)
      ? tabParam
      : "productos";

  const { storeId } = useActiveStore();
  const utils = trpc.useUtils();

  const { data: pallet, isLoading: palletLoading } = trpc.inventory.palletById.useQuery({ id: palletIdNum, storeId });
  const { data: products, isLoading: productsLoading } = trpc.inventory.products.useQuery(
    { storeId, palletId: palletIdNum },
  );
  const { data: adjustments } = trpc.inventory.adjustments.useQuery({ storeId, palletId: palletIdNum });
  const { data: profitApi } = trpc.inventory.palletProfitability.useQuery(
    { storeId, palletId: palletIdNum },
    { enabled: activeTab === "rentabilidad" },
  );
  const { data: relatedTransfers } = trpc.inventory.palletRelatedTransfers.useQuery(
    { storeId, palletId: palletIdNum },
    { enabled: activeTab === "transferencias" },
  );

  const createProduct = trpc.inventory.createProduct.useMutation({
    onSuccess: () => { utils.inventory.products.invalidate(); utils.inventory.palletProfitability.invalidate(); },
  });
  const deleteProduct = trpc.inventory.deleteProduct.useMutation({
    onSuccess: () => { utils.inventory.products.invalidate(); utils.inventory.palletProfitability.invalidate(); },
  });
  const updateProduct = trpc.inventory.updateProduct.useMutation({
    onSuccess: () => { utils.inventory.products.invalidate(); utils.inventory.palletProfitability.invalidate(); setEditingProductId(null); },
  });
  const createAdj = trpc.inventory.createAdjustment.useMutation({
    onSuccess: () => utils.inventory.adjustments.invalidate(),
  });
  const allocateCost = trpc.inventory.allocatePalletCost.useMutation({
    onSuccess: () => {
      utils.inventory.products.invalidate();
      utils.inventory.palletProfitability.invalidate();
      alert("Costo del contenedor repartido en los articulos sin costo.");
    },
    onError: (err) => alert(err.message),
  });

  const [productSearch, setProductSearch] = useState("");
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [form, setForm] = useState({ nombre: "", precio: "", cantidad: 1, codigoBarras: "", costo: "" });
  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [editProductForm, setEditProductForm] = useState({ nombre: "", precio: "", cantidad: 1, codigoBarras: "", costo: "" });

  const [adjDialogOpen, setAdjDialogOpen] = useState(false);
  const [newAdj, setNewAdj] = useState({ adjustmentId: "", description: "" });

  const rentabilidad = useMemo(() => {
    const list = products || [];
    const ventas = list.reduce((s, p) => s + Number(p.precio || 0) * (p.cantidad || 0), 0);
    const hasCosto = list.some((p) => (p as { costo?: string | null }).costo != null && (p as { costo?: string | null }).costo !== "");
    const costoTotalArticulos = hasCosto
      ? list.reduce((s, p) => s + Number((p as { costo?: string }).costo || 0) * (p.cantidad || 0), 0)
      : null;
    const palletCosto = Number(pallet?.costo || 0);
    const ganancia = ventas - palletCosto;
    const margen = ventas > 0 ? (ganancia / ventas) * 100 : 0;
    return { ventas, costoTotalArticulos, palletCosto, ganancia, margen, hasCosto };
  }, [products, pallet]);

  const setTab = (tab: TabKey) => {
    setSearchParams({ tab });
  };

  const handleCreateProduct = () => {
    if (!form.nombre || !form.precio) return;
    const payload = {
      storeId,
      palletId: palletIdNum,
      nombre: form.nombre,
      precio: form.precio,
      cantidad: form.cantidad,
      codigoBarras: form.codigoBarras,
      ...(form.costo ? { costo: form.costo } : {}),
    };
    createProduct.mutate(payload as Parameters<typeof createProduct.mutate>[0]);
    setForm({ nombre: "", precio: "", cantidad: 1, codigoBarras: "", costo: "" });
    setProductDialogOpen(false);
  };

  const handleCreateAdj = () => {
    if (!newAdj.adjustmentId) return;
    createAdj.mutate({
      storeId,
      palletId: palletIdNum,
      adjustmentId: newAdj.adjustmentId,
      description: newAdj.description,
      fecha: new Date().toISOString().split("T")[0],
      fechaHora: new Date().toLocaleString("es-CR"),
    });
    setNewAdj({ adjustmentId: "", description: "" });
    setAdjDialogOpen(false);
  };

  const getAdjStatus = (estado: string) => {
    switch (estado) {
      case "activo": return { icon: Clock, color: "#D97706", label: "Activo" };
      case "completado": return { icon: CheckCircle, color: "#16A34A", label: "Completado" };
      case "cancelado": return { icon: XCircle, color: "#DC2626", label: "Cancelado" };
      default: return { icon: Clock, color: "#9CA3AF", label: estado };
    }
  };

  if (palletLoading || productsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: BRAND_RED }} />
      </div>
    );
  }

  const filteredProducts = products?.filter((p) =>
    p.nombre.toLowerCase().includes(productSearch.toLowerCase()) ||
    (p.codigoBarras && p.codigoBarras.includes(productSearch)),
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <Button variant="outline" size="sm" onClick={() => navigate("/pallets")} style={{ color: BRAND_BLUE, borderColor: "hsl(210 20% 88%)" }}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Contenedores
        </Button>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, #B22234 0%, #8B1A2B 100%)" }}>
            <Container className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight truncate" style={{ color: "hsl(207 55% 15%)" }}>
              {pallet?.palletId || "Contenedor"}
            </h1>
            <p className="text-xs truncate" style={{ color: "hsl(207 20% 45%)" }}>{pallet?.description}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="font-medium"
            style={{ borderColor: "hsl(210 20% 88%)", color: "#B45309" }}
            onClick={() => { setTab("ajustes"); setAdjDialogOpen(true); }}
          >
            <ClipboardList className="w-4 h-4 mr-2" />
            Nuevo ajuste
          </Button>
          <Button variant="outline" size="sm" asChild className="font-medium" style={{ borderColor: "hsl(210 20% 88%)", color: BRAND_BLUE }}>
            <Link to="/transfers">
              <ArrowLeftRight className="w-4 h-4 mr-2" />
              Ir a transferencias
            </Link>
          </Button>
        </div>
      </div>

      {Number.isFinite(palletIdNum) && palletIdNum > 0 && (
        <MarginGauge storeId={storeId} palletId={palletIdNum} />
      )}

      <Tabs value={activeTab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList className="mb-6">
          <TabsTrigger value="productos">Productos</TabsTrigger>
          <TabsTrigger value="ajustes">Ajustes</TabsTrigger>
          <TabsTrigger value="rentabilidad">Rentabilidad</TabsTrigger>
          <TabsTrigger value="transferencias">Transferencias</TabsTrigger>
        </TabsList>

        <TabsContent value="productos">
          <div className="flex items-center justify-between mb-6">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "hsl(207 20% 60%)" }} />
              <Input placeholder="Buscar articulo..." value={productSearch} onChange={(e) => setProductSearch(e.target.value)} className="pl-10 h-10" />
            </div>
            <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
              <DialogTrigger asChild>
                <Button className="font-medium ml-4 shrink-0" style={{ background: BRAND_RED }}>
                  <Plus className="w-4 h-4 mr-2" />
                  Agregar Articulo
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Package className="w-5 h-5" style={{ color: BRAND_RED }} />
                    Nuevo Articulo
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-2">
                  <ProductAutocomplete
                    nombre={form.nombre}
                    precio={form.precio}
                    codigoBarras={form.codigoBarras}
                    cantidad={form.cantidad}
                    onChange={(fields) => setForm({ ...form, ...fields })}
                  />
                  <div>
                    <Label>Precio de Venta</Label>
                    <Input type="number" placeholder="0" value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value })} />
                  </div>
                  <div>
                    <Label>Costo unitario (opcional)</Label>
                    <Input type="number" placeholder="0" value={form.costo} onChange={(e) => setForm({ ...form, costo: e.target.value })} />
                  </div>
                  <div>
                    <Label>Cantidad</Label>
                    <Input type="number" min={1} value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label className="flex items-center gap-1">
                      <Barcode className="w-3.5 h-3.5" />
                      Codigo de Barras
                    </Label>
                    <Input placeholder="Opcional" value={form.codigoBarras} onChange={(e) => setForm({ ...form, codigoBarras: e.target.value })} />
                  </div>
                  <Button onClick={handleCreateProduct} className="w-full h-11 font-medium" style={{ background: BRAND_RED }}>
                    Guardar Articulo
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow style={{ background: "hsl(0 0% 98%)" }}>
                  <TableHead style={{ color: BRAND_BLUE }}>Nombre</TableHead>
                  <TableHead className="text-right" style={{ color: BRAND_BLUE }}>Precio</TableHead>
                  <TableHead className="text-right" style={{ color: BRAND_BLUE }}>Costo</TableHead>
                  <TableHead className="text-right" style={{ color: BRAND_BLUE }}>Cant.</TableHead>
                  <TableHead style={{ color: BRAND_BLUE }}>Cod. Barras</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-sm" style={{ color: "hsl(207 20% 55%)" }}>
                      No hay articulos en este contenedor
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProducts?.map((product) => {
                    const isEditing = editingProductId === product.id;
                    const prodCosto = (product as { costo?: string }).costo;
                    return (
                      <TableRow key={product.id} className="hover:bg-gray-50/50">
                        {isEditing ? (
                          <>
                            <TableCell><Input value={editProductForm.nombre} onChange={(e) => setEditProductForm({ ...editProductForm, nombre: e.target.value })} className="h-8 text-sm" /></TableCell>
                            <TableCell><Input type="number" value={editProductForm.precio} onChange={(e) => setEditProductForm({ ...editProductForm, precio: e.target.value })} className="h-8 text-sm text-right" /></TableCell>
                            <TableCell><Input type="number" value={editProductForm.costo} onChange={(e) => setEditProductForm({ ...editProductForm, costo: e.target.value })} className="h-8 text-sm text-right" /></TableCell>
                            <TableCell><Input type="number" value={editProductForm.cantidad} onChange={(e) => setEditProductForm({ ...editProductForm, cantidad: Number(e.target.value) })} className="h-8 text-sm text-right" min={1} /></TableCell>
                            <TableCell><Input value={editProductForm.codigoBarras} onChange={(e) => setEditProductForm({ ...editProductForm, codigoBarras: e.target.value })} className="h-8 text-sm font-mono" /></TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button variant="ghost" size="sm" onClick={() => {
                                  const payload = { id: product.id, storeId, ...editProductForm };
                                  updateProduct.mutate(payload as Parameters<typeof updateProduct.mutate>[0]);
                                }} className="h-8 w-8 p-0">
                                  <Check className="w-4 h-4 text-green-600" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setEditingProductId(null)} className="h-8 w-8 p-0">
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell className="text-sm font-semibold">{product.nombre}</TableCell>
                            <TableCell className="text-right text-sm">{fmt(Number(product.precio))}</TableCell>
                            <TableCell className="text-right text-sm">{prodCosto != null && prodCosto !== "" ? fmt(Number(prodCosto)) : "—"}</TableCell>
                            <TableCell className="text-right text-sm">{product.cantidad}</TableCell>
                            <TableCell className="text-sm font-mono text-xs">{product.codigoBarras || "—"}</TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button variant="ghost" size="sm" onClick={() => {
                                  setEditingProductId(product.id);
                                  setEditProductForm({
                                    nombre: product.nombre,
                                    precio: String(product.precio),
                                    cantidad: product.cantidad,
                                    codigoBarras: product.codigoBarras || "",
                                    costo: prodCosto != null ? String(prodCosto) : "",
                                  });
                                }} className="h-8 w-8 p-0">
                                  <Pencil className="w-4 h-4" style={{ color: BRAND_BLUE }} />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => deleteProduct.mutate({ id: product.id, storeId })} className="h-8 w-8 p-0">
                                  <Trash2 className="w-4 h-4" style={{ color: BRAND_RED }} />
                                </Button>
                              </div>
                            </TableCell>
                          </>
                        )}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="ajustes">
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm" style={{ color: "hsl(207 20% 45%)" }}>Ajustes de este contenedor</p>
            <Dialog open={adjDialogOpen} onOpenChange={setAdjDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" style={{ background: BRAND_RED }}>
                  <Plus className="w-4 h-4 mr-2" />
                  Nuevo Ajuste
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Crear Ajuste</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-2">
                  <div>
                    <Label>ID del Ajuste</Label>
                    <Input placeholder="ej: P-014-AJ-001" value={newAdj.adjustmentId} onChange={(e) => setNewAdj({ ...newAdj, adjustmentId: e.target.value })} />
                  </div>
                  <div>
                    <Label>Descripcion</Label>
                    <Input value={newAdj.description} onChange={(e) => setNewAdj({ ...newAdj, description: e.target.value })} />
                  </div>
                  <Button onClick={handleCreateAdj} className="w-full" style={{ background: BRAND_RED }}>Crear</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <div className="space-y-3">
            {adjustments?.length === 0 && (
              <p className="text-sm text-center py-8" style={{ color: "hsl(207 20% 55%)" }}>Sin ajustes para este contenedor</p>
            )}
            {adjustments?.map((adj) => {
              const st = getAdjStatus(adj.estado);
              const Icon = st.icon;
              return (
                <Card key={adj.id} className="border shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: st.color + "18" }}>
                        <Icon className="w-4 h-4" style={{ color: st.color }} />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{adj.adjustmentId}</p>
                        <p className="text-xs" style={{ color: "hsl(207 20% 45%)" }}>{adj.description || "Sin descripcion"} · {adj.fecha}</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/adjustments?palletId=${palletIdNum}&view=${adj.id}`}>
                        <Eye className="w-4 h-4 mr-1" />
                        Ver detalle
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="rentabilidad">
          <div className="flex flex-wrap gap-3 mb-4">
            <Button
              variant="outline"
              size="sm"
              disabled={allocateCost.isPending}
              onClick={() => {
                if (confirm("Repartir el costo del contenedor entre las unidades activas sin costo?")) {
                  allocateCost.mutate({ storeId, palletId: palletIdNum, overwrite: false });
                }
              }}
              style={{ color: BRAND_BLUE, borderColor: "hsl(210 20% 88%)" }}
            >
              Repartir costo del contenedor
            </Button>
            <p className="text-xs self-center" style={{ color: "hsl(207 20% 45%)" }}>
              {profitApi ? `${profitApi.units} uds · ${profitApi.unitsWithCosto} con costo unitario` : ""}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card className="border shadow-sm">
              <CardContent className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: BRAND_BLUE }}>Costo del contenedor</p>
                <p className="text-2xl font-bold">{fmt(profitApi?.palletCosto ?? rentabilidad.palletCosto)}</p>
              </CardContent>
            </Card>
            <Card className="border shadow-sm">
              <CardContent className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: BRAND_BLUE }}>Ventas (precio × cant.)</p>
                <p className="text-2xl font-bold">{fmt(profitApi?.ventas ?? rentabilidad.ventas)}</p>
              </CardContent>
            </Card>
            {(profitApi?.costoArticulos != null || rentabilidad.costoTotalArticulos != null) && (
              <Card className="border shadow-sm">
                <CardContent className="p-5">
                  <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: BRAND_BLUE }}>Costo total articulos</p>
                  <p className="text-2xl font-bold">{fmt(profitApi?.costoArticulos ?? rentabilidad.costoTotalArticulos ?? 0)}</p>
                </CardContent>
              </Card>
            )}
            <Card className="border shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="w-4 h-4" style={{ color: (profitApi?.ganancia ?? rentabilidad.ganancia) >= 0 ? "#16A34A" : BRAND_RED }} />
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: BRAND_BLUE }}>Ganancia estimada</p>
                </div>
                <p className="text-2xl font-bold" style={{ color: (profitApi?.ganancia ?? rentabilidad.ganancia) >= 0 ? "#16A34A" : BRAND_RED }}>
                  {(profitApi?.ganancia ?? rentabilidad.ganancia) >= 0 ? "+" : ""}{fmt(profitApi?.ganancia ?? rentabilidad.ganancia)}
                </p>
                <p className="text-xs mt-2" style={{ color: "hsl(207 20% 45%)" }}>
                  Margen: {(profitApi?.ventas ?? rentabilidad.ventas) > 0
                    ? `${(profitApi?.margenPct ?? rentabilidad.margen).toFixed(1)}%`
                    : "—"}
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="transferencias">
          <div className="flex justify-end mb-4">
            <Button asChild style={{ background: BRAND_RED }}>
              <Link to="/transfers">Nueva / ver transferencias</Link>
            </Button>
          </div>
          {!relatedTransfers?.length ? (
            <Card className="border shadow-sm">
              <CardContent className="p-6 text-center">
                <ArrowLeftRight className="w-10 h-10 mx-auto mb-3 opacity-40" style={{ color: BRAND_BLUE }} />
                <p className="text-sm font-medium mb-1">Sin transferencias vinculadas aun</p>
                <p className="text-xs" style={{ color: "hsl(207 20% 45%)" }}>
                  Aparecen aqui cuando se completan transferencias con codigos de este contenedor.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {relatedTransfers.map((t) => (
                <Card key={t.id} className="border shadow-sm">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-sm">#{t.id} · {t.fecha}</p>
                      <p className="text-xs" style={{ color: "hsl(207 20% 45%)" }}>
                        Bodega → tienda #{t.toStoreId} · {t.estado}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <Link to="/transfers">Abrir</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
