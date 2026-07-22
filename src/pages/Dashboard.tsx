import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, ShoppingCart, Receipt, ClipboardList, TrendingUp, DollarSign, Users } from "lucide-react";

export default function DashboardPage() {
  const { data: stats, isLoading } = trpc.inventory.dashboardStats.useQuery({ storeId: 1 });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const formatCurrency = (value: number) => {
    return value.toLocaleString("es-CR", { style: "currency", currency: "CRC", minimumFractionDigits: 0 });
  };

  const cards = [
    { title: "Contenedores", value: stats?.totalPallets || 0, icon: Package, color: "bg-blue-500" },
    { title: "Articulos", value: stats?.totalProducts || 0, icon: ShoppingCart, color: "bg-green-500" },
    { title: "Unidades", value: stats?.totalUnits || 0, icon: ClipboardList, color: "bg-purple-500" },
    { title: "Cierres", value: stats?.totalClosings || 0, icon: Receipt, color: "bg-orange-500" },
    { title: "Ajustes", value: stats?.totalAdjustments || 0, icon: ClipboardList, color: "bg-pink-500" },
    { title: "Total Cierres", value: formatCurrency(stats?.totalCierreValue || 0), icon: DollarSign, color: "bg-emerald-500" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title} className="hover:shadow-lg transition-shadow">
              <CardContent className="p-4">
                <div className="flex flex-col items-center text-center">
                  <div className={`${card.color} p-2 rounded-lg mb-2`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <p className="text-xs text-gray-500 mb-1">{card.title}</p>
                  <p className="text-lg font-bold text-gray-800">{card.value}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-500" />
              Resumen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600">Sistema de inventario activo para <strong>American Outlet Los Chiles</strong>.</p>
            <p className="text-sm text-gray-400 mt-2">Todos los datos estan sincronizados en tiempo real.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-green-500" />
              Tiendas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center gap-2 p-2 bg-green-50 rounded-lg">
                <div className="w-2 h-2 bg-green-500 rounded-full" />
                <span className="font-medium">American Outlet Los Chiles</span>
                <span className="text-xs bg-green-200 text-green-700 px-2 py-0.5 rounded-full ml-auto">Activa</span>
              </div>
              <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg opacity-50">
                <div className="w-2 h-2 bg-gray-300 rounded-full" />
                <span>American Outlet Pavon</span>
                <span className="text-xs bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full ml-auto">Proximamente</span>
              </div>
              <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg opacity-50">
                <div className="w-2 h-2 bg-gray-300 rounded-full" />
                <span>American Outlet Santa Rosa</span>
                <span className="text-xs bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full ml-auto">Proximamente</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
