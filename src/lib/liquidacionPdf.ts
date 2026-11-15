import { jsPDF } from "jspdf";

const BRAND_RED: [number, number, number] = [178, 34, 52];
const BRAND_BLUE: [number, number, number] = [27, 58, 92];
const INK: [number, number, number] = [28, 36, 48];
const MUTED: [number, number, number] = [90, 100, 112];
const LINE: [number, number, number] = [210, 216, 224];
const ROW_ALT: [number, number, number] = [247, 249, 252];

const TIPO_SALIDA: Record<string, string> = {
  renuncia: "Renuncia voluntaria",
  despido_con_responsabilidad: "Despido con responsabilidad patronal",
  despido_sin_responsabilidad: "Despido sin responsabilidad patronal (falta grave)",
};

const TIPO_SALARIO: Record<string, string> = {
  semanal: "Semanal",
  quincenal: "Quincenal",
  mensual: "Mensual",
};

function money(n: number | string) {
  const v = Number(n || 0);
  return `₡${v.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateCR(yyyyMmDd: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd)) return yyyyMmDd;
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const dt = new Date(y, m - 1, d, 12);
  return dt.toLocaleDateString("es-CR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

const UNIDADES = [
  "", "un", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve",
  "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete",
  "dieciocho", "diecinueve", "veinte", "veintiún", "veintidós", "veintitrés",
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
    if (u === 0) return DECENAS[d];
    return `${DECENAS[d]} y ${UNIDADES[u]}`;
  }
  const c = Math.floor(n / 100);
  const r = n % 100;
  if (r === 0) return CENTENAS[c];
  return `${CENTENAS[c]} ${seccionHasta999(r)}`;
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

/** Monto en letras (colones costarricenses), con céntimos si aplica. */
export function montoEnLetras(valor: number): string {
  const raw = Math.round((Number(valor) || 0) * 100) / 100;
  const enteros = Math.floor(raw);
  const centimos = Math.round((raw - enteros) * 100);
  const base = enteroEnLetras(enteros);
  const capitalizado = base.charAt(0).toUpperCase() + base.slice(1);
  if (centimos <= 0) return `${capitalizado} colones exactos`;
  const centTxt = enteroEnLetras(centimos);
  return `${capitalizado} colones con ${centTxt} céntimos`;
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

function loadFontBuffers() {
  if (!fontBuffers) {
    fontBuffers = (async () => {
      try {
        const [reg, bold] = await Promise.all([
          fetch("/fonts/NotoSans-Regular.ttf").then((r) => {
            if (!r.ok) throw new Error("font regular");
            return r.arrayBuffer();
          }),
          fetch("/fonts/NotoSans-Bold.ttf").then((r) => {
            if (!r.ok) throw new Error("font bold");
            return r.arrayBuffer();
          }),
        ]);
        return {
          regular: arrayBufferToBase64(reg),
          bold: arrayBufferToBase64(bold),
        };
      } catch {
        return null;
      }
    })();
  }
  return fontBuffers;
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

type PdfCtx = {
  doc: jsPDF;
  font: string;
  pageW: number;
  pageH: number;
  marginX: number;
  y: number;
};

function setFont(ctx: PdfCtx, style: "normal" | "bold", size: number, color: [number, number, number] = INK) {
  ctx.doc.setFont(ctx.font, style);
  ctx.doc.setFontSize(size);
  ctx.doc.setTextColor(...color);
}

function ensureSpace(ctx: PdfCtx, need: number) {
  if (ctx.y + need < ctx.pageH - 56) return;
  ctx.doc.addPage();
  ctx.y = 48;
}

function sectionTitle(ctx: PdfCtx, title: string) {
  ensureSpace(ctx, 28);
  setFont(ctx, "bold", 10, BRAND_BLUE);
  ctx.doc.text(title.toUpperCase(), ctx.marginX, ctx.y);
  ctx.y += 6;
  ctx.doc.setDrawColor(...BRAND_RED);
  ctx.doc.setLineWidth(1.2);
  ctx.doc.line(ctx.marginX, ctx.y, ctx.marginX + 52, ctx.y);
  ctx.y += 14;
}

/**
 * PDF corporativo de liquidación / finiquito de pago para entregar al trabajador.
 */
export async function buildLiquidacionPdf(data: LiquidacionPdfInput): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const withUnicode = await ensureFonts(doc);
  const ctx: PdfCtx = {
    doc,
    font: withUnicode ? "NotoSans" : "helvetica",
    pageW: doc.internal.pageSize.getWidth(),
    pageH: doc.internal.pageSize.getHeight(),
    marginX: 48,
    y: 0,
  };

  const empresa = data.empresaNombre || "American Outlet";
  const folio = data.id != null
    ? `LIQ-${String(data.id).padStart(5, "0")}`
    : `LIQ-${(data.fechaSalida || "").replace(/-/g, "")}`;
  const totalNum = Number(data.total || 0);

  // ── Letterhead ──────────────────────────────────────────────
  doc.setFillColor(...BRAND_RED);
  doc.rect(0, 0, ctx.pageW, 78, "F");
  doc.setFillColor(...BRAND_BLUE);
  doc.rect(0, 78, ctx.pageW, 3, "F");

  setFont(ctx, "bold", 18, [255, 255, 255]);
  doc.text(empresa, ctx.marginX, 30);
  setFont(ctx, "normal", 9, [255, 235, 238]);
  doc.text("Gestión de personal · Costa Rica", ctx.marginX, 46);
  setFont(ctx, "bold", 11, [255, 255, 255]);
  doc.text("COMPROBANTE DE LIQUIDACIÓN LABORAL", ctx.marginX, 66);

  setFont(ctx, "bold", 9, [255, 255, 255]);
  doc.text(folio, ctx.pageW - ctx.marginX, 30, { align: "right" });
  setFont(ctx, "normal", 8, [255, 230, 233]);
  doc.text("Finiquito de pago", ctx.pageW - ctx.marginX, 44, { align: "right" });
  doc.text(`Emisión: ${new Date().toLocaleString("es-CR")}`, ctx.pageW - ctx.marginX, 58, { align: "right" });

  ctx.y = 104;

  // ── Parties ─────────────────────────────────────────────────
  sectionTitle(ctx, "Partes");
  const colW = (ctx.pageW - ctx.marginX * 2 - 16) / 2;
  const leftX = ctx.marginX;
  const rightX = ctx.marginX + colW + 16;
  const boxTop = ctx.y;
  const boxH = 78;

  doc.setFillColor(...ROW_ALT);
  doc.roundedRect(leftX, boxTop, colW, boxH, 4, 4, "F");
  doc.roundedRect(rightX, boxTop, colW, boxH, 4, 4, "F");

  setFont(ctx, "bold", 8, BRAND_BLUE);
  doc.text("EMPLEADOR", leftX + 10, boxTop + 16);
  doc.text("TRABAJADOR(A)", rightX + 10, boxTop + 16);

  setFont(ctx, "bold", 10, INK);
  doc.text(empresa, leftX + 10, boxTop + 34);
  setFont(ctx, "normal", 8, MUTED);
  const tiendaLines = doc.splitTextToSize(
    data.tiendaNombre ? `Centro de trabajo: ${data.tiendaNombre}` : "Costa Rica",
    colW - 20,
  );
  doc.text(tiendaLines, leftX + 10, boxTop + 48);
  doc.text("Documento generado por AO Gestión", leftX + 10, boxTop + 64);

  setFont(ctx, "bold", 10, INK);
  const nombreLines = doc.splitTextToSize(data.empleadoNombre, colW - 20);
  doc.text(nombreLines, rightX + 10, boxTop + 34);
  setFont(ctx, "normal", 8, MUTED);
  let ry = boxTop + 34 + nombreLines.length * 11;
  doc.text(`Cédula: ${data.cedula?.trim() || "________________"}`, rightX + 10, ry);
  ry += 12;
  if (data.puesto) doc.text(`Puesto: ${data.puesto}`, rightX + 10, ry);

  ctx.y = boxTop + boxH + 18;

  // ── Employment relationship ─────────────────────────────────
  sectionTitle(ctx, "Relación laboral");
  const meta: [string, string][] = [
    ["Motivo de terminación", TIPO_SALIDA[data.tipoSalida] || data.tipoSalida],
    ["Fecha de ingreso", formatDateCR(data.fechaIngreso)],
    ["Fecha de salida", formatDateCR(data.fechaSalida)],
    ["Antigüedad", data.antigüedadLabel || "—"],
    ["Promedio salarial (Art. 30)", money(data.promedioMensual)],
    ["Salario diario de cálculo", data.salarioDiario != null ? money(data.salarioDiario) : "—"],
    ["Forma de pago habitual", TIPO_SALARIO[data.tipoSalario || ""] || data.tipoSalario || "—"],
  ];

  for (let i = 0; i < meta.length; i++) {
    const [label, value] = meta[i];
    ensureSpace(ctx, 16);
    if (i % 2 === 0) {
      doc.setFillColor(...ROW_ALT);
      doc.rect(ctx.marginX, ctx.y - 9, ctx.pageW - ctx.marginX * 2, 16, "F");
    }
    setFont(ctx, "normal", 8, MUTED);
    doc.text(label, ctx.marginX + 6, ctx.y);
    setFont(ctx, "bold", 8, INK);
    doc.text(value, ctx.pageW - ctx.marginX - 6, ctx.y, { align: "right" });
    ctx.y += 16;
  }
  ctx.y += 10;

  // ── Rubros table ────────────────────────────────────────────
  sectionTitle(ctx, "Detalle de la liquidación");

  const rubros =
    data.rubros && data.rubros.length > 0
      ? data.rubros
      : [
          { label: "Salarios pendientes", monto: Number(data.salariosPendientes || 0) },
          { label: "Aguinaldo proporcional", monto: Number(data.aguinaldoMonto || 0), detalle: data.aguinaldoDetalle },
          {
            label: "Vacaciones no disfrutadas",
            monto: Number(data.vacacionesMonto || 0),
            detalle: data.vacacionesDias != null ? `${data.vacacionesDias} día(s)` : undefined,
          },
          {
            label: "Preaviso",
            monto: Number(data.preavisoMonto || 0),
            detalle: data.preavisoDias != null ? `${data.preavisoDias} día(s)` : undefined,
          },
          {
            label: "Auxilio de cesantía",
            monto: Number(data.cesantiaMonto || 0),
            detalle: data.cesantiaDias != null ? `${data.cesantiaDias} día(s)` : undefined,
          },
        ];

  const tableX = ctx.marginX;
  const tableW = ctx.pageW - ctx.marginX * 2;
  const c1 = tableX;
  const c2 = tableX + tableW * 0.42;
  const c3 = tableX + tableW;

  // header
  ensureSpace(ctx, 24);
  doc.setFillColor(...BRAND_BLUE);
  doc.rect(tableX, ctx.y - 10, tableW, 18, "F");
  setFont(ctx, "bold", 8, [255, 255, 255]);
  doc.text("Concepto", c1 + 8, ctx.y);
  doc.text("Base de cálculo", c2 + 4, ctx.y);
  doc.text("Monto", c3 - 8, ctx.y, { align: "right" });
  ctx.y += 14;

  for (let i = 0; i < rubros.length; i++) {
    const r = rubros[i];
    const monto = Number(r.monto || 0);
    const detalle = (r.detalle || "—").replace(/\s+/g, " ");
    ensureSpace(ctx, 28);
    if (i % 2 === 0) {
      doc.setFillColor(...ROW_ALT);
      doc.rect(tableX, ctx.y - 9, tableW, 24, "F");
    }
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.4);
    doc.line(tableX, ctx.y + 14, tableX + tableW, ctx.y + 14);

    setFont(ctx, "bold", 8, INK);
    doc.text(r.label, c1 + 8, ctx.y);
    setFont(ctx, "normal", 7, MUTED);
    const detLines = doc.splitTextToSize(detalle, c3 - c2 - 70);
    doc.text(detLines.slice(0, 2), c2 + 4, ctx.y);
    setFont(ctx, "bold", 9, INK);
    doc.text(money(monto), c3 - 8, ctx.y, { align: "right" });
    ctx.y += 24;
  }

  // Total bar
  ensureSpace(ctx, 36);
  doc.setFillColor(...BRAND_RED);
  doc.roundedRect(tableX, ctx.y - 4, tableW, 28, 3, 3, "F");
  setFont(ctx, "bold", 11, [255, 255, 255]);
  doc.text("TOTAL A PAGAR", tableX + 12, ctx.y + 14);
  doc.text(money(totalNum), c3 - 12, ctx.y + 14, { align: "right" });
  ctx.y += 40;

  // Amount in words
  ensureSpace(ctx, 40);
  setFont(ctx, "bold", 8, BRAND_BLUE);
  doc.text("Monto en letras", ctx.marginX, ctx.y);
  ctx.y += 12;
  setFont(ctx, "normal", 9, INK);
  const letras = doc.splitTextToSize(montoEnLetras(totalNum), tableW);
  doc.text(letras, ctx.marginX, ctx.y);
  ctx.y += letras.length * 12 + 14;

  // Optional note
  if (data.nota?.trim()) {
    sectionTitle(ctx, "Nota interna / observación");
    setFont(ctx, "normal", 8, MUTED);
    const noteLines = doc.splitTextToSize(data.nota.trim(), tableW);
    doc.text(noteLines, ctx.marginX, ctx.y);
    ctx.y += noteLines.length * 11 + 12;
  }

  // ── Acknowledgement ─────────────────────────────────────────
  sectionTitle(ctx, "Constancia de recibo");
  setFont(ctx, "normal", 8, INK);
  const constancia = doc.splitTextToSize(
    `Por medio del presente documento, ${empresa} deja constancia del cálculo y pago de la liquidación laboral correspondiente a ${data.empleadoNombre}, por la terminación de la relación de trabajo con fecha ${formatDateCR(data.fechaSalida)}, bajo la modalidad de «${TIPO_SALIDA[data.tipoSalida] || data.tipoSalida}». ` +
      `El (la) trabajador(a) declara recibir a su entera satisfacción la suma de ${money(totalNum)} (${montoEnLetras(totalNum)}), conforme al desglose de rubros indicado arriba. ` +
      `Este comprobante documenta los montos pagados por los conceptos detallados; no constituye renuncia a derechos laborales irrenunciables conforme al ordenamiento jurídico costarricense.`,
    tableW,
  );
  doc.text(constancia, ctx.marginX, ctx.y);
  ctx.y += constancia.length * 11 + 28;

  // ── Signatures ──────────────────────────────────────────────
  ensureSpace(ctx, 110);
  const sigW = (tableW - 24) / 2;
  const sigY = ctx.y + 36;
  doc.setDrawColor(...MUTED);
  doc.setLineWidth(0.8);
  doc.line(ctx.marginX, sigY, ctx.marginX + sigW, sigY);
  doc.line(ctx.marginX + sigW + 24, sigY, ctx.marginX + tableW, sigY);

  setFont(ctx, "bold", 8, INK);
  doc.text("Por el empleador", ctx.marginX, sigY + 14);
  doc.text("Trabajador(a)", ctx.marginX + sigW + 24, sigY + 14);

  setFont(ctx, "normal", 7, MUTED);
  doc.text("Nombre: _______________________________", ctx.marginX, sigY + 30);
  doc.text("Cédula: _______________________________", ctx.marginX, sigY + 42);
  doc.text("Fecha: ________________________________", ctx.marginX, sigY + 54);

  doc.text(`Nombre: ${data.empleadoNombre}`, ctx.marginX + sigW + 24, sigY + 30);
  doc.text(`Cédula: ${data.cedula?.trim() || "_______________________________"}`, ctx.marginX + sigW + 24, sigY + 42);
  doc.text("Fecha: ________________________________", ctx.marginX + sigW + 24, sigY + 54);

  ctx.y = sigY + 72;

  // ── Footer legal ────────────────────────────────────────────
  ensureSpace(ctx, 50);
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.6);
  doc.line(ctx.marginX, ctx.y, ctx.pageW - ctx.marginX, ctx.y);
  ctx.y += 12;
  setFont(ctx, "normal", 7, MUTED);
  const footer = doc.splitTextToSize(
    "Cálculo orientativo según Código de Trabajo de Costa Rica (Arts. 28, 29, 30 y 153), aguinaldo proporcional y vacaciones. Conserve este documento junto al comprobante de transferencia o pago. En caso de duda, consulte al Ministerio de Trabajo y Seguridad Social (MTSS) o a un profesional en derecho laboral.",
    tableW,
  );
  doc.text(footer, ctx.marginX, ctx.y);
  ctx.y += footer.length * 9 + 8;
  setFont(ctx, "normal", 7, MUTED);
  doc.text(
    `Generado por AO Gestión${data.generadoPor ? ` · ${data.generadoPor}` : ""} · ${folio}`,
    ctx.marginX,
    ctx.y,
  );
  doc.text("Página 1", ctx.pageW - ctx.marginX, ctx.y, { align: "right" });

  return doc;
}

export async function downloadLiquidacionPdf(data: LiquidacionPdfInput, filename?: string) {
  const doc = await buildLiquidacionPdf(data);
  const safeName = (data.empleadoNombre || "empleado").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_");
  const folio = data.id != null ? `LIQ-${String(data.id).padStart(5, "0")}_` : "";
  doc.save(filename || `Liquidacion_${folio}${safeName}_${data.fechaSalida}.pdf`);
}
