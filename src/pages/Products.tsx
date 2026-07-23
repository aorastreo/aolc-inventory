import { trpc } from "@/providers/trpc";
import { useParams, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Search, Plus, Trash2, Package, Barcode } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import ProductAutocomplete from "@/components/ProductAutocomplete";

const BRAND_RED = "#B22234";
const BRAND_BLUE = "#1B3A5C";

export default function ProductsPage() {
  const { palletId } = useParams<{ palletId: string }>();
  const navigate = useNavigate();
  const palletIdNum = Number(palletId);

  const { data: pallet } = trpc.inventory.palletById.useQuery({ id: palletIdNum });
  const { data: products, isLoading } = trpc.inventory.products.useQuery({ storeId: 1, palletId: palletIdNum });
  const utils = trpc.useUtils();

  const createProduct = trpc.inventory.createProduct.useMutation({
    onSuccess: () => utils.inventory.products.invalidate(),
  });
  const deleteProduct = trpc.inventory.deleteProduct.useMutation({
    onSuccess: () => utils.inventory.products.invalidate(),
  });

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  // New product form state
  const [form, setForm] = useState({ nombre: "", precio: "", cantidad: 1, codigoBarras: "" });

  if (isLoading) return (
    <div className="flex items-center justify-center h-full">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: BRAND_RED }} />
    </div>
  );

  const filtered = products?.filter(p =>
    p.nombre.toLowerCase().includes(search.toLowerCase()) ||
    (p.codigoBarras && p.codigoBarras.includes(search))
  );

  const handleCreate = () => {
    if (!form.nombre || !form.precio) return;
    createProduct.mutate({
      storeId: 1, palletId: palletIdNum,
      nombre: form.nombre, precio: form.precio,
      cantidad: form.cantidad, codigoBarras: form.codigoBarras,
    });
    setForm({ nombre: "", precio: "", cantidad: 1, codigoBarras: "" });
    setDialogOpen(false);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="outline" size="sm" onClick={() => navigate("/pallets")} style={{ color: BRAND_BLUE, borderColor: "hsl(210 20% 88%)" }}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Volver
        </Button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #B22234 0%, #8B1A2B 100%)" }}>
            <Package className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ color: "hsl(207 55% 15%)" }}>{pallet?.palletId || "Contenedor"}</h1>
            <p className="text-xs" style={{ color: "hsl(207 20% 45%)" }}>{pallet?.description}</p>
          </div>
        </div>
      </div>

      {/* Actions bar */}
      <div className="flex items-center justify-between mb-6">
        <div className="relative w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "hsl(207 20% 60%)" }} />
          <Input placeholder="Buscar articulo..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 h-10" />
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="font-medium transition-all duration-200 hover:shadow-lg hover:opacity-90" style={{ background: BRAND_RED }}>
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
              {/* Contenedor (read-only) */}
              <div>
                <Label>Contenedor</Label>
                <div className="h-10 flex items-center px-3 rounded-md border bg-gray-50 text-sm font-medium" style={{ borderColor: "hsl(210 20% 88%)", color: "hsl(207 55% 15%)" }}>
                  {pallet?.palletId} - {pallet?.description}
                </div>
              </div>

              {/* Autocomplete */}
              <ProductAutocomplete
                nombre={form.nombre}
                precio={form.precio}
                codigoBarras={form.codigoBarras}
                cantidad={form.cantidad}
                onChange={setForm}
              />

              {/* Precio */}
              <div>
                <Label>Precio de Venta</Label>
                <Input type="number" placeholder="0" value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value })} />
              </div>

              {/* Cantidad */}
              <div>
                <Label>Cantidad</Label>
                <Input type="number" placeholder="1" min={1} value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: Number(e.target.value) })} />
                <p className="text-xs mt-1" style={{ color: "hsl(207 20% 55%)" }}>Numero de unidades de este articulo</p>
              </div>

              {/* Codigo de barras */}
              <div>
                <Label className="flex items-center gap-1">
                  <Barcode className="w-3.5 h-3.5" />
                  Codigo de Barras
                </Label>
                <Input placeholder="Opcional" value={form.codigoBarras} onChange={(e) => setForm({ ...form, codigoBarras: e.target.value })} />
              </div>

              <Button onClick={handleCreate} className="w-full h-11 font-medium" style={{ background: BRAND_RED }}>
                Guardar Articulo
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow style={{ background: "hsl(0 0% 98%)" }}>
              <TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: BRAND_BLUE }}>Codigo</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: BRAND_BLUE }}>Nombre</TableHead>
              <TableHead className="text-right font-semibold text-xs uppercase tracking-wider" style={{ color: BRAND_BLUE }}>Precio</TableHead>
              <TableHead className="text-right font-semibold text-xs uppercase tracking-wider" style={{ color: BRAND_BLUE }}>Cantidad</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: BRAND_BLUE }}>Cod. Barras</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12" style={{ color: "hsl(207 20% 55%)" }}>
                  <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No hay articulos en este contenedor</p>
                </TableCell>
              </TableRow>
            ) : (
              filtered?.map((product) => (
                <TableRow key={product.id} className="hover:bg-gray-50/50 transition-colors border-b" style={{ borderColor: "hsl(210 20% 94%)" }}>
                  <TableCell className="text-sm" style={{ color: "hsl(207 20% 45%)" }}>{product.codigo || "-"}</TableCell>
                  <TableCell className="text-sm font-semibold" style={{ color: "hsl(207 55% 15%)" }}>{product.nombre}</TableCell>
                  <TableCell className="text-right text-sm font-semibold" style={{ color: "hsl(207 55% 15%)" }}>
                    {Number(product.precio).toLocaleString("es-CR", { style: "currency", currency: "CRC" })}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: "rgba(27,58,92,0.1)", color: BRAND_BLUE }}>
                      {product.cantidad}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm font-mono text-xs" style={{ color: "hsl(207 20% 55%)" }}>{product.codigoBarras || "-"}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => deleteProduct.mutate({ id: product.id })} className="hover:bg-red-50">
                      <Trash2 className="w-4 h-4" style={{ color: BRAND_RED }} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
