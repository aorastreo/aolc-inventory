import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Link } from "react-router";
import { Plus, Eye, ArrowUpDown, Container } from "lucide-react";
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

const BRAND_RED = "#B22234";
const BRAND_BLUE = "#1B3A5C";

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
      case "palletId": comparison = a.palletId.localeCompare(b.palletId); break;
      case "fecha": comparison = (a.fecha || "").localeCompare(b.fecha || ""); break;
      case "description": comparison = a.description.localeCompare(b.description); break;
      case "costo": comparison = Number(a.costo || 0) - Number(b.costo || 0); break;
      case "articulos": comparison = a.articulos - b.articulos; break;
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

  if (isLoading) return (
    <div className="flex items-center justify-center h-full">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: BRAND_RED }} />
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "hsl(207 55% 15%)" }}>Contenedores</h1>
          <p className="text-sm mt-0.5" style={{ color: "hsl(207 20% 45%)" }}>Gestiona los contenedores de mercancia</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="font-medium transition-all duration-200 hover:shadow-lg hover:opacity-90" style={{ background: BRAND_RED }}>
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Contenedor
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Container className="w-5 h-5" style={{ color: BRAND_RED }} />
                Crear Nuevo Contenedor
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <Label htmlFor="palletId">ID del Contenedor</Label>
                <Input id="palletId" placeholder="ej: P-015" value={newPallet.palletId} onChange={(e) => setNewPallet({ ...newPallet, palletId: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="description">Descripcion</Label>
                <Input id="description" placeholder="ej: Target Nueva" value={newPallet.description} onChange={(e) => setNewPallet({ ...newPallet, description: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="costo">Costo del Contenedor (₡)</Label>
                <Input id="costo" type="number" placeholder="ej: 1500000" value={newPallet.costo} onChange={(e) => setNewPallet({ ...newPallet, costo: e.target.value })} />
              </div>
              <Button onClick={handleCreate} className="w-full font-medium transition-all duration-200 hover:shadow-lg hover:opacity-90" style={{ background: BRAND_RED }}>
                Crear Contenedor
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
              {[
                { key: "palletId" as SortField, label: "ID", align: "left" },
                { key: "fecha" as SortField, label: "Fecha", align: "left" },
                { key: "description" as SortField, label: "Descripcion", align: "left" },
                { key: "costo" as SortField, label: "Costo", align: "right" },
                { key: "articulos" as SortField, label: "Articulos", align: "center" },
              ].map((col) => (
                <TableHead key={col.key} style={{ color: BRAND_BLUE }} className={col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"}>
                  <button onClick={() => handleSort(col.key)} className="flex items-center gap-1.5 font-semibold text-xs uppercase tracking-wider hover:opacity-70 transition-opacity" style={{ justifyContent: col.align === "right" ? "flex-end" : col.align === "center" ? "center" : "flex-start", marginLeft: col.align === "right" ? "auto" : col.align === "center" ? "auto" : undefined, marginRight: col.align === "center" ? "auto" : undefined }}>
                    {col.label} <ArrowUpDown className="w-3 h-3" />
                  </button>
                </TableHead>
              ))}
              <TableHead className="text-right font-semibold text-xs uppercase tracking-wider" style={{ color: BRAND_BLUE }}>Ventas</TableHead>
              <TableHead className="text-right font-semibold text-xs uppercase tracking-wider" style={{ color: BRAND_BLUE }}>Ganancia</TableHead>
              <TableHead className="text-center font-semibold text-xs uppercase tracking-wider" style={{ color: BRAND_BLUE }}>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedPallets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12" style={{ color: "hsl(207 20% 55%)" }}>
                  <Container className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No hay contenedores registrados</p>
                  <p className="text-xs mt-1 opacity-60">Crea uno nuevo para comenzar</p>
                </TableCell>
              </TableRow>
            ) : (
              sortedPallets.map((pallet) => (
                <TableRow key={pallet.id} className="hover:bg-gray-50/50 transition-colors border-b" style={{ borderColor: "hsl(210 20% 94%)" }}>
                  <TableCell className="font-semibold text-sm" style={{ color: BRAND_BLUE }}>{pallet.palletId}</TableCell>
                  <TableCell className="text-sm" style={{ color: "hsl(207 20% 45%)" }}>{pallet.fecha || "-"}</TableCell>
                  <TableCell className="text-sm font-medium" style={{ color: "hsl(207 55% 15%)" }}>{pallet.description}</TableCell>
                  <TableCell className="text-right text-sm font-semibold" style={{ color: "hsl(207 55% 15%)" }}>
                    {pallet.costo ? `₡${Number(pallet.costo).toLocaleString("es-CR")}` : "-"}
                  </TableCell>
                  <TableCell className="text-center">
                    <span
                      className="inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-bold min-w-[2.5rem]"
                      style={{ background: "rgba(178,34,52,0.1)", color: BRAND_RED }}
                    >
                      {pallet.articulos}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-sm" style={{ color: "hsl(207 20% 55%)" }}>-</TableCell>
                  <TableCell className="text-right text-sm" style={{ color: "hsl(207 20% 55%)" }}>-</TableCell>
                  <TableCell className="text-center">
                    <Link to={`/pallets/${pallet.id}/products`}>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs font-medium transition-all duration-200 hover:shadow-md"
                        style={{ borderColor: "hsl(210 20% 88%)", color: BRAND_BLUE }}
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" />
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
