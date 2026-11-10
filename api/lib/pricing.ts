/** Outlet pricing helpers: FX, margin targets, link/photo suggestions. */

export const MARGIN_FLOOR_PCT = 40;
export const MARGIN_TARGET_PCT = 50;

/** CRC per 1 USD — override with USD_TO_CRC env */
export function getUsdToCrc(): number {
  const n = Number(process.env.USD_TO_CRC || "520");
  return Number.isFinite(n) && n > 0 ? n : 520;
}

/**
 * How much of the US retail (in CRC) becomes suggested CR outlet sell price.
 * Default 0.55 ≈ roughly mid outlet vs full US retail after FX.
 * Override with OUTLET_OF_US_FACTOR.
 */
export function getOutletOfUsFactor(): number {
  const n = Number(process.env.OUTLET_OF_US_FACTOR || "0.55");
  return Number.isFinite(n) && n > 0 && n <= 2 ? n : 0.55;
}

export function usdToSuggestedCrc(usd: number): number {
  const crc = usd * getUsdToCrc() * getOutletOfUsFactor();
  // Round to nearest 100 CRC for shelf-friendly prices
  return Math.round(crc / 100) * 100;
}

export type MarginProgress = {
  palletCosto: number;
  ventasActuales: number;
  ventasEnAjuste: number;
  ventasProyectadas: number;
  gananciaProyectada: number;
  margenPct: number | null;
  ventasPiso40: number;
  ventasMeta50: number;
  faltaParaPiso: number;
  faltaParaMeta: number;
  status: "rojo" | "amarillo" | "verde" | "sin_costo";
  statusLabel: string;
};

export function computeMarginProgress(opts: {
  palletCosto: number;
  ventasActuales: number;
  ventasEnAjuste?: number;
}): MarginProgress {
  const palletCosto = Math.max(0, Number(opts.palletCosto) || 0);
  const ventasActuales = Math.max(0, Number(opts.ventasActuales) || 0);
  const ventasEnAjuste = Math.max(0, Number(opts.ventasEnAjuste) || 0);
  const ventasProyectadas = ventasActuales + ventasEnAjuste;
  const gananciaProyectada = ventasProyectadas - palletCosto;
  const margenPct =
    ventasProyectadas > 0 ? (gananciaProyectada / ventasProyectadas) * 100 : null;

  // margen sobre ventas: 40% ⇒ ventas = costo / 0.60 ; 50% ⇒ ventas = costo / 0.50
  const ventasPiso40 = palletCosto > 0 ? palletCosto / (1 - MARGIN_FLOOR_PCT / 100) : 0;
  const ventasMeta50 = palletCosto > 0 ? palletCosto / (1 - MARGIN_TARGET_PCT / 100) : 0;

  let status: MarginProgress["status"] = "sin_costo";
  let statusLabel = "Sin costo de contenedor";
  if (palletCosto > 0) {
    if (margenPct != null && margenPct >= MARGIN_TARGET_PCT) {
      status = "verde";
      statusLabel = `Meta OK (≥${MARGIN_TARGET_PCT}% margen)`;
    } else if (margenPct != null && margenPct >= MARGIN_FLOOR_PCT) {
      status = "amarillo";
      statusLabel = `Sobre el piso (${MARGIN_FLOOR_PCT}%), debajo de meta ${MARGIN_TARGET_PCT}%`;
    } else {
      status = "rojo";
      statusLabel = `Debajo del piso ${MARGIN_FLOOR_PCT}% — subir precios o agregar valor`;
    }
  }

  return {
    palletCosto,
    ventasActuales,
    ventasEnAjuste,
    ventasProyectadas,
    gananciaProyectada,
    margenPct,
    ventasPiso40,
    ventasMeta50,
    faltaParaPiso: Math.max(0, ventasPiso40 - ventasProyectadas),
    faltaParaMeta: Math.max(0, ventasMeta50 - ventasProyectadas),
    status,
    statusLabel,
  };
}

