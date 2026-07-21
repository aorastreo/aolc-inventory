import { trpc } from "@/providers/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router";
import { Package, Eye, Plus } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function PalletsPage() {
  const { data: pallets, isLoading } = trpc.inventory.pallets.useQuery({ storeId: 1 });
  const utils = trpc.useUtils();
  const createPallet = trpc.inventory.createPallet.useMutation({
    onSuccess: () => utils.inventory.pallets.invalidate(),
  });

  const [newPallet, setNewPallet] = useState({ palletId: "", description: "" });
  const [dialogOpen, setDialogOpen] = useState(false);

  if (isLoading) return <div className="flex items-center justify-center h-full">Cargando...</div>;

  const handleCreate = () => {
    if (!newPallet.palletId || !newPallet.description) return;
    createPallet.mutate({
      storeId: 1,
      palletId: newPallet.palletId,
      description: newPallet.description,
      fecha: new Date().toISOString().split("T")[0],
    });
    setNewPallet({ palletId: "", description: "" });
    setDialogOpen(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Contenedores</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Contenedor
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Crear Nuevo Contenedor</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="palletId">ID del Contenedor</Label>
                <Input
                  id="palletId"
                  placeholder="ej: P-015"
                  value={newPallet.palletId}
                  onChange={(e) => setNewPallet({ ...newPallet, palletId: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="description">Descripcion</Label>
                <Input
                  id="description"
                  placeholder="ej: Target Nueva"
                  value={newPallet.description}
                  onChange={(e) => setNewPallet({ ...newPallet, description: e.target.value })}
                />
              </div>
              <Button onClick={handleCreate} className="w-full bg-blue-600 hover:bg-blue-700">
                Crear
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {pallets?.map((pallet) => (
          <Card key={pallet.id} className="hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-100 p-3 rounded-lg">
                    <Package className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800">{pallet.palletId}</h3>
                    <p className="text-sm text-gray-500">{pallet.description}</p>
                    {pallet.fecha && (
                      <p className="text-xs text-gray-400">{pallet.fecha}</p>
                    )}
                  </div>
                </div>
                <Link to={`/pallets/${pallet.id}/products`}>
                  <Button variant="outline" size="sm">
                    <Eye className="w-4 h-4 mr-1" />
                    Ver
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
