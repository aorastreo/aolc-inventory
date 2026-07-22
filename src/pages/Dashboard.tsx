import { trpc } from "@/providers/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Package, ShoppingCart, Receipt, ClipboardList, DollarSign, TrendingUp, Store, MapPin } from "lucide-react";

export default function DashboardPage() {
  const { data: stats, isLoading } = trpc.inventory.dashboardStats.useQuery({ storeId: 1 });

  const formatCurrency = (value: number) => {
    return value.toLocaleString("es-CR", { style: "currency", currency: "CRC", minimumFractionDigits: 0 });
  };

  const statCards = [
    {
      title: "Contenedores",
      value: stats?.totalPallets || 0,
      icon: Package,
      gradient: "from-[#B22234] to-[#8B1A2B]",
      bgLight: "bg-red-50",
      textColor: "text-[#B22234]",
    },
    {
      title: "Articulos",
      value: stats?.totalProducts || 0,
      icon: ShoppingCart,
      gradient: "from-[#1B3A5C] to-[#0F2340]",
      bgLight: "bg-blue-50",
      textColor: "text-[#1B3A5C]",
    },
    {
      title: "Unidades",
      value: stats?.totalUnits || 0,
      icon: ClipboardList,
      gradient: "from-[#2D6A4F] to-[#1B4332]",
      bgLight: "bg-green-50",
      textColor: "text-[#2D6A4F]",
    },
    {
      title: "Cierres",
      value: stats?.totalClosings || 0,
      icon: Receipt,
      gradient: "from-[#E8913A] to-[#C47A2F]",
      bgLight: "bg-orange-50",
      textColor: "text-[#C47A2F]",
    },
    {
      title: "Ajustes",
      value: stats?.totalAdjustments || 0,
      icon: ClipboardList,
      gradient: "from-[#7C3AED] to-[#5B21B6]",
      bgLight: "bg-purple-50",
      textColor: "text-[#7C3AED]",
    },
    {
      title: "Total Ventas",
      value: formatCurrency(stats?.totalCierreValue || 0),
      icon: DollarSign,
      gradient: "from-[#0891B2] to-[#0E7490]",
      bgLight: "bg-cyan-50",
      textColor: "text-[#0891B2]",
      isCurrency: true,
    },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: "#B22234" }} />
      </div>
    );
  }

  return (
    <div>
      {/* Page Title */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: "hsl(207 55% 15%)" }}>
          Dashboard
        </h1>
        <p className="text-sm mt-1" style={{ color: "hsl(207 20% 45%)" }}>
          Resumen general del sistema
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title} className="border-0 shadow-sm overflow-hidden">
              <CardContent className="p-0">
                <div className={`bg-gradient-to-br ${card.gradient} p-4 text-white`}>
                  <Icon className="w-5 h-5 mb-3 opacity-80" />
                  <p className="text-xs font-medium opacity-80 mb-1">{card.title}</p>
                  <p className="text-xl font-bold tracking-tight">{card.value}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info Card */}
        <Card className="lg:col-span-2 border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "linear-gradient(135deg, #B22234 0%, #8B1A2B 100%)" }}
              >
                <Store className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold" style={{ color: "hsl(207 55% 15%)" }}>
                  American Outlet Los Chiles
                </h3>
                <div className="flex items-center gap-1.5 mt-1">
                  <MapPin className="w-3.5 h-3.5" style={{ color: "hsl(207 20% 45%)" }} />
                  <p className="text-sm" style={{ color: "hsl(207 20% 45%)" }}>
                    Costado norte del parque municipal
                  </p>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-xs font-medium text-green-600">Tienda activa</span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold" style={{ color: "#B22234" }}>
                  {stats?.totalPallets || 0}
                </p>
                <p className="text-xs" style={{ color: "hsl(207 20% 45%)" }}>contenedores</p>
              </div>
            </div>

            {/* Divider */}
            <div className="my-5 border-t" style={{ borderColor: "hsl(210 20% 90%)" }} />

            {/* Quick stats row */}
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 rounded-lg" style={{ background: "hsl(0 0% 97%)" }}>
                <p className="text-lg font-bold" style={{ color: "#1B3A5C" }}>{stats?.totalProducts || 0}</p>
                <p className="text-xs" style={{ color: "hsl(207 20% 45%)" }}>articulos</p>
              </div>
              <div className="text-center p-3 rounded-lg" style={{ background: "hsl(0 0% 97%)" }}>
                <p className="text-lg font-bold" style={{ color: "#2D6A4F" }}>{stats?.totalUnits || 0}</p>
                <p className="text-xs" style={{ color: "hsl(207 20% 45%)" }}>unidades</p>
              </div>
              <div className="text-center p-3 rounded-lg" style={{ background: "hsl(0 0% 97%)" }}>
                <p className="text-lg font-bold" style={{ color: "#C47A2F" }}>{stats?.totalClosings || 0}</p>
                <p className="text-xs" style={{ color: "hsl(207 20% 45%)" }}>cierres</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Store Status Card */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <h3 className="text-sm font-semibold mb-4" style={{ color: "hsl(207 55% 15%)" }}>
              Estado de Tiendas
            </h3>
            <div className="space-y-3">
              {/* Active store */}
              <div
                className="flex items-center gap-3 p-3 rounded-lg border"
                style={{
                  background: "linear-gradient(135deg, rgba(178,34,52,0.05) 0%, rgba(27,58,92,0.05) 100%)",
                  borderColor: "rgba(178,34,52,0.15)",
                }}
              >
                <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: "hsl(207 55% 15%)" }}>
                    Los Chiles
                  </p>
                  <p className="text-[10px]" style={{ color: "hsl(207 20% 55%)" }}>En operacion</p>
                </div>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 flex-shrink-0">
                  Activa
                </span>
              </div>

              {/* Coming soon stores */}
              {["Pavon", "Santa Rosa"].map((name) => (
                <div
                  key={name}
                  className="flex items-center gap-3 p-3 rounded-lg border opacity-60"
                  style={{
                    background: "hsl(0 0% 98%)",
                    borderColor: "hsl(210 20% 90%)",
                  }}
                >
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "hsl(210 20% 80%)" }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: "hsl(207 55% 15%)" }}>
                      {name}
                    </p>
                    <p className="text-[10px]" style={{ color: "hsl(207 20% 55%)" }}>Por inaugurar</p>
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: "hsl(210 20% 93%)", color: "hsl(207 20% 55%)" }}>
                    Pronto
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
