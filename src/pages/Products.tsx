import { trpc } from "@/providers/trpc";
import { useParams, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Search, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

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
  const [newProduct, setNewProduct] = useState({ nombre: "", precio: "", cantidad: 1, codigoBarras: "" });
  const [dialogOpen, setDialogOpen] = useState(false);

  if (isLoading) return <div className="flex items-center justify-center h-full">Cargando...</div>;

  const filtered = products?.filter(p =>
    p.nombre.toLowerCase().includes(search.toLowerCase()) ||
    (p.codigoBarras && p.codigoBarras.includes(search))
  );

  const handleCreate = () => {
    if (!newProduct.nombre || !newProduct.precio) return;
    createProduct.mutate({
      storeId: 1,
      palletId: palletIdNum,
      nombre: newProduct.nombre,
      precio: newProduct.precio,
      cantidad: newProduct.cantidad,
      codigoBarras: newProduct.codigoBarras,
    });
    setNewProduct({ nombre: "", precio: "", cantidad: 1, codigoBarras: "" });
    setDialogOpen(false);
  };

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Button variant="outline" onClick={() => navigate("/pallets")}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Volver
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            {pallet?.palletId || "Contenedor"}
          </h1>
          <p className="text-sm text-gray-500">{pallet?.description}</p>
        </div>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div className="relative w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Buscar articulo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" />
              Agregar Articulo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuevo Articulo</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Nombre</Label>
                <Input value={newProduct.nombre} onChange={(e) => setNewProduct({ ...newProduct, nombre: e.target.value })} />
              </div>
              <div>
                <Label>Precio</Label>
                <Input type="number" value={newProduct.precio} onChange={(e) => setNewProduct({ ...newProduct, precio: e.target.value })} />
              </div>
              <div>
                <Label>Cantidad</Label>
                <Input type="number" value={newProduct.cantidad} onChange={(e) => setNewProduct({ ...newProduct, cantidad: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Codigo de Barras</Label>
                <Input value={newProduct.codigoBarras} onChange={(e) => setNewProduct({ ...newProduct, codigoBarras: e.target.value })} />
              </div>
              <Button onClick={handleCreate} className="w-full bg-blue-600 hover:bg-blue-700">
                Guardar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-white rounded-lg border shadow-sm">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Codigo</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Nombre</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">Precio</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">Cantidad</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Cod. Barras</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered?.map((product) => (
              <tr key={product.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3 text-sm">{product.codigo || "-"}</td>
                <td className="px-4 py-3 text-sm font-medium">{product.nombre}</td>
                <td className="px-4 py-3 text-sm text-right">
                  {Number(product.precio).toLocaleString("es-CR", { style: "currency", currency: "CRC" })}
                </td>
                <td className="px-4 py-3 text-sm text-right">{product.cantidad}</td>
                <td className="px-4 py-3 text-sm">{product.codigoBarras || "-"}</td>
                <td className="px-4 py-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteProduct.mutate({ id: product.id })}
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
