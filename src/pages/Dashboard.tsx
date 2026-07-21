import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, ShoppingCart, Receipt, ClipboardList } from "lucide-react";

export default function DashboardPage() {
  const { data: stats, isLoading } = trpc.inventory.dashboardStats.useQuery({ storeId: 1 });

  if (isLoading) {
    return <div className="flex items-center justify-center h-full">Cargando...</div>;
  }

  const cards = [
    { title: "Contenedores", value: stats?.totalPallets || 0, icon: Package, color: "bg-blue-500" },
    { title: "Articulos", value: stats?.totalProducts || 0, icon: ShoppingCart, color: "bg-green-500" },
    { title: "Unidades", value: stats?.totalUnits || 0, icon: ClipboardList, color: "bg-purple-500" },
    { title: "Cierres", value: stats?.totalClosings || 0, icon: Receipt, color: "bg-orange-500" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 mb-1">{card.title}</p>
                    <p className="text-3xl font-bold text-gray-800">{card.value}</p>
                  </div>
                  <div className={`${card.color} p-3 rounded-lg`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Actividad Reciente</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-500">Sistema de inventario activo</p>
            <p className="text-sm text-gray-400 mt-2">Datos sincronizados con la base de datos central</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tiendas Conectadas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full" />
                <span>American Outlet Los Chiles</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-gray-300 rounded-full" />
                <span className="text-gray-400">American Outlet Pavon (proximamente)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-gray-300 rounded-full" />
                <span className="text-gray-400">American Outlet Santa Rosa (proximamente)</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
