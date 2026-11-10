import JsBarcode from "jsbarcode";

/** Canonical ZD411 profile: 50×25 mm = 2×1 in. Single source of truth for UI + print. */
export const LABEL_DEFAULTS = {
  labelWidth: "50mm",
  labelHeight: "25mm",
  nameFontSize: "7pt",
  nameTop: "0.5mm",
  nameTextAlign: "center",
  nameFontWeight: "normal",
  nameFontFamily: "Arial Narrow",
  priceFontSize: "26pt",
  ivaFontSize: "12pt",
  priceTop: "4mm",
  priceTextAlign: "center",
  priceFontWeight: "bold",
  priceFontFamily: "Arial",
  barcodeWidth: "46mm",
  barcodeHeight: "8mm",
  barcodeTop: "9mm",
  barcodeAlign: "center",
  barcodeNumberFontSize: "8.5pt",
  barcodeNumberLetterSpacing: "0.5px",
  barcodeNumberTop: "15.5mm",
  barcodeNumberAlign: "center",
  barcodeNumberFontWeight: "bold",
  barcodeNumberFontFamily: "Courier New",
  footerFontSize: "6pt",
  footerTop: "19mm",
  footerTextAlign: "center",
  footerFontFamily: "Verdana",
  showPrice: true,
  showIva: true,
  showBarcode: true,
  showBarcodeNumber: true,
  showFooter: true,
  showDate: true,
  footerText: "American Outlet Los Chiles",
  /** 0 | 90 | 180 | 270 — compensate Zebra/driver orientation */
  rotation: 0,
  /** Max chars per line for product name (2 lines) */
  nameMaxCharsPerLine: 28,
} as const;

export type LabelConfigValues = {
  [K in keyof typeof LABEL_DEFAULTS]: (typeof LABEL_DEFAULTS)[K] extends boolean
    ? boolean
    : (typeof LABEL_DEFAULTS)[K] extends number
      ? number
      : string;
} & Record<string, string | boolean | number>;

export type LabelPrintItem = {
  nombre: string;
  precio: string | number;
  codigoBarras?: string | null;
};

export function mergeLabelConfig(raw?: Record<string, unknown> | null): LabelConfigValues {
  const out: Record<string, string | boolean | number> = { ...LABEL_DEFAULTS };
  if (!raw) return out as LabelConfigValues;
  for (const key of Object.keys(LABEL_DEFAULTS) as (keyof typeof LABEL_DEFAULTS)[]) {
    const v = raw[key as string];
    if (v === undefined || v === null) continue;
    if (typeof LABEL_DEFAULTS[key] === "boolean") out[key] = !!v;
    else if (typeof LABEL_DEFAULTS[key] === "number") {
      const n = Number(v);
      out[key] = Number.isFinite(n) ? n : Number(LABEL_DEFAULTS[key]);
    } else {
      out[key] = String(v);
    }
  }
  return out as LabelConfigValues;
}

export function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function getLocalDateString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Split name into up to 2 uppercase lines without breaking mid-word when possible. */
export function formatLabelName(nombre: string, maxPerLine = 28): string[] {
  const raw = (nombre || "").trim().toUpperCase().replace(/\s+/g, " ");
  if (!raw) return [""];
  if (raw.length <= maxPerLine) return [raw];

  const words = raw.split(" ");
  const line1: string[] = [];
  const line2: string[] = [];
  for (const w of words) {
    const target = line1.join(" ").length + (line1.length ? 1 : 0) + w.length <= maxPerLine
      ? line1
      : line2;
    if (target === line2 && line2.join(" ").length + (line2.length ? 1 : 0) + w.length > maxPerLine) {
      const room = Math.max(0, maxPerLine - (line2.join(" ").length + (line2.length ? 1 : 0)));
      if (room > 1) line2.push(w.slice(0, room - 1) + "…");
      break;
    }
    target.push(w);
  }
  if (line1.length === 0) return [raw.slice(0, maxPerLine)];
  if (line2.length === 0) {
    return [raw.slice(0, maxPerLine), raw.length > maxPerLine ? raw.slice(maxPerLine, maxPerLine * 2) : ""].filter(Boolean);
  }
  return [line1.join(" "), line2.join(" ")];
}

