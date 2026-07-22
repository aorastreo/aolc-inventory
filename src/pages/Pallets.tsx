import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Link } from "react-router";
import { Plus, Eye, ArrowUpDown } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type SortField = "palletId" | "fecha" | "description" | "costo" | "articulos";
type SortDirection = "asc" | "desc";

export default function PalletsPage() {
  const { data: pallets, isLoading } = trpc.inventory.palletsWithStats.useQuery({ storeId: 1 });
  const utils = trpc.useUtils();
  const createPallet = trpc.inventory.createPallet.useMutation({
    onSuccess: () => {
      utils.inventory.palletsWithStats.invalidate();
      utils.inventory.pallets.invalidate();
    },
  });

  const [newPallet, setNewPallet] = useState({ palletId: "", description: "", costo: "" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sortField, setSortField] = useState<SortField>("palletId");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const sortedPallets = [...(pallets || [])].sort((a, b) => {
    let comparison = 0;
    switch (sortField) {
      case "palletId":
        comparison = a.palletId.localeCompare(b.palletId);
        break;
      case "fecha":
        comparison = (a.fecha || "").localeCompare(b.fecha || "");
        break;
      case "description":
        comparison = a.description.localeCompare(b.description);
        break;
      case "costo":
        comparison = Number(a.costo || 0) - Number(b.costo || 0);
        break;
      case "articulos":
        comparison = a.articulos - b.articulos;
        break;
    }
    return sortDirection === "asc" ? comparison : -comparison;
  });

  const handleCreate = () => {
    if (!newPallet.palletId || !newPallet.description) return;
    createPallet.mutate({
      storeId: 1,
      palletId: newPallet.palletId,
      description: newPallet.description,
      costo: newPallet.costo || "0",
      fecha: new Date().toISOString().split("T")[0],
    });
    setNewPallet({ palletId: "", description: "", costo: "" });
    setDialogOpen(false);
  };

  if (isLoading) return <div className="flex items-center justify-center h-full">Cargando...</div>;

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
              <div>
                <Label htmlFor="costo">Costo del Contenedor</Label>
                <Input
                  id="costo"
                  placeholder="ej: 1500000"
                  value={newPallet.costo}
                  onChange={(e) => setNewPallet({ ...newPallet, costo: e.target.value })}
                />
              </div>
              <Button onClick={handleCreate} className="w-full bg-blue-600 hover:bg-blue-700">
                Crear
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border rounded-lg bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="font-semibold text-gray-700">
                <button onClick={() => handleSort("palletId")} className="flex items-center gap-1 hover:text-blue-600">
                  ID <ArrowUpDown className="w-3 h-3" />
                </button>
              </TableHead>
              <TableHead className="font-semibold text-gray-700">
                <button onClick={() => handleSort("fecha")} className="flex items-center gap-1 hover:text-blue-600">
                  Fecha <ArrowUpDown className="w-3 h-3" />
                </button>
              </TableHead>
              <TableHead className="font-semibold text-gray-700">
                <button onClick={() => handleSort("description")} className="flex items-center gap-1 hover:text-blue-600">
                  Descripcion <ArrowUpDown className="w-3 h-3" />
                </button>
              </TableHead>
              <TableHead className="font-semibold text-gray-700 text-right">
                <button onClick={() => handleSort("costo")} className="flex items-center gap-1 hover:text-blue-600 ml-auto">
                  Costo <ArrowUpDown className="w-3 h-3" />
                </button>
              </TableHead>
              <TableHead className="font-semibold text-gray-700 text-center">
                <button onClick={() => handleSort("articulos")} className="flex items-center gap-1 hover:text-blue-600 mx-auto">
                  Articulos <ArrowUpDown className="w-3 h-3" />
                </button>
              </TableHead>
              <TableHead className="font-semibold text-gray-700 text-right">Ventas</TableHead>
              <TableHead className="font-semibold text-gray-700 text-right">Ganancia</TableHead>
              <TableHead className="font-semibold text-gray-700 text-center">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedPallets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-gray-500 py-8">
                  No hay contenedores registrados
                </TableCell>
              </TableRow>
            ) : (
              sortedPallets.map((pallet) => (
                <TableRow key={pallet.id} className="hover:bg-gray-50">
                  <TableCell className="font-medium text-gray-900">{pallet.palletId}</TableCell>
                  <TableCell className="text-gray-600">{pallet.fecha || "-"}</TableCell>
                  <TableCell className="text-gray-600">{pallet.description}</TableCell>
                  <TableCell className="text-gray-900 text-right font-medium">
                    {pallet.costo ? `₡${Number(pallet.costo).toLocaleString("es-CR")}` : "-"}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="inline-flex items-center justify-center bg-blue-100 text-blue-700 rounded-full px-3 py-1 text-sm font-medium min-w-[2.5rem]">
                      {pallet.articulos}
                    </span>
                  </TableCell>
                  <TableCell className="text-gray-400 text-right">-</TableCell>
                  <TableCell className="text-gray-400 text-right">-</TableCell>
                  <TableCell className="text-center">
                    <Link to={`/pallets/${pallet.id}/products`}>
                      <Button variant="outline" size="sm" className="hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200">
                        <Eye className="w-4 h-4 mr-1" />
                        Ver
                      </Button>
                    </Link>
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
