import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Search, Plus, Trash2, Package, Pencil, Barcode } from "lucide-react";
import { useState } from "react";

const BRAND_RED = "#B22234";
const BRAND_BLUE = "#1B3A5C";

export default function CatalogPage() {
  const utils = trpc.useUtils();
  const { data: products, isLoading } = trpc.inventory.productDatabase.useQuery({ storeId: 1 });
  const createProduct = trpc.inventory.createProductDB.useMutation({
    onSuccess: () => utils.inventory.productDatabase.invalidate(),
  });
  const updateProduct = trpc.inventory.updateProductDB.useMutation({
    onSuccess: () => utils.inventory.productDatabase.invalidate(),
  });
  const deleteProduct = trpc.inventory.deleteProductDB.useMutation({
    onSuccess: () => utils.inventory.productDatabase.invalidate(),
  });

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<{ id: number; nombre: string; precio: string; codigoBarras: string } | null>(null);
  const [newProduct, setNewProduct] = useState({ nombre: "", precio: "", codigoBarras: "" });

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
    if (!newProduct.nombre) return;
    createProduct.mutate({ storeId: 1, nombre: newProduct.nombre, precio: newProduct.precio || "0", codigoBarras: newProduct.codigoBarras });
    setNewProduct({ nombre: "", precio: "", codigoBarras: "" });
    setDialogOpen(false);
  };

  const handleUpdate = () => {
    if (!editingProduct) return;
    updateProduct.mutate({
      id: editingProduct.id,
      nombre: editingProduct.nombre,
      precio: editingProduct.precio,
      codigoBarras: editingProduct.codigoBarras,
    });
    setEditDialogOpen(false);
    setEditingProduct(null);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "hsl(207 55% 15%)" }}>Catalogo de Productos</h1>
          <p className="text-sm mt-0.5" style={{ color: "hsl(207 20% 45%)" }}>
            {products?.length || 0} productos registrados
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="font-medium transition-all duration-200 hover:shadow-lg hover:opacity-90" style={{ background: BRAND_RED }}>
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Producto
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Package className="w-5 h-5" style={{ color: BRAND_RED }} />
                Agregar Producto al Catalogo
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div><Label>Nombre</Label><Input placeholder="Nombre del producto" value={newProduct.nombre} onChange={(e) => setNewProduct({ ...newProduct, nombre: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Precio Referencia (₡)</Label><Input type="number" placeholder="0" value={newProduct.precio} onChange={(e) => setNewProduct({ ...newProduct, precio: e.target.value })} /></div>
                <div><Label>Codigo de Barras</Label><Input placeholder="Ej: 77000123" value={newProduct.codigoBarras} onChange={(e) => setNewProduct({ ...newProduct, codigoBarras: e.target.value })} /></div>
              </div>
              <Button onClick={handleCreate} className="w-full font-medium" style={{ background: BRAND_RED }}>
                Guardar Producto
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative w-96 mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "hsl(207 20% 60%)" }} />
        <Input placeholder="Buscar por nombre o codigo de barras..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 h-10" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow style={{ background: "hsl(0 0% 98%)" }}>
              <TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: BRAND_BLUE }}>ID</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: BRAND_BLUE }}>Nombre</TableHead>
              <TableHead className="text-right font-semibold text-xs uppercase tracking-wider" style={{ color: BRAND_BLUE }}>Precio Referencia</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: BRAND_BLUE }}>Codigo Barras</TableHead>
              <TableHead className="text-center font-semibold text-xs uppercase tracking-wider" style={{ color: BRAND_BLUE }}>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12" style={{ color: "hsl(207 20% 55%)" }}>
                  <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No se encontraron productos</p>
                </TableCell>
              </TableRow>
            ) : (
              filtered?.map((product) => (
                <TableRow key={product.id} className="hover:bg-gray-50/50 transition-colors border-b" style={{ borderColor: "hsl(210 20% 94%)" }}>
                  <TableCell className="text-sm font-mono" style={{ color: "hsl(207 20% 55%)" }}>#{product.id}</TableCell>
                  <TableCell className="text-sm font-semibold" style={{ color: "hsl(207 55% 15%)" }}>{product.nombre}</TableCell>
                  <TableCell className="text-right text-sm font-semibold" style={{ color: "hsl(207 55% 15%)" }}>
                    {Number(product.precio).toLocaleString("es-CR", { style: "currency", currency: "CRC" })}
                  </TableCell>
                  <TableCell className="text-sm font-mono text-xs" style={{ color: "hsl(207 20% 55%)" }}>
                    {product.codigoBarras ? (
                      <span className="flex items-center gap-1">
                        <Barcode className="w-3.5 h-3.5" />
                        {product.codigoBarras}
                      </span>
                    ) : "-"}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs font-medium hover:bg-blue-50"
                        style={{ borderColor: "hsl(210 20% 88%)", color: BRAND_BLUE }}
                        onClick={() => { setEditingProduct({ id: product.id, nombre: product.nombre, precio: String(product.precio || 0), codigoBarras: product.codigoBarras || "" }); setEditDialogOpen(true); }}
                      >
                        <Pencil className="w-3.5 h-3.5 mr-1" />
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { if (confirm("Eliminar este producto del catalogo?")) deleteProduct.mutate({ id: product.id }); }}
                        className="hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" style={{ color: BRAND_RED }} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5" style={{ color: BRAND_RED }} />
              Editar Producto
            </DialogTitle>
          </DialogHeader>
          {editingProduct && (
            <div className="space-y-4 mt-2">
              <div><Label>Nombre</Label><Input value={editingProduct.nombre} onChange={(e) => setEditingProduct({ ...editingProduct, nombre: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Precio Referencia (₡)</Label><Input type="number" value={editingProduct.precio} onChange={(e) => setEditingProduct({ ...editingProduct, precio: e.target.value })} /></div>
                <div><Label>Codigo de Barras</Label><Input value={editingProduct.codigoBarras} onChange={(e) => setEditingProduct({ ...editingProduct, codigoBarras: e.target.value })} /></div>
              </div>
              <Button onClick={handleUpdate} className="w-full font-medium" style={{ background: BRAND_RED }}>
                Guardar Cambios
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
