/** Outlet pricing helpers: FX, margin targets, link/photo suggestions. */

export const MARGIN_FLOOR_PCT = 40;
export const MARGIN_TARGET_PCT = 50;

/** CRC per 1 USD — American Outlet uses 460. Override with USD_TO_CRC. */
export function getUsdToCrc(): number {
  const n = Number(process.env.USD_TO_CRC || "460");
  return Number.isFinite(n) && n > 0 ? n : 460;
}

/**
 * Default pick among the band (mismo / -20% / +10%).
 * 1.0 = same as US retail in CRC (most common for you).
 * Override with OUTLET_OF_US_FACTOR if you want another default pick.
 */
export function getOutletOfUsFactor(): number {
  const n = Number(process.env.OUTLET_OF_US_FACTOR || "1");
  return Number.isFinite(n) && n > 0 && n <= 2 ? n : 1;
}

function roundCrc(n: number): number {
  return Math.round(n / 100) * 100;
}

export function usdToCrcRaw(usd: number): number {
  return usd * getUsdToCrc();
}

/** Band matching real American Outlet practice. */
export function buildPriceBandFromUsd(usd: number) {
  const base = usdToCrcRaw(usd); // same as US$ at your FX
  const mismo = roundCrc(base);
  const menos20 = roundCrc(base * 0.8);
  const unPocoMas = roundCrc(base * 1.1);
  const sugerido = roundCrc(base * getOutletOfUsFactor());
  return {
    usd,
    usdToCrc: getUsdToCrc(),
    precioMismo: mismo,
    precioMenos20: menos20,
    precioUnPocoMas: unPocoMas,
    precioSugeridoCrc: sugerido,
    note: `$${usd} × ₡${getUsdToCrc()} = ₡${mismo} (mismo). Opciones: -20% ₡${menos20} · +10% ₡${unPocoMas}. Elige según el artículo y el margen del contenedor.`,
  };
}

export function usdToSuggestedCrc(usd: number): number {
  return buildPriceBandFromUsd(usd).precioSugeridoCrc;
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

async function suggestFromUrlWithAi(opts: {
  url: string;
  hostname: string;
  htmlSnippet?: string;
  titleHint?: string | null;
}): Promise<{
  nombre: string | null;
  usd: number | null;
  precioSugeridoCrc: number | null;
  precioMismo: number | null;
  precioMenos20: number | null;
  precioUnPocoMas: number | null;
  source: string;
  note: string;
  needsManualUsd: boolean;
} | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const snippet = (opts.htmlSnippet || "").replace(/\s+/g, " ").slice(0, 12000);
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_VISION_MODEL || "gpt-4o-mini",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You extract US retail product info for a Costa Rica outlet. Return JSON only: {\"nombre\": string|null, \"usd_price\": number|null}. usd_price = current/typical US retail in USD. If unknown, null.",
        },
        {
          role: "user",
          content: `Product URL: ${opts.url}\nHostname: ${opts.hostname}\nTitle hint: ${opts.titleHint || "n/a"}\nHTML snippet:\n${snippet || "(empty — site may block scrapers; use URL knowledge if reliable, else null price)"}`,
        },
      ],
    }),
  });

  if (!res.ok) return null;
  const json: any = await res.json();
  let parsed: any = {};
  try {
    parsed = JSON.parse(json?.choices?.[0]?.message?.content || "{}");
  } catch {
    return null;
  }

  const nombre = typeof parsed.nombre === "string" ? parsed.nombre.slice(0, 255) : opts.titleHint || null;
  const usd =
    typeof parsed.usd_price === "number" && parsed.usd_price > 0 && parsed.usd_price < 100000
      ? parsed.usd_price
      : null;

  if (usd == null) {
    return {
      nombre,
      usd: null,
      precioSugeridoCrc: null,
      precioMismo: null,
      precioMenos20: null,
      precioUnPocoMas: null,
      source: opts.hostname,
      note: "El sitio no deja leer el precio. Abajo pega el $ USA que ves en la pagina y pulsa Convertir.",
      needsManualUsd: true,
    };
  }

  const band = buildPriceBandFromUsd(usd);
  return {
    nombre,
    ...band,
    source: opts.hostname,
    needsManualUsd: false,
  };
}

export async function fetchLinkSuggestion(url: string): Promise<{
  nombre: string | null;
  usd: number | null;
  precioSugeridoCrc: number | null;
  precioMismo: number | null;
  precioMenos20: number | null;
  precioUnPocoMas: number | null;
  source: string;
  note: string;
  needsManualUsd?: boolean;
}> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Link invalido");
  }
  if (!/^https?:$/i.test(parsed.protocol)) throw new Error("Solo links http/https");

  let title: string | null = null;
  let html = "";
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
    html = await res.text();
    title = extractTitleFromHtml(html);
    const price = extractPriceFromHtml(html);
    if (price) {
      const band = buildPriceBandFromUsd(price.usd);
      return {
        nombre: title,
        usd: price.usd,
        ...band,
        source: parsed.hostname,
        needsManualUsd: false,
      };
    }
  } catch {
    // blocked / timeout — fall through to AI / manual
  } finally {
    clearTimeout(timer);
  }

  // Amazon/Costway/Target often block scrapers — try OpenAI with URL + snippet
  const ai = await suggestFromUrlWithAi({
    url,
    hostname: parsed.hostname,
    htmlSnippet: html,
    titleHint: title,
  });
  if (ai) return ai;

  return {
    nombre: title,
    usd: null,
    precioSugeridoCrc: null,
    precioMismo: null,
    precioMenos20: null,
    precioUnPocoMas: null,
    source: parsed.hostname,
    note: "No se pudo leer el precio del link (sitio bloqueado). Pega abajo el $ USA de la pagina y Convierte.",
    needsManualUsd: true,
  };
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

  if (usd == null) {
    return {
      nombre: typeof parsed.nombre === "string" ? parsed.nombre.slice(0, 255) : null,
      usd: null,
      precioSugeridoCrc: null,
      precioMismo: null,
      precioMenos20: null,
      precioUnPocoMas: null,
      codigoPosible: typeof parsed.codigo_articulo === "string" ? parsed.codigo_articulo.slice(0, 50) : null,
      note: "No se estimó precio USA; completa manualmente. La foto puede ayudar con el nombre.",
    };
  }

  const band = buildPriceBandFromUsd(usd);
  return {
    nombre: typeof parsed.nombre === "string" ? parsed.nombre.slice(0, 255) : null,
    ...band,
    codigoPosible: typeof parsed.codigo_articulo === "string" ? parsed.codigo_articulo.slice(0, 50) : null,
  };
}