/** Pull a USD (or plain) price from retailer HTML / OG tags. */
export function extractPriceFromHtml(html: string): { usd: number; raw: string } | null {
  const patterns = [
    /property=["']og:price:amount["']\s+content=["']([\d.,]+)["']/i,
    /content=["']([\d.,]+)["']\s+property=["']og:price:amount["']/i,
    /itemprop=["']price["'][^>]*content=["']([\d.,]+)["']/i,
    /content=["']([\d.,]+)["'][^>]*itemprop=["']price["']/i,
    /"price"\s*:\s*"?([\d]+(?:\.\d{1,2})?)"?/i,
    /"priceAmount"\s*:\s*"?([\d]+(?:\.\d{1,2})?)"?/i,
    /data-price=["']([\d.,]+)["']/i,
    /\$\s*([\d]{1,5}(?:\.\d{2})?)/,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (!m?.[1]) continue;
    const usd = Number(String(m[1]).replace(/,/g, ""));
    if (Number.isFinite(usd) && usd > 0 && usd < 100000) {
      return { usd, raw: m[1] };
    }
  }
  return null;
}

export function extractTitleFromHtml(html: string): string | null {
  const og = html.match(/property=["']og:title["']\s+content=["']([^"']+)["']/i)
    || html.match(/content=["']([^"']+)["']\s+property=["']og:title["']/i);
  if (og?.[1]) return decodeHtml(og[1]).slice(0, 255);
  const t = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (t?.[1]) return decodeHtml(t[1]).replace(/\s+/g, " ").trim().slice(0, 255);
  return null;
}

function decodeHtml(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export async function fetchLinkSuggestion(url: string): Promise<{
  nombre: string | null;
  usd: number | null;
  precioSugeridoCrc: number | null;
  source: string;
  note: string;
}> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Link invalido");
  }
  if (!/^https?:$/i.test(parsed.protocol)) throw new Error("Solo links http/https");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    const html = await res.text();
    const title = extractTitleFromHtml(html);
    const price = extractPriceFromHtml(html);
    if (!price) {
      return {
        nombre: title,
        usd: null,
        precioSugeridoCrc: null,
        source: parsed.hostname,
        note: "No se pudo leer el precio del link (sitio bloqueado o dinamico). Pega el precio USA manualmente o usa foto.",
      };
    }
    return {
      nombre: title,
      usd: price.usd,
      precioSugeridoCrc: usdToSuggestedCrc(price.usd),
      source: parsed.hostname,
      note: `Ref. USA $${price.usd} × ₡${getUsdToCrc()} × factor outlet ${getOutletOfUsFactor()}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function suggestFromPhoto(opts: {
  imageBase64: string;
  mimeType?: string;
}): Promise<{
  nombre: string | null;
  usd: number | null;
  precioSugeridoCrc: number | null;
  codigoPosible: string | null;
  note: string;
}> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "Falta OPENAI_API_KEY en Railway para sugerir precio por foto. Puedes usar link, codigo o nombre mientras tanto.",
    );
  }

  const mime = opts.mimeType || "image/jpeg";
  const dataUrl = opts.imageBase64.startsWith("data:")
    ? opts.imageBase64
    : `data:${mime};base64,${opts.imageBase64}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_VISION_MODEL || "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You identify retail products from photos for a Costa Rica outlet that sources US liquidation (Costway, Target, Amazon, etc.). Return JSON only: {\"nombre\": string|null, \"usd_price_estimate\": number|null, \"codigo_articulo\": string|null, \"confidence\": number}. usd_price_estimate = typical US retail USD if known, else null. codigo_articulo = SKU/model if visible on box.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Identify this product and estimate typical US retail price in USD.",
            },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Vision API error: ${res.status} ${errText.slice(0, 200)}`);
  }

  const json: any = await res.json();
  const content = json?.choices?.[0]?.message?.content || "{}";
  let parsed: any = {};
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = {};
  }

  const usd =
    typeof parsed.usd_price_estimate === "number" && parsed.usd_price_estimate > 0
      ? parsed.usd_price_estimate
      : null;

  return {
    nombre: typeof parsed.nombre === "string" ? parsed.nombre.slice(0, 255) : null,
    usd,
    precioSugeridoCrc: usd != null ? usdToSuggestedCrc(usd) : null,
    codigoPosible: typeof parsed.codigo_articulo === "string" ? parsed.codigo_articulo.slice(0, 50) : null,
    note:
      usd != null
        ? `Estimacion USA $${usd} → sugerido outlet ₡${usdToSuggestedCrc(usd)} (confirmar siempre)`
        : "No se estimó precio USA; completa manualmente. La foto puede ayudar con el nombre.",
  };
}
