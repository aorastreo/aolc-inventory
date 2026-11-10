import { trpc } from "@/providers/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";

const BRAND_BLUE = "#1B3A5C";

const fmt = (n: number) =>
  n.toLocaleString("es-CR", { style: "currency", currency: "CRC", maximumFractionDigits: 0 });

export default function MarginGauge({
  storeId,
  palletId,
}: {
  storeId: number;
  palletId: number;
}) {
  const { data, isLoading } = trpc.inventory.palletMarginProgress.useQuery(
    { storeId, palletId, includeActiveAdjustments: true },
    { enabled: !!storeId && !!palletId, refetchInterval: 8000 },
  );

  if (isLoading || !data) {
    return (
      <Card className="border shadow-sm mb-5">
        <CardContent className="p-4 text-sm" style={{ color: "hsl(207 20% 55%)" }}>
          Calculando margen del contenedor...
        </CardContent>
      </Card>
    );
  }

  const colors = {
    verde: { bg: "rgba(22,163,74,0.12)", bar: "#16A34A", text: "#15803D" },
    amarillo: { bg: "rgba(217,119,6,0.12)", bar: "#D97706", text: "#B45309" },
    rojo: { bg: "rgba(178,34,52,0.12)", bar: "#B22234", text: "#B22234" },
    sin_costo: { bg: "hsl(0 0% 96%)", bar: "#9CA3AF", text: "hsl(207 20% 45%)" },
  }[data.status];

  const denom = Math.max(data.ventasMeta50, data.ventasProyectadas, 1);
  const pctBar = Math.min(100, (data.ventasProyectadas / denom) * 100);
  const pisoMark = data.ventasMeta50 > 0 ? (data.ventasPiso40 / data.ventasMeta50) * 100 : 40;

  return (
    <Card className="border shadow-sm mb-5 overflow-hidden">
      <CardContent className="p-0">
        <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-2" style={{ background: colors.bg }}>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4" style={{ color: colors.text }} />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: BRAND_BLUE }}>
                Margen del contenedor (piso 40% · meta 50%)
              </p>
              <p className="text-sm font-bold" style={{ color: colors.text }}>{data.statusLabel}</p>
            </div>
          </div>
          <div className="text-right text-xs" style={{ color: "hsl(207 20% 45%)" }}>
            <div>Costo: <strong style={{ color: BRAND_BLUE }}>{fmt(data.palletCosto)}</strong></div>
            <div>
              Ventas proy.: <strong style={{ color: BRAND_BLUE }}>{fmt(data.ventasProyectadas)}</strong>
              {data.ventasEnAjuste > 0 ? ` (ajuste +${fmt(data.ventasEnAjuste)})` : ""}
            </div>
          </div>
        </div>
        <div className="px-4 py-3 space-y-2">
          <div className="relative h-3 rounded-full bg-gray-100 overflow-hidden">
            <div className="absolute top-0 bottom-0 w-0.5 z-10 bg-amber-500" style={{ left: `${pisoMark}%` }} title="Piso 40%" />
            <div className="h-full rounded-full transition-all" style={{ width: `${pctBar}%`, background: colors.bar }} />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "hsl(207 20% 45%)" }}>
            <span>Margen: <strong>{data.margenPct != null ? `${data.margenPct.toFixed(1)}%` : "—"}</strong></span>
            <span>Ganancia proy.: <strong>{fmt(data.gananciaProyectada)}</strong></span>
            {data.faltaParaPiso > 0 && <span>Falta para piso 40%: <strong>{fmt(data.faltaParaPiso)}</strong></span>}
            {data.faltaParaMeta > 0 && <span>Falta para meta 50%: <strong>{fmt(data.faltaParaMeta)}</strong></span>}
            {data.faltaParaMeta <= 0 && data.palletCosto > 0 && <span className="font-semibold" style={{ color: "#16A34A" }}>Meta alcanzada</span>}
          </div>
          {data.cajasAprox != null && data.cajasAprox > 0 && (
            <div
              className="flex flex-wrap gap-x-4 gap-y-1 text-xs pt-1 border-t"
              style={{ color: "hsl(207 20% 45%)", borderColor: "hsl(210 20% 92%)" }}
            >
              <span>~<strong>{data.cajasAprox}</strong> cajas</span>
              {data.promedioPisoPorCaja != null && (
                <span>Promedio piso/caja: <strong>{fmt(data.promedioPisoPorCaja)}</strong></span>
              )}
              {data.promedioMetaPorCaja != null && (
                <span>Promedio meta/caja: <strong>{fmt(data.promedioMetaPorCaja)}</strong></span>
              )}
              {data.promedioActualPorCaja != null && (
                <span>Actual/caja: <strong>{fmt(data.promedioActualPorCaja)}</strong></span>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