/** Parse "8mm" → px approx at 96dpi for JsBarcode height. */
function mmToPx(mmVal: string | number, fallback = 30): number {
  const n = typeof mmVal === "number" ? mmVal : parseFloat(String(mmVal));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(12, Math.round((n / 25.4) * 96));
}

export function generateBarcodeSVG(code: string, heightPx = 30): string {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  try {
    JsBarcode(svg, code, {
      format: "CODE128",
      width: 1.5,
      height: heightPx,
      displayValue: false,
      margin: 0,
      background: "#ffffff",
      lineColor: "#000000",
    });
    // Force SVG to fill the absolute box without overflowing layout
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.style.width = "100%";
    svg.style.height = "100%";
    svg.style.display = "block";
    svg.style.maxWidth = "100%";
    svg.style.maxHeight = "100%";
    return svg.outerHTML;
  } catch {
    return `<div style="font-size:7pt;text-align:center;line-height:1">${escapeHtml(code)}</div>`;
  }
}

function justify(align: string) {
  if (align === "left") return "flex-start";
  if (align === "right") return "flex-end";
  return "center";
}

/** One physical label HTML — same markup for preview and print. */
export function buildLabelHtml(
  item: LabelPrintItem,
  cfg: LabelConfigValues,
  opts?: { barcodeSvg?: string; forceShowPrice?: boolean },
): string {
  const showPrice = opts?.forceShowPrice !== undefined ? opts.forceShowPrice : !!cfg.showPrice;
  const maxChars = Number(cfg.nameMaxCharsPerLine) || 28;
  const lines = formatLabelName(String(item.nombre || ""), maxChars);
  const nameHtml = lines
    .map((ln) => `<div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;">${escapeHtml(ln)}</div>`)
    .join("");
  const price = Math.round(Number(item.precio) || 0);
  const code = item.codigoBarras || "";
  const barcodeH = mmToPx(cfg.barcodeHeight, 30);
  const barcodeSvg = opts?.barcodeSvg ?? (code ? generateBarcodeSVG(code, barcodeH) : "");
  const footer =
    `${cfg.showDate ? getLocalDateString() + " - " : ""}${cfg.footerText || ""}`;
  const rot = normalizeRotation(cfg.rotation);
  // Only apply transform when needed — rotate(0) shifts some print drivers
  const rotStyle = rot === 0
    ? ""
    : `transform:rotate(${rot}deg);transform-origin:center center;`;

  return `<div class="label-page" style="width:${cfg.labelWidth};height:${cfg.labelHeight};position:relative;background:#fff;margin:0;padding:0;box-sizing:border-box;overflow:hidden;font-family:${cfg.nameFontFamily || "Arial Narrow"}, Arial, sans-serif;${rotStyle}">
  <div style="position:absolute;top:${cfg.nameTop};left:1mm;right:1mm;font-size:${cfg.nameFontSize};font-weight:${cfg.nameFontWeight};font-family:${cfg.nameFontFamily}, Arial, sans-serif;color:#000;letter-spacing:0.2px;line-height:1.1;text-align:${cfg.nameTextAlign};">${nameHtml}</div>
  ${showPrice ? `<div style="position:absolute;top:${cfg.priceTop};left:1mm;right:1mm;display:flex;align-items:baseline;justify-content:${justify(String(cfg.priceTextAlign))};gap:1.5mm;">
    <span style="font-size:${cfg.priceFontSize};font-weight:${cfg.priceFontWeight};font-family:${cfg.priceFontFamily}, Arial, sans-serif;color:#000;letter-spacing:0.5px;line-height:1;">${price}</span>
    ${cfg.showIva ? `<span style="font-size:${cfg.ivaFontSize};font-weight:bold;color:#000;">IVA</span>` : ""}
  </div>` : ""}
  ${cfg.showBarcode && code ? `<div style="position:absolute;top:${cfg.barcodeTop};left:1mm;right:1mm;height:${cfg.barcodeHeight};max-height:${cfg.barcodeHeight};overflow:hidden;display:flex;align-items:center;justify-content:${justify(String(cfg.barcodeAlign))};">${barcodeSvg}</div>` : ""}
  ${cfg.showBarcodeNumber && code ? `<div style="position:absolute;top:${cfg.barcodeNumberTop};left:1mm;right:1mm;font-size:${cfg.barcodeNumberFontSize};font-weight:${cfg.barcodeNumberFontWeight};font-family:${cfg.barcodeNumberFontFamily}, monospace;color:#000;letter-spacing:${cfg.barcodeNumberLetterSpacing};text-align:${cfg.barcodeNumberAlign};white-space:nowrap;overflow:hidden;">${escapeHtml(code)}</div>` : ""}
  ${cfg.showFooter ? `<div style="position:absolute;top:${cfg.footerTop};left:1mm;right:1mm;font-size:${cfg.footerFontSize};font-family:${cfg.footerFontFamily}, Arial, sans-serif;color:#000;letter-spacing:0.2px;text-align:${cfg.footerTextAlign};white-space:nowrap;overflow:hidden;">${escapeHtml(footer)}</div>` : ""}
</div>`;
}

