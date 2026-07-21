import { trpc } from "@/providers/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Receipt, TrendingUp } from "lucide-react";

export default function ClosingsPage() {
  const { data: closings, isLoading } = trpc.inventory.closings.useQuery({ storeId: 1 });

  if (isLoading) return <div className="flex items-center justify-center h-full">Cargando...</div>;

  const formatCurrency = (value: string | null) => {
    return Number(value || 0).toLocaleString("es-CR", { style: "currency", currency: "CRC" });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Cierres de Caja</h1>
      </div>

      <div className="space-y-3">
        {closings?.map((closing) => (
          <Card key={closing.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="bg-orange-100 p-3 rounded-lg">
                    <Receipt className="w-5 h-5 text-orange-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800">{closing.fecha}</h3>
                    <p className="text-sm text-gray-500">{closing.dia}</p>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Efectivo</p>
                    <p className="text-sm font-medium">{formatCurrency(closing.efectivo)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">SINPE</p>
                    <p className="text-sm font-medium">{formatCurrency(closing.sinpe)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Tarjeta</p>
                    <p className="text-sm font-medium">{formatCurrency(closing.tarjeta)}</p>
                  </div>
                  <div className="text-right bg-green-50 px-4 py-2 rounded-lg">
                    <p className="text-xs text-green-600">Total</p>
                    <p className="text-lg font-bold text-green-700">{formatCurrency(closing.total)}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {closings && closings.length > 0 && (
        <Card className="mt-6 bg-blue-50 border-blue-200">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <TrendingUp className="w-6 h-6 text-blue-600" />
                <div>
                  <p className="text-sm text-blue-600 font-medium">Total acumulado</p>
                  <p className="text-xs text-blue-400">{closings.length} cierres registrados</p>
                </div>
              </div>
              <p className="text-2xl font-bold text-blue-700">
                {formatCurrency(String(closings.reduce((sum, c) => sum + Number(c.total), 0)))}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
