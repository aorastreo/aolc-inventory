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

/** Inicio del período de aguinaldo MTSS (1 dic → 30 nov). */
export function inicioPeriodoAguinaldo(fechaSalida: string): Date {
  const salida = parseDate(fechaSalida);
  const year = salida.getFullYear();
  // Si sale en diciembre, ya corrió el período nuevo (1 dic de este año)
  if (salida.getMonth() === 11) return new Date(year, 11, 1);
  return new Date(year - 1, 11, 1);
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Meses calendario del período de aguinaldo (informativo). */
export function mesesAguinaldo(fechaSalida: string, fechaIngreso: string): number {
  const salida = parseDate(fechaSalida);
  const ingreso = parseDate(fechaIngreso);
  const inicioPeriodo = inicioPeriodoAguinaldo(fechaSalida);
  const start = ingreso > inicioPeriodo ? ingreso : inicioPeriodo;
  if (salida < start) return 0;

  let months = (salida.getFullYear() - start.getFullYear()) * 12 + (salida.getMonth() - start.getMonth());
  months += 1;
  return Math.min(12, Math.max(0, months));
}

/**
 * Quincenas (1–15 y 16–fin de mes) que se solapan con [ingreso, salida]
 * dentro del período de aguinaldo. Ej.: 1 ago → 15 nov = 7 quincenas.
 */
export function quincenasAguinaldo(fechaSalida: string, fechaIngreso: string): number {
  const salida = parseDate(fechaSalida);
  const ingreso = parseDate(fechaIngreso);
  const inicioPeriodo = inicioPeriodoAguinaldo(fechaSalida);
  const start = ingreso > inicioPeriodo ? ingreso : inicioPeriodo;
  if (salida < start) return 0;

  let count = 0;
  let y = start.getFullYear();
  let m = start.getMonth();
  const endY = salida.getFullYear();
  const endM = salida.getMonth();

  while (y < endY || (y === endY && m <= endM)) {
    const q1Start = new Date(y, m, 1, 12);
    const q1End = new Date(y, m, 15, 12);
    const q2Start = new Date(y, m, 16, 12);
    const lastDay = new Date(y, m + 1, 0).getDate();
    const q2End = new Date(y, m, lastDay, 12);

    if (q1End >= start && q1Start <= salida) count += 1;
    if (q2End >= start && q2Start <= salida) count += 1;

    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
    if (count > 24) break;
  }
  return count;
}

/**
 * Estimación de suma de salarios del período de aguinaldo cuando no hay
 * registro de pagos: MTSS = sumar brutos del período (no meses × promedio a ciegas).
 * Quincenal: quincenas × (promedioMensual/2).
 */
export function estimarSumaAguinaldo(opts: {
  fechaIngreso: string;
  fechaSalida: string;
  promedioMensual: number;
  tipoSalario: TipoSalario;
}): { suma: number; quincenas: number; meses: number; detalle: string } {
  const meses = mesesAguinaldo(opts.fechaSalida, opts.fechaIngreso);
  const quincenas = quincenasAguinaldo(opts.fechaSalida, opts.fechaIngreso);
  const avg = Number(opts.promedioMensual) || 0;

  if (opts.tipoSalario === "quincenal") {
    const porQuincena = avg / 2;
    const suma = round2(porQuincena * quincenas);
    return {
      suma,
      quincenas,
      meses,
      detalle: `${quincenas} quincena(s) × ₡${round2(porQuincena).toLocaleString("es-CR")} (estimado)`,
    };
  }
  if (opts.tipoSalario === "semanal") {
    const porSemana = (avg * 12) / 52;
    const semanas = Math.max(0, Math.round(daysBetweenInclusive(
      ymd(ingresoAguinaldoStart(opts.fechaIngreso, opts.fechaSalida)),
      opts.fechaSalida,
    ) / 7));
    const suma = round2(porSemana * semanas);
    return {
      suma,
      quincenas,
      meses,
      detalle: `${semanas} semana(s) × ₡${round2(porSemana).toLocaleString("es-CR")} (estimado)`,
    };
  }
  const suma = round2(avg * meses);
  return {
    suma,
    quincenas,
    meses,
    detalle: `${meses} mes(es) × ₡${round2(avg).toLocaleString("es-CR")} (estimado)`,
  };
}

function ingresoAguinaldoStart(fechaIngreso: string, fechaSalida: string): Date {
  const ingreso = parseDate(fechaIngreso);
  const inicioPeriodo = inicioPeriodoAguinaldo(fechaSalida);
  return ingreso > inicioPeriodo ? ingreso : inicioPeriodo;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
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
  /**
   * Suma de salarios brutos del período de aguinaldo (1 dic–30 nov / ingreso→salida).
   * MTSS: aguinaldo = esa suma ÷ 12. Si null, se estima por quincenas/semanas.
   */
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
  aguinaldoQuincenas: number;
  aguinaldoSuma: number;
  aguinaldoMonto: number;
  salariosPendientes: number;
  total: number;
  rubros: { id: string; label: string; monto: number; detalle: string }[];
  advertencias: string[];
  incluyePreaviso: boolean;
  incluyeCesantia: boolean;
};

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

  // MTSS: sumar brutos del período (1 dic–30 nov o ingreso→salida) y ÷ 12
  const estimadoAgui = estimarSumaAguinaldo({
    fechaIngreso: input.fechaIngreso,
    fechaSalida: input.fechaSalida,
    promedioMensual: avg,
    tipoSalario: input.tipoSalario,
  });
  const tieneSumaReal =
    input.sumaSalariosAguinaldo != null && Number.isFinite(Number(input.sumaSalariosAguinaldo));
  const sumaAgui = tieneSumaReal ? Number(input.sumaSalariosAguinaldo) : estimadoAgui.suma;
  const aguinaldoMonto = round2(sumaAgui / 12);
  const mesesAgui = estimadoAgui.meses;
  const quincenasAgui = estimadoAgui.quincenas;
  const detalleAguinaldo = tieneSumaReal
    ? `MTSS: suma brutos ₡${round2(sumaAgui).toLocaleString("es-CR")} ÷ 12` +
      (input.tipoSalario === "quincenal" ? ` (${quincenasAgui} quincena(s) en el período)` : "")
    : `MTSS estimado: ${estimadoAgui.detalle} = ₡${round2(sumaAgui).toLocaleString("es-CR")} ÷ 12`;

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
      detalle: detalleAguinaldo,
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
    aguinaldoQuincenas: quincenasAgui,
    aguinaldoSuma: round2(sumaAgui),
    aguinaldoMonto,
    salariosPendientes,
    total,
    rubros,
    advertencias,
    incluyePreaviso,
    incluyeCesantia,
  };
}
