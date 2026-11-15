/**
 * Genera un PDF de muestra (Mariany) para revisar el finiquito corporativo.
 * Uso: npx tsx scripts/gen-finiquito-sample.mjs
 */
import { readFileSync, writeFileSync } from "fs";
import { calcularLiquidacion } from "../api/lib/liquidacion-cr.ts";
import { montoEnLetras } from "../src/lib/liquidacionPdf.ts";

if (typeof globalThis.btoa === "undefined") {
  globalThis.btoa = (s) => Buffer.from(s, "binary").toString("base64");
}

const ingreso = "2026-07-31";
const salida = "2026-11-14";
const promedio = 411119.25;
const sumaAgui = 1644477;

const result = calcularLiquidacion({
  tipoSalida: "despido_con_responsabilidad",
  fechaIngreso: ingreso,
  fechaSalida: salida,
  promedioMensual: promedio,
  tipoSalario: "quincenal",
  pagaPreaviso: false,
  sumaSalariosAguinaldo: sumaAgui,
});

// Dynamic import of browser PDF builder won't fetch fonts; rebuild minimally here
// by invoking the same module after patching fetch — use offline font inject.
const reg = readFileSync("public/fonts/NotoSans-Regular.ttf");
const bold = readFileSync("public/fonts/NotoSans-Bold.ttf");

globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes("NotoSans-Regular")) {
    return { ok: true, arrayBuffer: async () => reg.buffer.slice(reg.byteOffset, reg.byteOffset + reg.byteLength) };
  }
  if (u.includes("NotoSans-Bold")) {
    return { ok: true, arrayBuffer: async () => bold.buffer.slice(bold.byteOffset, bold.byteOffset + bold.byteLength) };
  }
  return { ok: false, arrayBuffer: async () => new ArrayBuffer(0) };
};

const { buildLiquidacionPdf } = await import("../src/lib/liquidacionPdf.ts");

const doc = await buildLiquidacionPdf({
  id: 12,
  empleadoNombre: "Mariany Miranda",
  puesto: "Vendedor",
  tiendaNombre: "American Outlet Los Pavon",
  cedula: null,
  tipoSalida: "despido_con_responsabilidad",
  fechaIngreso: ingreso,
  fechaSalida: salida,
  promedioMensual: result.promedioMensual,
  tipoSalario: "quincenal",
  antigüedadLabel: result.antigüedadLabel,
  salarioDiario: result.salarioDiario,
  preavisoMonto: result.preavisoMonto,
  preavisoDias: result.preavisoDias,
  cesantiaMonto: result.cesantiaMonto,
  cesantiaDias: result.cesantiaDias,
  vacacionesMonto: result.vacacionesMonto,
  vacacionesDias: result.vacacionesDias,
  aguinaldoMonto: result.aguinaldoMonto,
  salariosPendientes: result.salariosPendientes,
  total: result.total,
  rubros: result.rubros,
  generadoPor: "AO Gestion",
  empresaNombre: "American Outlet",
});

const out = `finiquito_Mariany_Miranda_${salida}.pdf`;
const buf = Buffer.from(doc.output("arraybuffer"));
writeFileSync(out, buf);
console.log("Wrote", out, "total", result.total, "letras:", montoEnLetras(result.total));
