import { jsPDF } from "jspdf";

const RED: [number, number, number] = [183, 0, 45];
const NAVY: [number, number, number] = [20, 40, 68];
const INK: [number, number, number] = [32, 38, 48];
const MUTED: [number, number, number] = [100, 110, 122];
const RULE: [number, number, number] = [220, 224, 230];
const WASH: [number, number, number] = [248, 249, 251];

const TIPO_SALIDA: Record<string, string> = {
  renuncia: "Renuncia voluntaria",
  despido_con_responsabilidad: "Despido con responsabilidad patronal",
  despido_sin_responsabilidad: "Despido sin responsabilidad patronal",
};

const TIPO_SALARIO: Record<string, string> = {
  semanal: "Semanal",
  quincenal: "Quincenal",
  mensual: "Mensual",
};

function money(n: number | string) {
  return `₡${Number(n || 0).toLocaleString("es-CR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDateCR(yyyyMmDd: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd)) return yyyyMmDd;
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  return new Date(y, m - 1, d, 12).toLocaleDateString("es-CR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

const UNIDADES = [
  "", "un", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve",
  "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete",
  "dieciocho", "diecinueve", "veinte", "veintiuno", "veintidós", "veintitrés",
  "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve",
];
const DECENAS = ["", "", "veinte", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const CENTENAS = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];

function seccionHasta999(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cien";
  if (n < 30) return UNIDADES[n];
  if (n < 100) {
    const d = Math.floor(n / 10);
    const u = n % 10;
    return u === 0 ? DECENAS[d] : `${DECENAS[d]} y ${UNIDADES[u]}`;
  }
  const c = Math.floor(n / 100);
  const r = n % 100;
  return r === 0 ? CENTENAS[c] : `${CENTENAS[c]} ${seccionHasta999(r)}`;
}

function enteroEnLetras(n: number): string {
  if (n === 0) return "cero";
  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const partes: string[] = [];
  if (millones === 1) partes.push("un millón");
  else if (millones > 1) partes.push(`${seccionHasta999(millones)} millones`);
  if (miles === 1) partes.push("mil");
  else if (miles > 1) partes.push(`${seccionHasta999(miles)} mil`);
  if (resto > 0) partes.push(seccionHasta999(resto));
  return partes.join(" ").replace(/\s+/g, " ").trim();
}

export function montoEnLetras(valor: number): string {
  const raw = Math.round((Number(valor) || 0) * 100) / 100;
  const enteros = Math.floor(raw);
  const centimos = Math.round((raw - enteros) * 100);
  const base = enteroEnLetras(enteros);
  const capitalizado = base.charAt(0).toUpperCase() + base.slice(1);
  if (centimos <= 0) return `${capitalizado} colones exactos`;
  return `${capitalizado} colones con ${enteroEnLetras(centimos)} céntimos`;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

let fontBuffers: Promise<{ regular: string; bold: string } | null> | null = null;
let logoDataUrl: Promise<string | null> | null = null;

function loadFontBuffers() {
  if (!fontBuffers) {
    fontBuffers = (async () => {
      try {
        const [reg, bold] = await Promise.all([
          fetch("/fonts/NotoSans-Regular.ttf").then((r) => {
            if (!r.ok) throw new Error("font");
            return r.arrayBuffer();
          }),
          fetch("/fonts/NotoSans-Bold.ttf").then((r) => {
            if (!r.ok) throw new Error("font");
            return r.arrayBuffer();
          }),
        ]);
        return { regular: arrayBufferToBase64(reg), bold: arrayBufferToBase64(bold) };
      } catch {
        return null;
      }
    })();
  }
  return fontBuffers;
}

function loadLogo() {
  if (!logoDataUrl) {
    logoDataUrl = (async () => {
      try {
        const res = await fetch("/logo.jpg");
        if (!res.ok) return null;
        const buf = await res.arrayBuffer();
        return `data:image/jpeg;base64,${arrayBufferToBase64(buf)}`;
      } catch {
        return null;
      }
    })();
  }
  return logoDataUrl;
}

async function ensureFonts(doc: jsPDF): Promise<boolean> {
  const bufs = await loadFontBuffers();
  if (!bufs) return false;
  doc.addFileToVFS("NotoSans-Regular.ttf", bufs.regular);
  doc.addFileToVFS("NotoSans-Bold.ttf", bufs.bold);
  doc.addFont("NotoSans-Regular.ttf", "NotoSans", "normal");
  doc.addFont("NotoSans-Bold.ttf", "NotoSans", "bold");
  return true;
}

/** Texto limpio para el trabajador (sin fórmulas internas MTSS). */
function detalleLimpio(
  r: { id?: string; label: string; monto: number; detalle?: string },
  data: LiquidacionPdfInput,
): string {
  const id = r.id || "";
  const monto = Number(r.monto || 0);
  if (id === "salarios_pendientes") {
    return monto > 0 ? "Remuneración pendiente de pago" : "Ninguno";
  }
  if (id === "aguinaldo") return "Proporcional al período (suma de salarios ÷ 12)";
  if (id === "vacaciones") {
    const d = data.vacacionesDias ?? extractDays(r.detalle);
    return d != null ? `${formatDays(d)} × salario diario` : "Art. 153 Código de Trabajo";
  }
  if (id === "preaviso") {
    if (monto <= 0) return "No pagado en dinero";
    const d = data.preavisoDias ?? extractDays(r.detalle);
    return d != null ? `${formatDays(d)} × salario diario (Art. 28)` : "Art. 28 Código de Trabajo";
  }
  if (id === "cesantia") {
    if (monto <= 0) return "No aplica";
    const d = data.cesantiaDias ?? extractDays(r.detalle);
    return d != null ? `${formatDays(d)} × salario diario (Art. 29)` : "Art. 29 Código de Trabajo";
  }
  // Fallback: recortar detalle técnico
  const raw = (r.detalle || "").replace(/\s+/g, " ").trim();
  if (!raw) return "—";
  if (/MTSS|estimado|÷|\/\s*12/i.test(raw)) return "Según Código de Trabajo";
  return raw.length > 55 ? `${raw.slice(0, 52)}…` : raw;
}

function extractDays(detalle?: string): number | null {
  if (!detalle) return null;
  const m = detalle.match(/(\d+(?:[.,]\d+)?)\s*d[ií]a/i);
  if (!m) return null;
  return Number(m[1].replace(",", "."));
}

function formatDays(d: number) {
  const n = Number(d);
  if (!Number.isFinite(n)) return String(d);
  const s = Number.isInteger(n) ? String(n) : n.toLocaleString("es-CR", { maximumFractionDigits: 2 });
  return `${s} día${n === 1 ? "" : "s"}`;
}

export type LiquidacionPdfInput = {
  id?: number | string;
  empleadoNombre: string;
  puesto?: string;
  tiendaNombre?: string;
  cedula?: string | null;
  tipoSalida: string;
  fechaIngreso: string;
  fechaSalida: string;
  promedioMensual: number | string;
  tipoSalario?: string;
  antigüedadLabel?: string;
  salarioDiario?: number;
  preavisoMonto?: number | string;
  preavisoDias?: number;
  cesantiaMonto?: number | string;
  cesantiaDias?: number;
  vacacionesMonto?: number | string;
  vacacionesDias?: number;
  aguinaldoMonto?: number | string;
  aguinaldoDetalle?: string;
  salariosPendientes?: number | string;
  total: number | string;
  rubros?: { id?: string; label: string; monto: number; detalle?: string }[];
  nota?: string | null;
  generadoPor?: string;
  empresaNombre?: string;
};

type Ctx = {
  doc: jsPDF;
  font: string;
  pageW: number;
  pageH: number;
  mx: number;
  y: number;
};

function font(ctx: Ctx, style: "normal" | "bold", size: number, color: [number, number, number] = INK) {
  ctx.doc.setFont(ctx.font, style);
  ctx.doc.setFontSize(size);
  ctx.doc.setTextColor(...color);
}

function gap(ctx: Ctx, n = 10) {
  ctx.y += n;
}

function rule(ctx: Ctx, color: [number, number, number] = RULE, w = 0.6) {
  ctx.doc.setDrawColor(...color);
  ctx.doc.setLineWidth(w);
  ctx.doc.line(ctx.mx, ctx.y, ctx.pageW - ctx.mx, ctx.y);
  ctx.y += 12;
}

function need(ctx: Ctx, h: number) {
  if (ctx.y + h < ctx.pageH - 48) return;
  ctx.doc.addPage();
  ctx.y = 48;
}

function heading(ctx: Ctx, title: string) {
  need(ctx, 26);
  font(ctx, "bold", 9, NAVY);
  ctx.doc.text(title.toUpperCase(), ctx.mx, ctx.y);
  ctx.y += 5;
  ctx.doc.setFillColor(...RED);
  ctx.doc.rect(ctx.mx, ctx.y, 28, 2, "F");
  ctx.y += 14;
}

function kvRow(ctx: Ctx, label: string, value: string, zebra: boolean) {
  need(ctx, 18);
  const rowH = 17;
  if (zebra) {
    ctx.doc.setFillColor(...WASH);
    ctx.doc.rect(ctx.mx, ctx.y - 11, ctx.pageW - ctx.mx * 2, rowH, "F");
  }
  font(ctx, "normal", 8, MUTED);
  ctx.doc.text(label, ctx.mx + 8, ctx.y);
  font(ctx, "bold", 8, INK);
  const maxW = ctx.pageW - ctx.mx * 2 - 140;
  const lines = ctx.doc.splitTextToSize(value, maxW);
  ctx.doc.text(lines[0], ctx.pageW - ctx.mx - 8, ctx.y, { align: "right" });
  ctx.y += rowH;
}

/**
 * Finiquito / comprobante de liquidación — formato corporativo.
 */
export async function buildLiquidacionPdf(data: LiquidacionPdfInput): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const unicode = await ensureFonts(doc);
  const logo = await loadLogo();
  const ctx: Ctx = {
    doc,
    font: unicode ? "NotoSans" : "helvetica",
    pageW: doc.internal.pageSize.getWidth(),
    pageH: doc.internal.pageSize.getHeight(),
    mx: 50,
    y: 0,
  };

  const empresa = data.empresaNombre || "American Outlet";
  const folio =
    data.id != null
      ? `LIQ-${String(data.id).padStart(5, "0")}`
      : `LIQ-${(data.fechaSalida || new Date().toISOString().slice(0, 10)).replace(/-/g, "")}`;
  const totalNum = Number(data.total || 0);
  const contentW = ctx.pageW - ctx.mx * 2;

  // ── Top accent ──────────────────────────────────────────────
  doc.setFillColor(...RED);
  doc.rect(0, 0, ctx.pageW, 6, "F");

  // ── Letterhead ──────────────────────────────────────────────
  ctx.y = 28;
  if (logo) {
    try {
      doc.addImage(logo, "JPEG", ctx.mx, ctx.y, 36, 36);
    } catch {
      /* ignore broken logo */
    }
  }

  const headX = logo ? ctx.mx + 48 : ctx.mx;
  font(ctx, "bold", 16, NAVY);
  doc.text(empresa, headX, ctx.y + 16);
  font(ctx, "normal", 8, MUTED);
  doc.text("Recursos humanos · Costa Rica", headX, ctx.y + 30);

  font(ctx, "bold", 10, RED);
  doc.text(folio, ctx.pageW - ctx.mx, ctx.y + 14, { align: "right" });
  font(ctx, "normal", 8, MUTED);
  doc.text(new Date().toLocaleDateString("es-CR", { day: "2-digit", month: "long", year: "numeric" }), ctx.pageW - ctx.mx, ctx.y + 28, {
    align: "right",
  });

  ctx.y = 78;
  rule(ctx, RED, 1.5);

  font(ctx, "bold", 14, NAVY);
  doc.text("Comprobante de liquidación laboral", ctx.mx, ctx.y);
  ctx.y += 14;
  font(ctx, "normal", 9, MUTED);
  doc.text("Finiquito de pago al término de la relación de trabajo", ctx.mx, ctx.y);
  ctx.y += 18;
  rule(ctx);

  // ── Worker + employment summary (2 columns) ─────────────────
  heading(ctx, "1. Identificación");

  const leftMeta: [string, string][] = [
    ["Trabajador(a)", data.empleadoNombre],
    ["Cédula", data.cedula?.trim() || "No registrada"],
    ["Puesto", data.puesto || "—"],
    ["Centro de trabajo", data.tiendaNombre || "—"],
  ];
  const rightMeta: [string, string][] = [
    ["Motivo de salida", TIPO_SALIDA[data.tipoSalida] || data.tipoSalida],
    ["Fecha de ingreso", formatDateCR(data.fechaIngreso)],
    ["Fecha de salida", formatDateCR(data.fechaSalida)],
    ["Antigüedad", data.antigüedadLabel || "—"],
  ];

  const colGap = 16;
  const colW = (contentW - colGap) / 2;
  const boxY = ctx.y;
  const boxH = 88;

  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.8);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(ctx.mx, boxY, colW, boxH, 3, 3, "FD");
  doc.roundedRect(ctx.mx + colW + colGap, boxY, colW, boxH, 3, 3, "FD");

  font(ctx, "bold", 7, RED);
  doc.text("TRABAJADOR(A)", ctx.mx + 10, boxY + 16);
  doc.text("RELACIÓN LABORAL", ctx.mx + colW + colGap + 10, boxY + 16);

  let ly = boxY + 32;
  for (const [lab, val] of leftMeta) {
    font(ctx, "normal", 7, MUTED);
    doc.text(lab, ctx.mx + 10, ly);
    font(ctx, "bold", 8, INK);
    const lines = doc.splitTextToSize(val, colW - 20);
    doc.text(lines[0], ctx.mx + 10, ly + 11);
    ly += 18;
  }

  let ry = boxY + 32;
  for (const [lab, val] of rightMeta) {
    font(ctx, "normal", 7, MUTED);
    doc.text(lab, ctx.mx + colW + colGap + 10, ry);
    font(ctx, "bold", 8, INK);
    const lines = doc.splitTextToSize(val, colW - 20);
    doc.text(lines[0], ctx.mx + colW + colGap + 10, ry + 11);
    ry += 18;
  }

  ctx.y = boxY + boxH + 16;

  // ── Salary base ─────────────────────────────────────────────
  heading(ctx, "2. Base salarial de cálculo");
  const salaryRows: [string, string][] = [
    ["Promedio mensual (Art. 30)", money(data.promedioMensual)],
    ["Salario diario", data.salarioDiario != null ? money(data.salarioDiario) : "—"],
    ["Forma habitual de pago", TIPO_SALARIO[data.tipoSalario || ""] || data.tipoSalario || "—"],
  ];
  salaryRows.forEach(([l, v], i) => kvRow(ctx, l, v, i % 2 === 0));
  gap(ctx, 8);

  // ── Rubros ──────────────────────────────────────────────────
  heading(ctx, "3. Detalle de rubros");

  const rubros =
    data.rubros && data.rubros.length > 0
      ? data.rubros
      : [
          { id: "salarios_pendientes", label: "Salarios pendientes", monto: Number(data.salariosPendientes || 0) },
          { id: "aguinaldo", label: "Aguinaldo proporcional", monto: Number(data.aguinaldoMonto || 0) },
          {
            id: "vacaciones",
            label: "Vacaciones no disfrutadas",
            monto: Number(data.vacacionesMonto || 0),
            detalle: data.vacacionesDias != null ? `${data.vacacionesDias} días` : undefined,
          },
          {
            id: "preaviso",
            label: "Preaviso",
            monto: Number(data.preavisoMonto || 0),
            detalle: data.preavisoDias != null ? `${data.preavisoDias} días` : undefined,
          },
          {
            id: "cesantia",
            label: "Auxilio de cesantía",
            monto: Number(data.cesantiaMonto || 0),
            detalle: data.cesantiaDias != null ? `${data.cesantiaDias} días` : undefined,
          },
        ];

  // Table header
  need(ctx, 22);
  const tx = ctx.mx;
  const tw = contentW;
  const xConcepto = tx;
  const xBase = tx + tw * 0.38;
  const xMonto = tx + tw;

  doc.setFillColor(...NAVY);
  doc.rect(tx, ctx.y - 11, tw, 20, "F");
  font(ctx, "bold", 8, [255, 255, 255]);
  doc.text("Concepto", xConcepto + 10, ctx.y);
  doc.text("Base / fundamento", xBase, ctx.y);
  doc.text("Monto (CRC)", xMonto - 10, ctx.y, { align: "right" });
  ctx.y += 16;

  for (let i = 0; i < rubros.length; i++) {
    const r = rubros[i];
    const monto = Number(r.monto || 0);
    const base = detalleLimpio(r, data);
    need(ctx, 26);
    if (i % 2 === 0) {
      doc.setFillColor(...WASH);
      doc.rect(tx, ctx.y - 10, tw, 24, "F");
    }
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.4);
    doc.line(tx, ctx.y + 13, tx + tw, ctx.y + 13);

    font(ctx, "bold", 8, INK);
    doc.text(r.label, xConcepto + 10, ctx.y);
    font(ctx, "normal", 7, MUTED);
    const baseLines = doc.splitTextToSize(base, tw * 0.38);
    doc.text(baseLines[0], xBase, ctx.y);
    font(ctx, "bold", 9, monto > 0 ? INK : MUTED);
    doc.text(money(monto), xMonto - 10, ctx.y, { align: "right" });
    ctx.y += 24;
  }

  // Total
  need(ctx, 36);
  doc.setFillColor(...RED);
  doc.roundedRect(tx, ctx.y - 2, tw, 30, 2, 2, "F");
  font(ctx, "bold", 11, [255, 255, 255]);
  doc.text("TOTAL A PAGAR", tx + 12, ctx.y + 16);
  doc.text(money(totalNum), xMonto - 12, ctx.y + 16, { align: "right" });
  ctx.y += 42;

  // Letters
  need(ctx, 36);
  font(ctx, "bold", 8, NAVY);
  doc.text("Son:", ctx.mx, ctx.y);
  ctx.y += 12;
  font(ctx, "normal", 9, INK);
  const letras = doc.splitTextToSize(montoEnLetras(totalNum), contentW);
  doc.text(letras, ctx.mx, ctx.y);
  ctx.y += letras.length * 12 + 10;
  rule(ctx);

  if (data.nota?.trim()) {
    heading(ctx, "Observación");
    font(ctx, "normal", 8, MUTED);
    const notes = doc.splitTextToSize(data.nota.trim(), contentW);
    doc.text(notes, ctx.mx, ctx.y);
    ctx.y += notes.length * 11 + 10;
  }

  // ── Constancia ──────────────────────────────────────────────
  heading(ctx, "4. Constancia de recibo");
  font(ctx, "normal", 8, INK);
  const constancia = doc.splitTextToSize(
    `American Outlet deja constancia del pago de la liquidación laboral a favor de ${data.empleadoNombre}, ` +
      `por terminación de la relación de trabajo el ${formatDateCR(data.fechaSalida)} ` +
      `(${TIPO_SALIDA[data.tipoSalida] || data.tipoSalida}). ` +
      `El (la) trabajador(a) recibe la suma de ${money(totalNum)} conforme al desglose anterior. ` +
      `Este documento acredita los montos pagados por los conceptos indicados y no implica renuncia a derechos laborales irrenunciables.`,
    contentW,
  );
  doc.text(constancia, ctx.mx, ctx.y);
  ctx.y += constancia.length * 11 + 28;

  // ── Firmas ──────────────────────────────────────────────────
  need(ctx, 120);
  const sigW = (contentW - 28) / 2;
  const sigTop = ctx.y;

  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.8);
  doc.roundedRect(ctx.mx, sigTop, sigW, 96, 3, 3, "S");
  doc.roundedRect(ctx.mx + sigW + 28, sigTop, sigW, 96, 3, 3, "S");

  font(ctx, "bold", 8, NAVY);
  doc.text("Empleador", ctx.mx + 12, sigTop + 16);
  doc.text("Trabajador(a)", ctx.mx + sigW + 40, sigTop + 16);

  doc.setDrawColor(...MUTED);
  doc.setLineWidth(0.7);
  doc.line(ctx.mx + 12, sigTop + 52, ctx.mx + sigW - 12, sigTop + 52);
  doc.line(ctx.mx + sigW + 40, sigTop + 52, ctx.mx + contentW - 12, sigTop + 52);

  font(ctx, "normal", 7, MUTED);
  doc.text("Firma y nombre", ctx.mx + 12, sigTop + 64);
  doc.text("Cédula: ____________________", ctx.mx + 12, sigTop + 78);
  doc.text("Fecha: _____________________", ctx.mx + 12, sigTop + 90);

  doc.text(data.empleadoNombre, ctx.mx + sigW + 40, sigTop + 64);
  doc.text(`Cédula: ${data.cedula?.trim() || "____________________"}`, ctx.mx + sigW + 40, sigTop + 78);
  doc.text("Fecha: _____________________", ctx.mx + sigW + 40, sigTop + 90);

  ctx.y = sigTop + 112;

  // ── Footer ──────────────────────────────────────────────────
  need(ctx, 40);
  rule(ctx);
  font(ctx, "normal", 6.5, MUTED);
  const foot = doc.splitTextToSize(
    "Documento emitido conforme al Código de Trabajo de Costa Rica (Arts. 28, 29, 30 y 153). Conserve este comprobante junto al comprobante de pago. Para consultas: Ministerio de Trabajo y Seguridad Social (MTSS).",
    contentW,
  );
  doc.text(foot, ctx.mx, ctx.y);
  ctx.y += foot.length * 8 + 6;
  font(ctx, "normal", 7, MUTED);
  doc.text(`${folio} · ${empresa}`, ctx.mx, ctx.y);
  doc.text("Original — trabajador(a)", ctx.pageW - ctx.mx, ctx.y, { align: "right" });

  return doc;
}

export async function downloadLiquidacionPdf(data: LiquidacionPdfInput, filename?: string) {
  const doc = await buildLiquidacionPdf(data);
  const safeName = (data.empleadoNombre || "empleado").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_");
  const folio = data.id != null ? `LIQ-${String(data.id).padStart(5, "0")}_` : "";
  doc.save(filename || `Liquidacion_${folio}${safeName}_${data.fechaSalida}.pdf`);
}
