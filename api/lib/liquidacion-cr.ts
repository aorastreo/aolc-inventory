/**
 * Liquidación laboral Costa Rica — estimación según Código de Trabajo
 * Arts. 28–30 (preaviso / cesantía), aguinaldo y vacaciones proporcionales.
 * Orientativo; no sustituye criterio MTSS ni asesoría laboral.
 */

export type TipoSalida = "renuncia" | "despido_con_responsabilidad" | "despido_sin_responsabilidad";
export type TipoSalario = "semanal" | "quincenal" | "mensual";

/** Días de cesantía por año según Art. 29 (factor por unidad indemnizable). */
const CESANTIA_FACTOR: Record<number, number> = {
  1: 19.5,
  2: 20,
  3: 20.5,
  4: 21,
  5: 21.24,
  6: 21.5,
  7: 22,
  8: 22,
  9: 22,
  10: 21.5,
  11: 21,
  12: 20.5,
};

function factorCesantia(anosCompletos: number): number {
  if (anosCompletos <= 0) return 0;
  if (anosCompletos >= 13) return 20;
  return CESANTIA_FACTOR[anosCompletos] ?? 20;
}

export function parseDate(yyyyMmDd: string): Date {
  return new Date(`${yyyyMmDd}T12:00:00`);
}

export function daysBetweenInclusive(inicio: string, fin: string): number {
  const a = parseDate(inicio).getTime();
  const b = parseDate(fin).getTime();
  if (b < a) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

/** Antigüedad en años completos + meses de fracción + días totales. */
export function antigüedad(fechaIngreso: string, fechaSalida: string) {
  const start = parseDate(fechaIngreso);
  const end = parseDate(fechaSalida);
  if (end < start) {
    return { anosCompletos: 0, mesesFraccion: 0, diasTotales: 0, mesesTotalesApprox: 0 };
  }

  let anos = end.getFullYear() - start.getFullYear();
  let meses = end.getMonth() - start.getMonth();
  let dias = end.getDate() - start.getDate();

  if (dias < 0) {
    meses -= 1;
    const prevMonth = new Date(end.getFullYear(), end.getMonth(), 0).getDate();
    dias += prevMonth;
  }
  if (meses < 0) {
    anos -= 1;
    meses += 12;
  }

  const diasTotales = daysBetweenInclusive(fechaIngreso, fechaSalida);
  // Fracción real de meses (días/30) para umbrales de 3 y 6 meses Art. 28–29
  const mesesTotalesApprox = anos * 12 + meses + Math.max(0, dias) / 30;

  return {
    anosCompletos: Math.max(0, anos),
    mesesFraccion: Math.max(0, meses),
    diasExtrasFraccion: Math.max(0, dias),
    diasTotales,
    mesesTotalesApprox,
  };
}

/**
 * Divisor diario del promedio mensual (Art. 30 / práctica MTSS).
 * Comercio (tiendas AO): siempre ÷ 30.
 * Semanal no-comercio usaría ÷ 26; aquí el negocio es comercio → 30.
 */
export function salarioDiario(promedioMensual: number, _tipoSalario: TipoSalario): number {
  return promedioMensual / 30;
}

/**
 * Si no hay promedio de pagos, no usar salarioBase crudo:
 * quincenal es ½ mes; semanal es ~1/4.33 mes.
 */
export function salarioBaseAMensual(salarioBase: number, tipoSalario: TipoSalario): number {
  const base = Number(salarioBase) || 0;
  if (tipoSalario === "quincenal") return base * 2;
  if (tipoSalario === "semanal") return (base * 52) / 12;
  return base;
}

export function diasPreaviso(anosCompletos: number, _mesesFraccion: number, mesesTotalesApprox: number): number {
  // Art. 28: <3 m = 0; de 3 a 6 m = 7; >6 m y <1 año = 15; ≥1 año = 30
  if (mesesTotalesApprox < 3) return 0;
  if (anosCompletos === 0 && mesesTotalesApprox <= 6) return 7;
  if (anosCompletos === 0) return 15;
  return 30;
}

/**
 * Días de cesantía Art. 29.
 * <1 año: 7 o 14 días. ≥1 año: factor × unidades (tope 8 años indemnizables).
 * Fracción > 6 meses añade una unidad; el factor sale de los años completos.
 */
export function diasCesantia(anosCompletos: number, mesesFraccion: number, mesesTotalesApprox: number): {
  dias: number;
  unidades: number;
  factor: number;
  nota?: string;
} {
  // Art. 29: >3 a 6 m = 7 días; >6 m y <1 año = 14 días
  if (mesesTotalesApprox < 3) return { dias: 0, unidades: 0, factor: 0 };
  if (anosCompletos === 0) {
    if (mesesTotalesApprox <= 6) return { dias: 7, unidades: 0, factor: 0 };
    return { dias: 14, unidades: 0, factor: 0 };
  }

  const fraccionSuperior6 = mesesFraccion > 6;
  let unidades = anosCompletos + (fraccionSuperior6 ? 1 : 0);
  unidades = Math.min(8, unidades);
  const factor = factorCesantia(anosCompletos);
  const dias = Math.round(factor * unidades * 100) / 100;

  let nota: string | undefined;
  // Zona con criterios divergentes MTSS vs Sala Segunda
  if (anosCompletos === 1 && fraccionSuperior6) {
    nota = "Antigüedad entre 1 año 6 meses y 2 años: hay criterios distintos (19,5×2 vs 20×2). Se usa factor de años completos (19,5). Confirmá con MTSS si hace falta.";
  }

  return { dias, unidades, factor, nota };
}

/** Vacaciones proporcionales: ~14 días por cada 50 semanas (350 días). */
export function diasVacacionesProporcionales(diasTotales: number): number {
  if (diasTotales <= 0) return 0;
  const raw = (diasTotales / (50 * 7)) * 14;
  return Math.round(raw * 100) / 100;
}

/** Meses del período de aguinaldo (1 dic año anterior → fecha salida), tope 12. */
export function mesesAguinaldo(fechaSalida: string, fechaIngreso: string): number {
  const salida = parseDate(fechaSalida);
  const ingreso = parseDate(fechaIngreso);
  const year = salida.getFullYear();
  // Período legal: 1 dic año anterior — 30 nov año salida; en liquidación hasta fecha salida
  let inicioPeriodo = new Date(year - 1, 11, 1); // 1 dic año anterior
  if (salida.getMonth() === 11 && salida.getDate() >= 1) {
    // Si sale en diciembre, el período nuevo ya empezó el 1 dic de este año
    inicioPeriodo = new Date(year, 11, 1);
  }
  const start = ingreso > inicioPeriodo ? ingreso : inicioPeriodo;
  if (salida < start) return 0;

  let months = (salida.getFullYear() - start.getFullYear()) * 12 + (salida.getMonth() - start.getMonth());
  // Contar mes de salida si trabajó al menos 1 día
  months += 1;
  return Math.min(12, Math.max(0, months));
}

export type LiquidacionInput = {
  tipoSalida: TipoSalida;
  fechaIngreso: string;
  fechaSalida: string;
  /** Promedio mensual últimos 6 meses (o fracción). */
  promedioMensual: number;
  tipoSalario: TipoSalario;
  /** Si el patrono paga preaviso en dinero (despido con resp. sin trabajar aviso). */
  pagaPreaviso: boolean;
  /** Días de vacaciones a pagar (si null, se estima proporcional). */
  diasVacaciones?: number | null;
  /** Suma de salarios del período de aguinaldo; si null, promedio × meses período. */
  sumaSalariosAguinaldo?: number | null;
  salariosPendientes?: number;
};

export type LiquidacionResult = {
  antigüedadLabel: string;
  anosCompletos: number;
  mesesFraccion: number;
  diasTotales: number;
  salarioDiario: number;
  promedioMensual: number;
  preavisoDias: number;
  preavisoMonto: number;
  cesantiaDias: number;
  cesantiaUnidades: number;
  cesantiaFactor: number;
  cesantiaMonto: number;
  vacacionesDias: number;
  vacacionesMonto: number;
  aguinaldoMeses: number;
  aguinaldoMonto: number;
  salariosPendientes: number;
  total: number;
  rubros: { id: string; label: string; monto: number; detalle: string }[];
  advertencias: string[];
  incluyePreaviso: boolean;
  incluyeCesantia: boolean;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function calcularLiquidacion(input: LiquidacionInput): LiquidacionResult {
  const avg = Number(input.promedioMensual) || 0;
  const ant = antigüedad(input.fechaIngreso, input.fechaSalida);
  const diario = salarioDiario(avg, input.tipoSalario);
  const advertencias: string[] = [];

  if (parseDate(input.fechaSalida) < parseDate(input.fechaIngreso)) {
    advertencias.push("La fecha de salida es anterior al ingreso.");
  }

  const preDias = diasPreaviso(ant.anosCompletos, ant.mesesFraccion, ant.mesesTotalesApprox);
  const ces = diasCesantia(ant.anosCompletos, ant.mesesFraccion, ant.mesesTotalesApprox);
  if (ces.nota) advertencias.push(ces.nota);

  const incluyePreaviso = input.tipoSalida === "despido_con_responsabilidad" && input.pagaPreaviso;
  const incluyeCesantia = input.tipoSalida === "despido_con_responsabilidad";

  const preavisoMonto = incluyePreaviso ? round2(diario * preDias) : 0;
  const cesantiaMonto = incluyeCesantia ? round2(diario * ces.dias) : 0;

  const vacDias =
    input.diasVacaciones != null && Number.isFinite(Number(input.diasVacaciones))
      ? Number(input.diasVacaciones)
      : diasVacacionesProporcionales(ant.diasTotales);
  const vacacionesMonto = round2(diario * vacDias);

  const mesesAgui = mesesAguinaldo(input.fechaSalida, input.fechaIngreso);
  const sumaAgui =
    input.sumaSalariosAguinaldo != null && Number.isFinite(Number(input.sumaSalariosAguinaldo))
      ? Number(input.sumaSalariosAguinaldo)
      : avg * mesesAgui;
  const aguinaldoMonto = round2(sumaAgui / 12);

  const salariosPendientes = round2(Number(input.salariosPendientes || 0));

  if (input.tipoSalida === "renuncia") {
    advertencias.push("Renuncia: no incluye cesantía ni preaviso a cargo del patrono. Vacaciones y aguinaldo sí corresponden.");
  }
  if (input.tipoSalida === "despido_sin_responsabilidad") {
    advertencias.push("Despido sin responsabilidad (falta grave): no incluye preaviso ni cesantía.");
  }
  if (input.tipoSalida === "despido_con_responsabilidad" && !input.pagaPreaviso && preDias > 0) {
    advertencias.push(
      `Preaviso no incluido en dinero (${preDias} día(s) ≈ ₡${round2(diario * preDias).toLocaleString("es-CR")}). Solo omitilo si el aviso se trabajó en tiempo.`,
    );
  }
  if (input.diasVacaciones == null) {
    advertencias.push(
      "Vacaciones estimadas proporcionales al tiempo trabajado. Si ya disfrutó días, restalos manualmente para no pagar de más.",
    );
  }

  const rubros: LiquidacionResult["rubros"] = [
    {
      id: "salarios_pendientes",
      label: "Salarios pendientes",
      monto: salariosPendientes,
      detalle: "Días u horas ya trabajadas sin pagar",
    },
    {
      id: "aguinaldo",
      label: "Aguinaldo proporcional",
      monto: aguinaldoMonto,
      detalle: `Suma período ₡${round2(sumaAgui).toLocaleString("es-CR")} ÷ 12 (${mesesAgui} mes(es) estimados)`,
    },
    {
      id: "vacaciones",
      label: "Vacaciones no disfrutadas",
      monto: vacacionesMonto,
      detalle: `${vacDias} día(s) × ₡${round2(diario).toLocaleString("es-CR")} diario`,
    },
    {
      id: "preaviso",
      label: "Preaviso",
      monto: preavisoMonto,
      detalle: incluyePreaviso
        ? `${preDias} día(s) × diario (Art. 28)`
        : preDias > 0
          ? `Corresponderían ${preDias} día(s); no se incluye en este cálculo`
          : "No aplica por antigüedad (< 3 meses)",
    },
    {
      id: "cesantia",
      label: "Auxilio de cesantía",
      monto: cesantiaMonto,
      detalle: incluyeCesantia
        ? ces.factor > 0
          ? `${ces.dias} día(s) = ${ces.factor} × ${ces.unidades} unidad(es), tope 8 años (Art. 29)`
          : `${ces.dias} día(s) (menos de 1 año)`
        : "No aplica para este tipo de salida",
    },
  ];

  const total = round2(rubros.reduce((s, r) => s + r.monto, 0));

  const diasExtra = ant.diasExtrasFraccion || 0;
  const antigüedadLabel =
    diasExtra > 0
      ? `${ant.anosCompletos} año(s), ${ant.mesesFraccion} mes(es), ${diasExtra} día(s)`
      : `${ant.anosCompletos} año(s), ${ant.mesesFraccion} mes(es)`;

  return {
    antigüedadLabel,
    anosCompletos: ant.anosCompletos,
    mesesFraccion: ant.mesesFraccion,
    diasTotales: ant.diasTotales,
    salarioDiario: round2(diario),
    promedioMensual: avg,
    preavisoDias: preDias,
    preavisoMonto,
    cesantiaDias: ces.dias,
    cesantiaUnidades: ces.unidades,
    cesantiaFactor: ces.factor,
    cesantiaMonto,
    vacacionesDias: vacDias,
    vacacionesMonto,
    aguinaldoMeses: mesesAgui,
    aguinaldoMonto,
    salariosPendientes,
    total,
    rubros,
    advertencias,
    incluyePreaviso,
    incluyeCesantia,
  };
}
