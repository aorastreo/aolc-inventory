import { jsPDF } from "jspdf";

const TIPO_SALIDA: Record<string, string> = {
  renuncia: "Renuncia",
  despido_con_responsabilidad: "Despido con responsabilidad patronal",
  despido_sin_responsabilidad: "Despido sin responsabilidad (falta grave)",
};

function money(n: number | string) {
  const v = Number(n || 0);
  return `CRC ${v.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export type LiquidacionPdfInput = {
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
  salariosPendientes?: number | string;
  total: number | string;
  rubros?: { label: string; monto: number; detalle?: string }[];
  advertencias?: string[];
  nota?: string | null;
  generadoPor?: string;
};

/**
 * PDF de desglose de liquidación para entregar al trabajador.
 */
export function buildLiquidacionPdf(data: LiquidacionPdfInput): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const marginX = 48;
  let y = 52;
  const pageW = doc.internal.pageSize.getWidth();

  const line = (text: string, opts?: { size?: number; bold?: boolean; color?: [number, number, number] }) => {
    doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
    doc.setFontSize(opts?.size ?? 11);
    if (opts?.color) doc.setTextColor(...opts.color);
    else doc.setTextColor(30, 40, 50);
    doc.text(text, marginX, y);
    y += (opts?.size ?? 11) + 6;
  };

  const pair = (label: string, value: string) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(90, 100, 110);
    doc.text(label, marginX, y);
    doc.setTextColor(20, 30, 40);
    doc.setFont("helvetica", "bold");
    doc.text(value, pageW - marginX, y, { align: "right" });
    y += 16;
  };

  // Header
  doc.setFillColor(178, 34, 52);
  doc.rect(0, 0, pageW, 72, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("American Outlet", marginX, 32);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text("Comprobante de liquidacion laboral", marginX, 52);

  y = 96;
  line("Desglose para el trabajador", { size: 13, bold: true, color: [27, 58, 92] });
  y += 4;

  line("Datos del trabajador", { size: 11, bold: true, color: [27, 58, 92] });
  pair("Nombre", data.empleadoNombre);
  if (data.cedula) pair("Cedula", data.cedula);
  if (data.puesto) pair("Puesto", data.puesto);
  if (data.tiendaNombre) pair("Tienda / Bodega", data.tiendaNombre);
  pair("Tipo de salida", TIPO_SALIDA[data.tipoSalida] || data.tipoSalida);
  pair("Fecha de ingreso", data.fechaIngreso);
  pair("Fecha de salida", data.fechaSalida);
  if (data.antigüedadLabel) pair("Antiguedad", data.antigüedadLabel);
  pair("Promedio salarial mensual", money(data.promedioMensual));
  if (data.salarioDiario != null) pair("Salario diario de calculo", money(data.salarioDiario));
  if (data.tipoSalario) pair("Tipo de salario", data.tipoSalario);

  y += 8;
  line("Rubros de la liquidacion", { size: 11, bold: true, color: [27, 58, 92] });

  const rubros =
    data.rubros && data.rubros.length > 0
      ? data.rubros
      : [
          { label: "Salarios pendientes", monto: Number(data.salariosPendientes || 0) },
          { label: "Aguinaldo proporcional", monto: Number(data.aguinaldoMonto || 0) },
          {
            label: "Vacaciones no disfrutadas",
            monto: Number(data.vacacionesMonto || 0),
            detalle: data.vacacionesDias != null ? `${data.vacacionesDias} dia(s)` : undefined,
          },
          {
            label: "Preaviso",
            monto: Number(data.preavisoMonto || 0),
            detalle: data.preavisoDias != null ? `${data.preavisoDias} dia(s)` : undefined,
          },
          {
            label: "Auxilio de cesantia",
            monto: Number(data.cesantiaMonto || 0),
            detalle: data.cesantiaDias != null ? `${data.cesantiaDias} dia(s)` : undefined,
          },
        ];

  for (const r of rubros) {
    const label = r.detalle ? `${r.label} (${r.detalle})` : r.label;
    pair(label, money(r.monto));
  }

  y += 6;
  doc.setDrawColor(178, 34, 52);
  doc.setLineWidth(1);
  doc.line(marginX, y, pageW - marginX, y);
  y += 18;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(178, 34, 52);
  doc.text("TOTAL A PAGAR", marginX, y);
  doc.text(money(data.total), pageW - marginX, y, { align: "right" });
  y += 28;

  if (data.nota) {
    line("Nota", { size: 10, bold: true, color: [27, 58, 92] });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(60, 70, 80);
    const wrapped = doc.splitTextToSize(data.nota, pageW - marginX * 2);
    doc.text(wrapped, marginX, y);
    y += wrapped.length * 12 + 10;
  }

  if (data.advertencias && data.advertencias.length > 0) {
    line("Observaciones", { size: 10, bold: true, color: [146, 64, 14] });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120, 80, 20);
    for (const a of data.advertencias) {
      const wrapped = doc.splitTextToSize(`• ${a}`, pageW - marginX * 2);
      doc.text(wrapped, marginX, y);
      y += wrapped.length * 11 + 4;
    }
  }

  y = Math.max(y + 20, 640);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120, 130, 140);
  const footer = doc.splitTextToSize(
    "Documento orientativo segun Codigo de Trabajo de Costa Rica (Arts. 28-30), aguinaldo y vacaciones. No sustituye criterio del MTSS ni asesoria laboral. Conserve este desglose junto al comprobante de pago.",
    pageW - marginX * 2,
  );
  doc.text(footer, marginX, y);
  y += footer.length * 10 + 16;
  doc.text(`Generado: ${new Date().toLocaleString("es-CR")}${data.generadoPor ? ` · ${data.generadoPor}` : ""}`, marginX, y);

  // Firmas
  y += 40;
  doc.setDrawColor(180, 185, 190);
  doc.line(marginX, y, marginX + 180, y);
  doc.line(pageW - marginX - 180, y, pageW - marginX, y);
  y += 12;
  doc.setFontSize(9);
  doc.setTextColor(80, 90, 100);
  doc.text("Firma empleador", marginX, y);
  doc.text("Firma trabajador", pageW - marginX - 180, y);

  return doc;
}

export function downloadLiquidacionPdf(data: LiquidacionPdfInput, filename?: string) {
  const doc = buildLiquidacionPdf(data);
  const safeName = (data.empleadoNombre || "empleado").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_");
  doc.save(filename || `liquidacion_${safeName}_${data.fechaSalida}.pdf`);
}
