import { trpc } from "@/providers/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { ClipboardList, CheckCircle, Clock, XCircle } from "lucide-react";

export default function AdjustmentsPage() {
  const { data: adjustments, isLoading } = trpc.inventory.adjustments.useQuery({ storeId: 1 });

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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Ajustes</h1>
      </div>

      <div className="space-y-4">
        {adjustments?.map((adj) => (
          <Card key={adj.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="bg-purple-100 p-3 rounded-lg">
                    <ClipboardList className="w-6 h-6 text-purple-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-800">{adj.adjustmentId}</h3>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(adj.estado)}`}>
                        {adj.estado}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">{adj.description}</p>
                    <p className="text-xs text-gray-400">{adj.fecha}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusIcon(adj.estado)}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