export function normalizeRotation(raw: unknown): 0 | 90 | 180 | 270 {
  const n = Number(raw);
  if (n === 90 || n === 180 || n === 270) return n;
  return 0;
}

/** Page size for @page — swap sides when content is rotated 90/270. */
export function pageSizeForRotation(cfg: LabelConfigValues): { pageW: string; pageH: string; designW: string; designH: string; rot: 0 | 90 | 180 | 270 } {
  const designW = String(cfg.labelWidth || "50mm");
  const designH = String(cfg.labelHeight || "25mm");
  const rot = normalizeRotation(cfg.rotation);
  if (rot === 90 || rot === 270) {
    return { pageW: designH, pageH: designW, designW, designH, rot };
  }
  return { pageW: designW, pageH: designH, designW, designH, rot };
}

/**
 * Wrap each top-level .label-page in a .label-sheet when page size is swapped (90/270).
 * labelsHtml is a concatenation of label-page divs from buildLabelHtml.
 */
function wrapLabelsForSwappedPage(labelsHtml: string): string {
  // Each buildLabelHtml output starts with <div class="label-page" ...> ... </div>
  const parts = labelsHtml
    .split(/(?=<div class="label-page")/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.map((p) => `<div class="label-sheet">${p}</div>`).join("\n");
}

/** CSS + body fragment for label sheets (shared by full HTML doc and in-app print overlay). */
export function buildPrintParts(labelsHtml: string, cfg: LabelConfigValues): {
  pageW: string;
  pageH: string;
  bodyHtml: string;
  css: string;
} {
  const { pageW, pageH, designW, designH, rot } = pageSizeForRotation(cfg);
  const needsSwap = rot === 90 || rot === 270;
  const bodyHtml = needsSwap ? wrapLabelsForSwappedPage(labelsHtml) : labelsHtml;
  const css = `
    * { box-sizing: border-box; }
    @page {
      size: ${pageW} ${pageH};
      margin: 0 !important;
    }
    .aolc-print-root {
      margin: 0 !important;
      padding: 0 !important;
      width: ${pageW};
      background: #fff;
    }
    .label-sheet, .label-page {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    ${needsSwap ? `
    .label-sheet {
      width: ${pageW};
      height: ${pageH};
      position: relative;
      overflow: hidden;
      page-break-after: always;
      break-after: page;
    }
    .label-sheet:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .label-page {
      width: ${designW} !important;
      height: ${designH} !important;
      position: absolute !important;
      left: 50%;
      top: 50%;
      margin-left: calc(${designW} / -2);
      margin-top: calc(${designH} / -2);
    }
    ` : `
    .label-page {
      width: ${designW};
      height: ${designH};
      page-break-after: always;
      break-after: page;
    }
    .label-page:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    `}
  `;
  return { pageW, pageH, bodyHtml, css };
}

export function buildPrintDocumentHtml(labelsHtml: string, cfg: LabelConfigValues): string {
  const { pageW, bodyHtml, css } = buildPrintParts(labelsHtml, cfg);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Etiquetas ZD411</title>
  <style>
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: ${pageW};
      background: #fff;
    }
    ${css}
    @media print {
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        width: ${pageW} !important;
      }
      #print-toolbar { display: none !important; }
    }
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}
