import { z } from "zod";
import { createRouter, authedQuery, adminQuery, managerQuery } from "./middleware";
import { getDb } from "./queries/connection";
import {
  stores, pallets, products, productDatabase,
  adjustments, adjustmentItems, closings, assemblers, assemblyAssignments, employees, printedLabels,
  transfers, transferItems, storeConfig, storeEmployees,
  payrollEmployees, payrollPeriods, payrollPayments,
  inventoryMovements, priceHistory,
} from "@db/schema";
import { eq, and, desc, like, sql, count, or, inArray } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { ensureEnterpriseSchema } from "./lib/enterprise-schema";
import {
  computeMarginProgress,
  fetchLinkSuggestion,
  suggestFromPhoto,
  buildPriceBandFromUsd,
  priceVsContainerHint,
} from "./lib/pricing";

// Helper: format Date to YYYY-MM-DD string (local date, no timezone issues)
function formatDateToString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper: get next auto barcode in range 77000000-77999999
// Manual codes outside this range never affect auto sequence
const AUTO_BARCODE_MIN = 77000000;
const AUTO_BARCODE_MAX = 77999999;
const AUTO_BARCODE_START = 77001400; // Next after 77001399

let barcodeSequenceReady = false;

async function ensureBarcodeSequence(db: any) {
  if (barcodeSequenceReady) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS barcode_sequence (
      id INT PRIMARY KEY,
      nextVal BIGINT NOT NULL
    )
  `);

  const existing: any = await db.execute(sql`SELECT nextVal FROM barcode_sequence WHERE id = 1 LIMIT 1`);
  const rows = Array.isArray(existing) ? existing[0] : (existing.rows || existing);
  if (Array.isArray(rows) && rows.length > 0) {
    barcodeSequenceReady = true;
    return;
  }

  // Seed from current max across tables so we never collide with history
  const pResult: any = await db.execute(
    sql`SELECT MAX(CAST(codigoBarras AS UNSIGNED)) AS m FROM products
        WHERE codigoBarras REGEXP '^[0-9]+$'
        AND CAST(codigoBarras AS UNSIGNED) >= ${AUTO_BARCODE_MIN}
        AND CAST(codigoBarras AS UNSIGNED) <= ${AUTO_BARCODE_MAX}`,
  );
  const dResult: any = await db.execute(
    sql`SELECT MAX(CAST(codigoBarras AS UNSIGNED)) AS m FROM productDatabase
        WHERE codigoBarras REGEXP '^[0-9]+$'
        AND CAST(codigoBarras AS UNSIGNED) >= ${AUTO_BARCODE_MIN}
        AND CAST(codigoBarras AS UNSIGNED) <= ${AUTO_BARCODE_MAX}`,
  );
  const aResult: any = await db.execute(
    sql`SELECT MAX(CAST(codigoBarras AS UNSIGNED)) AS m FROM adjustmentItems
        WHERE codigoBarras REGEXP '^[0-9]+$'
        AND CAST(codigoBarras AS UNSIGNED) >= ${AUTO_BARCODE_MIN}
        AND CAST(codigoBarras AS UNSIGNED) <= ${AUTO_BARCODE_MAX}`,
  );
  const pRows = Array.isArray(pResult) ? pResult[0] : (pResult.rows || pResult);
  const dRows = Array.isArray(dResult) ? dResult[0] : (dResult.rows || dResult);
  const aRows = Array.isArray(aResult) ? aResult[0] : (aResult.rows || aResult);
  const pMax = (Array.isArray(pRows) && pRows[0]?.m != null) ? Number(pRows[0].m) : 0;
  const dMax = (Array.isArray(dRows) && dRows[0]?.m != null) ? Number(dRows[0].m) : 0;
  const aMax = (Array.isArray(aRows) && aRows[0]?.m != null) ? Number(aRows[0].m) : 0;
  const seed = Math.max(pMax, dMax, aMax, AUTO_BARCODE_START - 1) + 1;

  await db.execute(sql`INSERT INTO barcode_sequence (id, nextVal) VALUES (1, ${seed})`);
  barcodeSequenceReady = true;
}

/** Atomically allocate the next auto barcode (safe under concurrent creates). */
async function getNextAutoBarcode(db: any): Promise<string> {
  await ensureBarcodeSequence(db);

  // MySQL: read current then advance under a named lock (nextVal = next code to issue)
  await db.execute(sql`SELECT GET_LOCK('aolc_barcode_seq', 10)`);
  try {
    const result: any = await db.execute(sql`SELECT nextVal FROM barcode_sequence WHERE id = 1 LIMIT 1`);
    const rows = Array.isArray(result) ? result[0] : (result.rows || result);
    const nextCode = Number(Array.isArray(rows) && rows[0] ? rows[0].nextVal : 0);
    if (!nextCode || nextCode > AUTO_BARCODE_MAX) {
      throw new Error("Se agotaron los codigos automaticos en el rango 7700xxxx");
    }
    await db.execute(sql`UPDATE barcode_sequence SET nextVal = nextVal + 1 WHERE id = 1`);
    return String(nextCode);
  } finally {
    await db.execute(sql`SELECT RELEASE_LOCK('aolc_barcode_seq')`);
  }
}

async function assertPalletInStore(db: ReturnType<typeof getDb>, id: number, storeId: number) {
  const [row] = await db.select().from(pallets).where(and(eq(pallets.id, id), eq(pallets.storeId, storeId))).limit(1);
  if (!row) throw new Error("Contenedor no encontrado en esta tienda");
  return row;
}

async function assertProductInStore(db: ReturnType<typeof getDb>, id: number, storeId: number) {
  const [row] = await db.select().from(products).where(and(eq(products.id, id), eq(products.storeId, storeId))).limit(1);
  if (!row) throw new Error("Articulo no encontrado en esta tienda");
  return row;
}

async function assertProductDbInStore(db: ReturnType<typeof getDb>, id: number, storeId: number) {
  const [row] = await db.select().from(productDatabase).where(and(eq(productDatabase.id, id), eq(productDatabase.storeId, storeId))).limit(1);
  if (!row) throw new Error("Articulo de catalogo no encontrado en esta tienda");
  return row;
}

async function assertAdjustmentActive(db: ReturnType<typeof getDb>, id: number) {
  const [row] = await db.select().from(adjustments).where(eq(adjustments.id, id)).limit(1);
  if (!row) throw new Error("Ajuste no encontrado");
  if (row.estado !== "activo") throw new Error("Solo se pueden editar ajustes activos");
  return row;
}

async function withNamedLock<T>(db: ReturnType<typeof getDb>, lockName: string, fn: () => Promise<T>): Promise<T> {
  const lockResult: any = await db.execute(sql`SELECT GET_LOCK(${lockName}, 30)`);
  const lockRows = Array.isArray(lockResult) ? lockResult[0] : (lockResult.rows || lockResult);
  const got = Array.isArray(lockRows) ? Number(Object.values(lockRows[0] || {})[0]) : 0;
  if (got !== 1) throw new Error("No se pudo obtener bloqueo. Intenta de nuevo en unos segundos.");
  try {
    return await fn();
  } finally {
    await db.execute(sql`SELECT RELEASE_LOCK(${lockName})`);
  }
}

const BODEGA_STORE_ID = 1;

/** Keep store 1 named Bodega — it is the principal warehouse workspace. */
async function ensureBodegaStoreName(db: ReturnType<typeof getDb>) {
  try {
    await db.execute(sql`
      UPDATE stores
      SET name = 'Bodega', slug = 'bodega', description = 'Bodega central / inventario principal'
      WHERE id = ${BODEGA_STORE_ID}
        AND (name LIKE ${'%Los Chiles%'} OR slug = ${'los-chiles'} OR name != ${'Bodega'})
    `);
  } catch {
    // Non-fatal: older DBs may lack the row yet
  }
}

export const inventoryRouter = createRouter({
  // ========== STORES ==========
  stores: authedQuery.query(async () => {
    const db = getDb();
    await ensureBodegaStoreName(db);
    const rows = await db.select().from(stores).where(eq(stores.isActive, true));
    return rows.sort((a, b) => {
      if (a.id === BODEGA_STORE_ID) return -1;
      if (b.id === BODEGA_STORE_ID) return 1;
      return a.name.localeCompare(b.name, "es");
    });
  }),

  allStores: authedQuery.query(async () => {
    const db = getDb();
    await ensureBodegaStoreName(db);
    const rows = await db.select().from(stores).orderBy(stores.id);
    return rows.sort((a, b) => {
      if (a.id === BODEGA_STORE_ID) return -1;
      if (b.id === BODEGA_STORE_ID) return 1;
      return 0;
    });
  }),

  createStore: adminQuery
    .input(z.object({ name: z.string(), slug: z.string(), description: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const result = await db.insert(stores).values({ name: input.name, slug: input.slug, description: input.description || "" });
      return { id: Number(result[0].insertId) };
    }),

  // ========== PALLETS ==========
  pallets: authedQuery
    .input(z.object({ storeId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      return db.select().from(pallets)
        .where(and(eq(pallets.storeId, input.storeId), eq(pallets.isActive, true)))
        .orderBy(desc(pallets.createdAt));
    }),

  palletById: authedQuery
    .input(z.object({ id: z.number(), storeId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (input.storeId != null) {
        const result = await db.select().from(pallets)
          .where(and(eq(pallets.id, input.id), eq(pallets.storeId, input.storeId)))
          .limit(1);
        return result[0] || null;
      }
      const result = await db.select().from(pallets).where(eq(pallets.id, input.id)).limit(1);
      return result[0] || null;
    }),

  createPallet: managerQuery
    .input(z.object({
      storeId: z.number(),
      palletId: z.string(),
      description: z.string(),
      fecha: z.string().optional(),
      costo: z.string().optional(),
      cajasAprox: z.number().int().positive().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await ensureEnterpriseSchema();
      const fecha = input.fecha || new Date().toISOString().split("T")[0];
      const costo = input.costo || "0";
      const cajas = input.cajasAprox ?? null;

      const result: any = await db.execute(sql`
        INSERT INTO pallets (storeId, palletId, description, fecha, costo, cajasAprox)
        VALUES (${input.storeId}, ${input.palletId}, ${input.description}, ${fecha}, ${costo}, ${cajas})
      `);
      const insertResult = Array.isArray(result) ? result[0] : (result.rows || result);
      return { id: Number(insertResult?.insertId || 0) };
    }),

  updatePallet: managerQuery
    .input(z.object({
      id: z.number(),
      storeId: z.number(),
      palletId: z.string().optional(),
      description: z.string().optional(),
      costo: z.string().optional(),
      fecha: z.string().optional(),
      cajasAprox: z.number().int().positive().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await ensureEnterpriseSchema();
      await assertPalletInStore(db, input.id, input.storeId);
      const { id, storeId, ...data } = input;
      const setData: Record<string, any> = {};
      if (data.palletId !== undefined) setData.palletId = data.palletId;
      if (data.description !== undefined) setData.description = data.description;
      if (data.costo !== undefined) setData.costo = data.costo;
      if (data.fecha !== undefined) setData.fecha = data.fecha;
      if (data.cajasAprox !== undefined) setData.cajasAprox = data.cajasAprox;
      await db.update(pallets).set(setData).where(and(eq(pallets.id, id), eq(pallets.storeId, storeId)));
      return { success: true };
    }),

  deletePallet: managerQuery
    .input(z.object({ id: z.number(), storeId: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await assertPalletInStore(db, input.id, input.storeId);
      await db.update(pallets).set({ isActive: false }).where(and(eq(pallets.id, input.id), eq(pallets.storeId, input.storeId)));
      return { success: true };
    }),

  palletsWithStats: authedQuery
    .input(z.object({ storeId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      await ensureEnterpriseSchema();
      const palletList = await db.select().from(pallets)
        .where(and(eq(pallets.storeId, input.storeId), eq(pallets.isActive, true)))
        .orderBy(desc(pallets.createdAt));

      // Count products per pallet
      const productCounts = await db.select({
        palletId: products.palletId,
        count: count(products.id),
        totalUnits: sql<number>`SUM(${products.cantidad})`,
      }).from(products)
        .where(and(eq(products.storeId, input.storeId), eq(products.isActive, true)))
        .groupBy(products.palletId);

      const countMap = new Map<number, number>();
      const unitsMap = new Map<number, number>();
      for (const p of productCounts) {
        countMap.set(p.palletId, p.count);
        unitsMap.set(p.palletId, Number(p.totalUnits) || 0);
      }

      // Calculate total sales value (precio * cantidad) per pallet
      const productValues = await db.select({
        palletId: products.palletId,
        totalPrecio: sql<number>`SUM(${products.precio} * ${products.cantidad})`,
      }).from(products)
        .where(and(eq(products.storeId, input.storeId), eq(products.isActive, true)))
        .groupBy(products.palletId);

      const valueMap = new Map<number, number>();
      for (const v of productValues) {
        valueMap.set(v.palletId, Number(v.totalPrecio) || 0);
      }

      // Unit-cost totals when available
      const costValues = await db.select({
        palletId: products.palletId,
        totalCosto: sql<number>`SUM(COALESCE(${products.costo}, 0) * ${products.cantidad})`,
      }).from(products)
        .where(and(eq(products.storeId, input.storeId), eq(products.isActive, true)))
        .groupBy(products.palletId);
      const costMap = new Map<number, number>();
      for (const v of costValues) {
        costMap.set(v.palletId, Number(v.totalCosto) || 0);
      }

      return palletList.map(p => {
        const ventas = valueMap.get(p.id) || 0;
        const costo = Number(p.costo || 0);
        const costoArticulos = costMap.get(p.id) || 0;
        return {
          id: p.id,
          palletId: p.palletId,
          fecha: p.fecha,
          description: p.description,
          costo: p.costo,
          createdAt: p.createdAt,
          articulos: countMap.get(p.id) || 0,
          unidades: unitsMap.get(p.id) || 0,
          ventas,
          costoArticulos,
          ganancia: ventas - costo,
        };
      });
    }),

  // ========== PRODUCT SEARCH (for autocomplete) ==========
  searchProductsSimilar: authedQuery
    .input(z.object({ storeId: z.number(), query: z.string() }))
    .query(async ({ input }) => {
      const db = getDb();
      await ensureEnterpriseSchema();
      const q = input.query.toLowerCase().trim();
      if (!q || q.length < 2) return [];

      // Search in catalog (name, barcode, vendor codigo)
      const catalog = await db.select().from(productDatabase)
        .where(and(eq(productDatabase.storeId, input.storeId), eq(productDatabase.isActive, true)));
      const catalogMatches = catalog
        .filter(p =>
          p.nombre.toLowerCase().includes(q)
          || (p.codigoBarras && p.codigoBarras.toLowerCase().includes(q))
          || (p.codigo && p.codigo.toLowerCase().includes(q)),
        )
        .map(p => ({ id: p.id, nombre: p.nombre, precio: p.precio, codigoBarras: p.codigoBarras, codigo: p.codigo, source: "catalog" as const }));

      // Search in existing products (with pallet info)
      const allProducts = await db.select().from(products)
        .where(and(eq(products.storeId, input.storeId), eq(products.isActive, true)));
      const productMatches = allProducts
        .filter(p =>
          p.nombre.toLowerCase().includes(q)
          || (p.codigoBarras && p.codigoBarras.toLowerCase().includes(q))
          || (p.codigo && p.codigo.toLowerCase().includes(q)),
        )
        .map(p => ({ id: p.id, nombre: p.nombre, precio: p.precio, codigoBarras: p.codigoBarras, codigo: p.codigo, palletId: p.palletId, source: "product" as const }));

      // Get pallet names for product matches
      const palletIds = [...new Set(productMatches.map(p => p.palletId))];
      const palletList = palletIds.length > 0
        ? await db.select().from(pallets).where(and(eq(pallets.storeId, input.storeId), eq(pallets.isActive, true)))
        : [];
      const palletMap = new Map(palletList.map(p => [p.id, p]));

      // Combine: catalog first, then products with pallet info
      const combined = [
        ...catalogMatches.map(c => ({
          id: `cat-${c.id}`,
          nombre: c.nombre,
          precio: Number(c.precio || 0),
          codigoBarras: c.codigoBarras,
          codigo: c.codigo || null,
          contenedor: null as string | null,
          source: "catalog" as const,
        })),
        ...productMatches.map(p => ({
          id: `prod-${p.id}`,
          nombre: p.nombre,
          precio: Number(p.precio || 0),
          codigoBarras: p.codigoBarras,
          codigo: p.codigo || null,
          contenedor: palletMap.get(p.palletId)?.description || palletMap.get(p.palletId)?.palletId || null,
          source: "product" as const,
        })),
      ];

      // Remove duplicates by name (keep first = catalog preferred)
      const seen = new Set<string>();
      return combined.filter(item => {
        const key = item.nombre.toLowerCase().trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 10);
    }),

  /** Unified lookup: name, barcode, or vendor article code (Costway box, etc.) */
  lookupProduct: authedQuery
    .input(z.object({
      storeId: z.number(),
      query: z.string().min(1),
      mode: z.enum(["auto", "nombre", "barcode", "codigo"]).default("auto"),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      await ensureEnterpriseSchema();
      const q = input.query.trim();
      const qLower = q.toLowerCase();
      if (!q) return [];

      const mode = input.mode;
      const matchCodigo = (code: string | null | undefined) =>
        !!code && code.toLowerCase().includes(qLower);
      const matchBarcode = (code: string | null | undefined) =>
        !!code && code.toLowerCase().includes(qLower);
      const matchName = (name: string) => name.toLowerCase().includes(qLower);

      const catalog = await db.select().from(productDatabase)
        .where(and(eq(productDatabase.storeId, input.storeId), eq(productDatabase.isActive, true)));
      const allProducts = await db.select().from(products)
        .where(and(eq(products.storeId, input.storeId), eq(products.isActive, true)));

      type Hit = {
        id: string;
        nombre: string;
        precio: number;
        codigoBarras: string | null;
        codigo: string | null;
        source: "catalog" | "product";
        match: "nombre" | "barcode" | "codigo";
      };
      const hits: Hit[] = [];

      const pushCatalog = (p: typeof catalog[0], match: Hit["match"]) => {
        hits.push({
          id: `cat-${p.id}`,
          nombre: p.nombre,
          precio: Number(p.precio || 0),
          codigoBarras: p.codigoBarras,
          codigo: p.codigo || null,
          source: "catalog",
          match,
        });
      };
      const pushProduct = (p: typeof allProducts[0], match: Hit["match"]) => {
        hits.push({
          id: `prod-${p.id}`,
          nombre: p.nombre,
          precio: Number(p.precio || 0),
          codigoBarras: p.codigoBarras,
          codigo: p.codigo || null,
          source: "product",
          match,
        });
      };

      for (const p of catalog) {
        if ((mode === "auto" || mode === "codigo") && matchCodigo(p.codigo)) pushCatalog(p, "codigo");
        else if ((mode === "auto" || mode === "barcode") && matchBarcode(p.codigoBarras)) pushCatalog(p, "barcode");
        else if ((mode === "auto" || mode === "nombre") && matchName(p.nombre)) pushCatalog(p, "nombre");
      }
      for (const p of allProducts) {
        if ((mode === "auto" || mode === "codigo") && matchCodigo(p.codigo)) pushProduct(p, "codigo");
        else if ((mode === "auto" || mode === "barcode") && matchBarcode(p.codigoBarras)) pushProduct(p, "barcode");
        else if ((mode === "auto" || mode === "nombre") && matchName(p.nombre)) pushProduct(p, "nombre");
      }

      const seen = new Set<string>();
      return hits.filter((h) => {
        const key = `${h.nombre.toLowerCase()}|${h.codigoBarras || ""}|${h.codigo || ""}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 15);
    }),

  suggestPriceFromUsd: managerQuery
    .input(z.object({ usd: z.number().positive() }))
    .mutation(async ({ input }) => buildPriceBandFromUsd(input.usd)),

  suggestPriceFromLink: managerQuery
    .input(z.object({ url: z.string().url() }))
    .mutation(async ({ input }) => {
      return fetchLinkSuggestion(input.url);
    }),

  suggestPriceFromPhoto: managerQuery
    .input(z.object({
      imageBase64: z.string().min(20),
      mimeType: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      // Cap ~4MB base64 to protect Railway memory
      if (input.imageBase64.length > 5_500_000) {
        throw new Error("Foto demasiado grande (max ~4MB). Usa otra foto mas liviana.");
      }
      return suggestFromPhoto({ imageBase64: input.imageBase64, mimeType: input.mimeType });
    }),

  palletMarginProgress: authedQuery
    .input(z.object({
      storeId: z.number(),
      palletId: z.number(),
      /** Include open adjustment lines in projected sales */
      includeActiveAdjustments: z.boolean().default(true),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      await ensureEnterpriseSchema();
      const pallet = await assertPalletInStore(db, input.palletId, input.storeId);
      const rows = await db.select().from(products).where(and(
        eq(products.storeId, input.storeId),
        eq(products.palletId, input.palletId),
        eq(products.isActive, true),
      ));
      const ventasActuales = rows.reduce(
        (s, r) => s + Number(r.precio || 0) * Number(r.cantidad || 0),
        0,
      );
      let unidadesActuales = rows.reduce((s, r) => s + Number(r.cantidad || 0), 0);

      let ventasEnAjuste = 0;
      let unidadesEnAjuste = 0;
      if (input.includeActiveAdjustments) {
        const openAdjs = await db.select().from(adjustments).where(and(
          eq(adjustments.storeId, input.storeId),
          eq(adjustments.palletId, input.palletId),
          eq(adjustments.estado, "activo"),
          eq(adjustments.isActive, true),
        ));
        for (const adj of openAdjs) {
          const items = await db.select().from(adjustmentItems)
            .where(eq(adjustmentItems.adjustmentId, adj.id));
          ventasEnAjuste += items.reduce(
            (s, i) => s + Number(i.precio || 0) * Number(i.cantidad || 0),
            0,
          );
          unidadesEnAjuste += items.reduce((s, i) => s + Number(i.cantidad || 0), 0);
        }
      }

      return {
        ...computeMarginProgress({
          palletCosto: Number(pallet.costo || 0),
          ventasActuales,
          ventasEnAjuste,
          cajasAprox: pallet.cajasAprox != null ? Number(pallet.cajasAprox) : null,
          unidadesProyectadas: unidadesActuales + unidadesEnAjuste,
        }),
        palletLabel: pallet.palletId,
        description: pallet.description,
      };
    }),

  /** Lookup past sell prices by codigo / barcode / name for outlet memory. */
  lookupPriceHistory: authedQuery
    .input(z.object({
      storeId: z.number(),
      query: z.string().min(1),
      mode: z.enum(["auto", "codigo", "barcode", "nombre"]).default("auto"),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      await ensureEnterpriseSchema();
      const q = input.query.trim();
      if (!q) return { last: null as any, average: null as number | null, count: 0, rows: [] as any[] };

      const all = await db.select().from(priceHistory)
        .where(eq(priceHistory.storeId, input.storeId))
        .orderBy(desc(priceHistory.createdAt))
        .limit(500);

      const qLower = q.toLowerCase();
      const matched = all.filter((r) => {
        const byCodigo = !!r.codigo && r.codigo.toLowerCase().includes(qLower);
        const byBarcode = !!r.codigoBarras && r.codigoBarras.toLowerCase().includes(qLower);
        const byNombre = r.nombre.toLowerCase().includes(qLower);
        if (input.mode === "codigo") return byCodigo;
        if (input.mode === "barcode") return byBarcode;
        if (input.mode === "nombre") return byNombre;
        return byCodigo || byBarcode || byNombre;
      });

      if (matched.length === 0) {
        return { last: null, average: null, count: 0, rows: [] };
      }

      const prices = matched.map((r) => Number(r.precio || 0)).filter((n) => n > 0);
      const average = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null;
      return {
        last: matched[0],
        average,
        count: matched.length,
        rows: matched.slice(0, 8),
      };
    }),

  evaluateUnitPrice: authedQuery
    .input(z.object({
      storeId: z.number(),
      palletId: z.number(),
      unitPrice: z.number(),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      await ensureEnterpriseSchema();
      const pallet = await assertPalletInStore(db, input.palletId, input.storeId);
      const live = await db.select().from(products).where(and(
        eq(products.storeId, input.storeId),
        eq(products.palletId, input.palletId),
        eq(products.isActive, true),
      ));
      const ventasActuales = live.reduce((s, r) => s + Number(r.precio || 0) * Number(r.cantidad || 0), 0);
      let ventasEnAjuste = 0;
      const openAdjs = await db.select().from(adjustments).where(and(
        eq(adjustments.storeId, input.storeId),
        eq(adjustments.palletId, input.palletId),
        eq(adjustments.estado, "activo"),
        eq(adjustments.isActive, true),
      ));
      for (const adj of openAdjs) {
        const items = await db.select().from(adjustmentItems).where(eq(adjustmentItems.adjustmentId, adj.id));
        ventasEnAjuste += items.reduce((s, i) => s + Number(i.precio || 0) * Number(i.cantidad || 0), 0);
      }
      const full = computeMarginProgress({
        palletCosto: Number(pallet.costo || 0),
        ventasActuales,
        ventasEnAjuste,
        cajasAprox: pallet.cajasAprox != null ? Number(pallet.cajasAprox) : null,
      });
      return {
        ...priceVsContainerHint({
          unitPrice: input.unitPrice,
          promedioPisoPorCaja: full.promedioPisoPorCaja,
          promedioMetaPorCaja: full.promedioMetaPorCaja,
          status: full.status,
        }),
        promedioPisoPorCaja: full.promedioPisoPorCaja,
        promedioMetaPorCaja: full.promedioMetaPorCaja,
        status: full.status,
        cajasAprox: full.cajasAprox,
      };
    }),

  // ========== PRODUCTS ==========
  products: authedQuery
    .input(z.object({ storeId: z.number(), palletId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (input.palletId) {
        return db.select().from(products)
          .where(and(eq(products.storeId, input.storeId), eq(products.palletId, input.palletId), eq(products.isActive, true)))
          .orderBy(products.ordenAgregacion);
      }
      return db.select().from(products)
        .where(and(eq(products.storeId, input.storeId), eq(products.isActive, true)))
        .orderBy(desc(products.createdAt));
    }),

  createProduct: managerQuery
    .input(z.object({
      storeId: z.number(),
      palletId: z.number(),
      nombre: z.string(),
      precio: z.string(),
      cantidad: z.number().default(1),
      codigoBarras: z.string().optional(),
      codigo: z.string().optional(),
      esNuevo: z.boolean().default(false),
      costo: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await ensureEnterpriseSchema();
      await assertPalletInStore(db, input.palletId, input.storeId);
      let codigoBarras = input.codigoBarras;

      if (!codigoBarras || codigoBarras.trim() === "") {
        codigoBarras = await getNextAutoBarcode(db);
      }

      const { costo, ...rest } = input;
      const result = await db.insert(products).values({
        ...rest,
        codigoBarras,
        costo: costo && costo.trim() !== "" ? costo : null,
      });
      return { id: Number(result[0].insertId), codigoBarras };
    }),

  updateProduct: managerQuery
    .input(z.object({
      id: z.number(),
      storeId: z.number(),
      nombre: z.string().optional(),
      precio: z.string().optional(),
      cantidad: z.number().optional(),
      codigoBarras: z.string().optional(),
      costo: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await ensureEnterpriseSchema();
      await assertProductInStore(db, input.id, input.storeId);
      const { id, storeId, ...data } = input;
      const setData: Record<string, any> = { ...data };
      if (data.costo !== undefined && data.costo.trim() === "") setData.costo = null;
      await db.update(products).set(setData).where(and(eq(products.id, id), eq(products.storeId, storeId)));
      return { success: true };
    }),

  deleteProduct: managerQuery
    .input(z.object({ id: z.number(), storeId: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await assertProductInStore(db, input.id, input.storeId);
      await db.update(products).set({ isActive: false }).where(and(eq(products.id, input.id), eq(products.storeId, input.storeId)));
      return { success: true };
    }),

  searchProducts: authedQuery
    .input(z.object({ storeId: z.number(), query: z.string() }))
    .query(async ({ input }) => {
      const db = getDb();
      const all = await db.select().from(products)
        .where(and(eq(products.storeId, input.storeId), eq(products.isActive, true)));
      const q = input.query.toLowerCase();
      return all.filter(p => p.nombre.toLowerCase().includes(q) || (p.codigoBarras && p.codigoBarras.includes(q)));
    }),

  // ========== PRODUCT DATABASE ==========
  productDatabase: authedQuery
    .input(z.object({ storeId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      return db.select().from(productDatabase)
        .where(and(eq(productDatabase.storeId, input.storeId), eq(productDatabase.isActive, true)));
    }),

  searchProductDB: authedQuery
    .input(z.object({ storeId: z.number(), query: z.string() }))
    .query(async ({ input }) => {
      const db = getDb();
      const all = await db.select().from(productDatabase)
        .where(and(eq(productDatabase.storeId, input.storeId), eq(productDatabase.isActive, true)));
      const q = input.query.toLowerCase();
      return all.filter(p => p.nombre.toLowerCase().includes(q) || (p.codigoBarras && p.codigoBarras.includes(q)));
    }),

  createProductDB: managerQuery
    .input(z.object({ storeId: z.number(), nombre: z.string(), precio: z.string().optional(), codigoBarras: z.string().optional(), categoria: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      let codigoBarras = input.codigoBarras;

      // Auto-generate barcode if not provided or empty
      if (!codigoBarras || codigoBarras.trim() === "") {
        codigoBarras = await getNextAutoBarcode(db);
      }

      const result = await db.insert(productDatabase).values({ ...input, codigoBarras });
      return { id: Number(result[0].insertId), codigoBarras };
    }),

  updateProductDB: managerQuery
    .input(z.object({ id: z.number(), storeId: z.number(), nombre: z.string().optional(), precio: z.string().optional(), codigoBarras: z.string().optional(), categoria: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await assertProductDbInStore(db, input.id, input.storeId);
      const { id, storeId, ...data } = input;
      await db.update(productDatabase).set(data).where(and(eq(productDatabase.id, id), eq(productDatabase.storeId, storeId)));
      return { success: true };
    }),

  deleteProductDB: managerQuery
    .input(z.object({ id: z.number(), storeId: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await assertProductDbInStore(db, input.id, input.storeId);
      await db.update(productDatabase).set({ isActive: false }).where(and(eq(productDatabase.id, input.id), eq(productDatabase.storeId, input.storeId)));
      return { success: true };
    }),

  adjustmentsWithStats: authedQuery
    .input(z.object({ storeId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const adjList = await db.select().from(adjustments)
        .where(eq(adjustments.storeId, input.storeId))
        .orderBy(desc(adjustments.palletId), desc(adjustments.createdAt));

      const items = await db.select().from(adjustmentItems);

      return adjList.map(a => {
        const adjItems = items.filter(i => i.adjustmentId === a.id);
        const productCount = adjItems.length;
        const unitCount = adjItems.reduce((sum, i) => sum + (i.cantidad || 0), 0);
        return {
          id: a.id,
          adjustmentId: a.adjustmentId,
          description: a.description,
          estado: a.estado,
          fecha: a.fecha,
          productCount,
          unitCount,
        };
      });
    }),

  // ========== ADJUSTMENTS ==========
  adjustments: authedQuery
    .input(z.object({ storeId: z.number(), palletId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (input.palletId) {
        return db.select().from(adjustments)
          .where(and(eq(adjustments.storeId, input.storeId), eq(adjustments.palletId, input.palletId), eq(adjustments.isActive, true)))
          .orderBy(desc(adjustments.createdAt));
      }
      return db.select().from(adjustments)
        .where(and(eq(adjustments.storeId, input.storeId), eq(adjustments.isActive, true)))
        .orderBy(desc(adjustments.createdAt));
    }),

  adjustmentById: authedQuery
    .input(z.object({ id: z.number(), storeId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (input.storeId != null) {
        const result = await db.select().from(adjustments)
          .where(and(eq(adjustments.id, input.id), eq(adjustments.storeId, input.storeId)))
          .limit(1);
        return result[0] || null;
      }
      const result = await db.select().from(adjustments).where(eq(adjustments.id, input.id)).limit(1);
      return result[0] || null;
    }),

  adjustmentItems: authedQuery
    .input(z.object({ adjustmentId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      return db.select().from(adjustmentItems).where(eq(adjustmentItems.adjustmentId, input.adjustmentId));
    }),

  createAdjustment: managerQuery
    .input(z.object({ storeId: z.number(), palletId: z.number(), adjustmentId: z.string(), description: z.string().optional(), fecha: z.string().optional(), fechaHora: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await assertPalletInStore(db, input.palletId, input.storeId);
      const result = await db.insert(adjustments).values({ ...input, estado: "activo" });
      return { id: Number(result[0].insertId) };
    }),

  addAdjustmentItem: managerQuery
    .input(z.object({
      adjustmentId: z.number(),
      nombre: z.string(),
      precio: z.string(),
      cantidad: z.number().default(1),
      codigoBarras: z.string().optional(),
      codigo: z.string().optional(),
      orden: z.number().default(1),
      costo: z.string().optional(),
      precioRefUsd: z.string().optional(),
      sourceUrl: z.string().optional(),
      priceSource: z.string().optional(), // historial | usa | manual
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await ensureEnterpriseSchema();
      const adj = await assertAdjustmentActive(db, input.adjustmentId);
      let { codigoBarras, costo, codigo, precioRefUsd, sourceUrl, priceSource, ...rest } = input;

      if (!codigoBarras || codigoBarras.trim() === "") {
        codigoBarras = await getNextAutoBarcode(db);
      }

      const result = await db.insert(adjustmentItems).values({
        ...rest,
        codigoBarras,
        codigo: codigo?.trim() || null,
        costo: costo && costo.trim() !== "" ? costo : null,
        precioRefUsd: precioRefUsd && precioRefUsd.trim() !== "" ? precioRefUsd : null,
        sourceUrl: sourceUrl?.trim() || null,
      });

      // Remember confirmed sell price for next time (outlet memory)
      try {
        await db.insert(priceHistory).values({
          storeId: adj.storeId,
          codigo: codigo?.trim() || null,
          codigoBarras: codigoBarras || null,
          nombre: input.nombre,
          precio: input.precio,
          precioRefUsd: precioRefUsd && precioRefUsd.trim() !== "" ? precioRefUsd : null,
          source: priceSource || "manual",
          palletId: adj.palletId,
        });
      } catch {
        // non-fatal
      }

      return { id: Number(result[0].insertId), codigoBarras };
    }),

  removeAdjustmentItem: managerQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const [item] = await db.select().from(adjustmentItems).where(eq(adjustmentItems.id, input.id)).limit(1);
      if (!item) throw new Error("Articulo no encontrado");
      await assertAdjustmentActive(db, item.adjustmentId);
      await db.delete(adjustmentItems).where(eq(adjustmentItems.id, input.id));
      return { success: true };
    }),

  updateAdjustmentItem: managerQuery
    .input(z.object({
      id: z.number(),
      nombre: z.string().optional(),
      precio: z.string().optional(),
      cantidad: z.number().optional(),
      codigoBarras: z.string().optional(),
      costo: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await ensureEnterpriseSchema();
      const [item] = await db.select().from(adjustmentItems).where(eq(adjustmentItems.id, input.id)).limit(1);
      if (!item) throw new Error("Articulo no encontrado");
      await assertAdjustmentActive(db, item.adjustmentId);
      const { id, ...data } = input;
      const setData: Record<string, any> = { ...data };
      if (data.costo !== undefined && data.costo.trim() === "") setData.costo = null;
      await db.update(adjustmentItems).set(setData).where(eq(adjustmentItems.id, id));
      return { success: true };
    }),

  completeAdjustment: managerQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await ensureEnterpriseSchema();
      return withNamedLock(db, `aolc_adj_${input.id}`, async () => {
        const [adj] = await db.select().from(adjustments).where(eq(adjustments.id, input.id));
        if (!adj) throw new Error("Ajuste no encontrado");
        if (adj.estado === "completado") {
          throw new Error("Este ajuste ya fue completado. No se puede aplicar dos veces.");
        }
        if (adj.estado === "cancelado") {
          throw new Error("Este ajuste esta cancelado.");
        }

        const items = await db.select().from(adjustmentItems).where(eq(adjustmentItems.adjustmentId, input.id));
        if (items.length === 0) throw new Error("El ajuste no tiene articulos");

        let unitsAdded = 0;
        for (const item of items) {
          const insertResult = await db.insert(products).values({
            storeId: adj.storeId,
            palletId: adj.palletId,
            nombre: item.nombre,
            precio: String(item.precio),
            costo: item.costo != null ? String(item.costo) : null,
            cantidad: item.cantidad,
            codigoBarras: item.codigoBarras,
            codigo: item.codigo || null,
            esNuevo: false,
          });
          const productId = Number(insertResult[0].insertId);
          unitsAdded += Number(item.cantidad || 0);
          await db.insert(inventoryMovements).values({
            storeId: adj.storeId,
            movementType: "adjustment_in",
            refType: "adjustment",
            refId: adj.id,
            productId,
            palletId: adj.palletId,
            codigoBarras: item.codigoBarras,
            nombre: item.nombre,
            cantidad: item.cantidad,
            precio: String(item.precio),
            costo: item.costo != null ? String(item.costo) : null,
            actorId: ctx.user?.id,
            actorName: ctx.user?.name || ctx.user?.unionId,
            note: `Ajuste ${adj.adjustmentId}`,
          });
        }

        await db.update(adjustments).set({
          estado: "completado",
          completedAt: new Date(),
          completedBy: ctx.user?.name || ctx.user?.unionId || null,
        }).where(and(eq(adjustments.id, input.id), eq(adjustments.estado, "activo")));

        return { success: true, productsAdded: items.length, unitsAdded, palletId: adj.palletId };
      });
    }),

  /** Alias kept for older clients — same as completeAdjustment */
  applyAdjustmentToContainer: managerQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await ensureEnterpriseSchema();
      return withNamedLock(db, `aolc_adj_${input.id}`, async () => {
        const [adj] = await db.select().from(adjustments).where(eq(adjustments.id, input.id));
        if (!adj) throw new Error("Ajuste no encontrado");
        if (adj.estado === "completado") throw new Error("Este ajuste ya fue completado. Usa una sola aplicacion.");
        if (adj.estado === "cancelado") throw new Error("Este ajuste esta cancelado.");
        const items = await db.select().from(adjustmentItems).where(eq(adjustmentItems.adjustmentId, input.id));
        if (items.length === 0) throw new Error("El ajuste no tiene articulos");

        let productsAdded = 0;
        for (const item of items) {
          const insertResult = await db.insert(products).values({
            storeId: adj.storeId,
            palletId: adj.palletId,
            nombre: item.nombre,
            precio: String(item.precio),
            costo: item.costo != null ? String(item.costo) : null,
            cantidad: item.cantidad,
            codigoBarras: item.codigoBarras,
            codigo: item.codigo || null,
            esNuevo: false,
          });
          productsAdded++;
          await db.insert(inventoryMovements).values({
            storeId: adj.storeId,
            movementType: "adjustment_in",
            refType: "adjustment",
            refId: adj.id,
            productId: Number(insertResult[0].insertId),
            palletId: adj.palletId,
            codigoBarras: item.codigoBarras,
            nombre: item.nombre,
            cantidad: item.cantidad,
            precio: String(item.precio),
            costo: item.costo != null ? String(item.costo) : null,
            actorId: ctx.user?.id,
            actorName: ctx.user?.name || ctx.user?.unionId,
          });
        }
        await db.update(adjustments).set({
          estado: "completado",
          completedAt: new Date(),
          completedBy: ctx.user?.name || ctx.user?.unionId || null,
        }).where(and(eq(adjustments.id, input.id), eq(adjustments.estado, "activo")));
        return { success: true, productsAdded, palletId: adj.palletId };
      });
    }),

  cancelAdjustment: managerQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const [adj] = await db.select().from(adjustments).where(eq(adjustments.id, input.id)).limit(1);
      if (!adj) throw new Error("Ajuste no encontrado");
      if (adj.estado !== "activo") throw new Error("Solo se pueden cancelar ajustes activos");
      await db.update(adjustments).set({ estado: "cancelado", isActive: false }).where(eq(adjustments.id, input.id));
      return { success: true };
    }),

  // ========== STORE CONFIG ==========
  storeConfig: authedQuery
    .input(z.object({ storeId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.select().from(storeConfig).where(eq(storeConfig.storeId, input.storeId)).limit(1);
      if (rows.length === 0) return { montoInicial: "50000" };
      return { montoInicial: String(rows[0].montoInicial || "50000") };
    }),

  updateStoreConfig: adminQuery
    .input(z.object({ storeId: z.number(), montoInicial: z.string() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.insert(storeConfig).values({ storeId: input.storeId, montoInicial: input.montoInicial })
        .onDuplicateKeyUpdate({ set: { montoInicial: input.montoInicial } });
      return { success: true };
    }),

  // ========== CLOSINGS ==========
  closings: authedQuery
    .input(z.object({ storeId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.execute(sql`SELECT * FROM closings WHERE storeId = ${input.storeId} ORDER BY fecha DESC`);
      return Array.isArray(rows) ? rows[0] : (rows.rows || rows);
    }),

  createClosing: authedQuery
    .input(z.object({ storeId: z.number(), fecha: z.string(), dia: z.string().optional(), hora: z.string().optional(), efectivo: z.string().default("0"), sinpe: z.string().default("0"), tarjeta: z.string().default("0"), sinFactura: z.string().default("0"), total: z.string().default("0"), inicial: z.string().default("50000"), observaciones: z.string().optional(), createdBy: z.string().optional(), registradoPor: z.string().optional(), semana: z.number().optional(), anio: z.number().optional() }))
    .mutation(async ({ input }) => {
      const db = getDb();

      // Check for duplicate closing on same date and store
      const dupRows = await db.execute(
        sql`SELECT id FROM closings WHERE storeId = ${input.storeId} AND fecha = ${input.fecha} LIMIT 1`
      );
      const dupCheck = Array.isArray(dupRows) ? dupRows[0] : (dupRows.rows || dupRows);
      if (Array.isArray(dupCheck) && dupCheck.length > 0) {
        throw new Error("Ya existe un cierre para esta fecha en esta tienda");
      }

      // Calculate total and diferencia
      const ventas = Number(input.efectivo || 0) + Number(input.sinpe || 0) + Number(input.tarjeta || 0) + Number(input.sinFactura || 0);
      const totalCalculado = String(ventas);
      // diferencia: since efectivo represents both cash sales and cash counted,
      // we can only detect discrepancy if user explicitly provides a different total
      const diferencia = Number(input.total || ventas) - ventas;

      // Use INSERT with all columns but catch errors
      try {
        const result = await db.execute(sql`
          INSERT INTO closings (storeId, fecha, dia, hora, efectivo, sinpe, tarjeta, sinFactura, total, inicial, diferencia, observaciones, revisado, createdBy, semana, anio)
          VALUES (${input.storeId}, ${input.fecha}, ${input.dia || null}, ${input.hora || null}, ${input.efectivo || '0'}, ${input.sinpe || '0'}, ${input.tarjeta || '0'}, ${input.sinFactura || '0'}, ${totalCalculado}, ${input.inicial || '50000'}, ${String(diferencia)}, ${input.observaciones || null}, ${0}, ${input.createdBy || null}, ${input.semana || null}, ${input.anio || null})
        `);
        const insertResult = Array.isArray(result) ? result[0] : (result.rows || result);
        return { id: Number(insertResult?.insertId || 0) };
      } catch (e: any) {
        // Fallback: insert with only base columns (for old DB schema without new columns)
        try {
          const result = await db.execute(sql`
            INSERT INTO closings (storeId, fecha, dia, efectivo, sinpe, tarjeta, sinFactura, total, inicial)
            VALUES (${input.storeId}, ${input.fecha}, ${input.dia || null}, ${input.efectivo || '0'}, ${input.sinpe || '0'}, ${input.tarjeta || '0'}, ${input.sinFactura || '0'}, ${totalCalculado}, ${input.inicial || '50000'})
          `);
          const insertResult = Array.isArray(result) ? result[0] : (result.rows || result);
          return { id: Number(insertResult?.insertId || 0) };
        } catch (fallbackError: any) {
          throw fallbackError;
        }
      }
    }),

  updateClosing: authedQuery
    .input(z.object({ id: z.number(), fecha: z.string().optional(), dia: z.string().optional(), efectivo: z.union([z.string(), z.number()]).optional(), sinpe: z.union([z.string(), z.number()]).optional(), tarjeta: z.union([z.string(), z.number()]).optional(), sinFactura: z.union([z.string(), z.number()]).optional(), total: z.union([z.string(), z.number()]).optional(), observaciones: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, ...data } = input;

      // First, fetch the existing closing to get all current values
      const existingRows = await db.execute(sql`SELECT * FROM closings WHERE id = ${id} LIMIT 1`);
      const existingArray = Array.isArray(existingRows) ? existingRows[0] : (existingRows.rows || existingRows);
      const existing = Array.isArray(existingArray) && existingArray.length > 0 ? existingArray[0] : null;
      if (!existing) throw new Error("Cierre no encontrado");

      // Determine new values (use input if provided, otherwise keep existing)
      const efectivo = data.efectivo !== undefined ? String(data.efectivo) : String(existing.efectivo || "0");
      const sinpe = data.sinpe !== undefined ? String(data.sinpe) : String(existing.sinpe || "0");
      const tarjeta = data.tarjeta !== undefined ? String(data.tarjeta) : String(existing.tarjeta || "0");
      const sinFactura = data.sinFactura !== undefined ? String(data.sinFactura) : String(existing.sinFactura || "0");
      const fecha = data.fecha !== undefined ? data.fecha : existing.fecha;
      const dia = data.dia !== undefined ? data.dia : existing.dia;
      const observaciones = data.observaciones !== undefined ? data.observaciones : existing.observaciones;

      // Recalculate total from payment buckets. Keep existing diferencia unless total override is sent.
      const ventas = Number(efectivo || 0) + Number(sinpe || 0) + Number(tarjeta || 0) + Number(sinFactura || 0);
      const totalCalculado = String(ventas);
      const totalOverride = data.total !== undefined ? Number(data.total) : ventas;
      const diferencia = totalOverride - ventas;

      // Update using raw SQL for compatibility
      await db.execute(sql`
        UPDATE closings
        SET fecha = ${fecha}, dia = ${dia || null}, efectivo = ${efectivo}, sinpe = ${sinpe}, tarjeta = ${tarjeta},
            sinFactura = ${sinFactura}, total = ${totalCalculado}, diferencia = ${String(diferencia)},
            observaciones = ${observaciones || null}
        WHERE id = ${id}
      `);
      return { success: true };
    }),

  deleteClosing: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      try {
        await db.execute(sql`DELETE FROM closings WHERE id = ${input.id}`);
        return { success: true };
      } catch (e: any) {
        throw new Error("Error al eliminar: " + e.message);
      }
    }),

  markClosingReviewed: adminQuery
    .input(z.object({ id: z.number(), revisado: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      // Use raw SQL to avoid column issues
      const revisadoValue = input.revisado ? 1 : 0;
      await db.execute(sql`UPDATE closings SET revisado = ${revisadoValue} WHERE id = ${input.id}`);
      return { success: true };
    }),

  pendingReviews: authedQuery
    .query(async () => {
      const db = getDb();
      const rows = await db.execute(sql`SELECT * FROM closings ORDER BY createdAt DESC`);
      const all = Array.isArray(rows) ? rows[0] : (rows.rows || rows);
      // Filter manually since 'revisado' column may not exist in old DB schema
      return (all || []).filter((c: any) => c.revisado === false || c.revisado === 0 || c.revisado === undefined);
    }),

  closingStats: authedQuery
    .input(z.object({ storeId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.execute(sql`SELECT * FROM closings WHERE storeId = ${input.storeId} ORDER BY fecha DESC`);
      const all = Array.isArray(rows) ? rows[0] : (rows.rows || rows);

      if (!all || all.length === 0) {
        return { ultimo: null, semana: 0, mes: 0, total: 0, diasSemana: 0, diasMes: 0, totalCierres: 0 };
      }

      // ULTIMO: last closing
      const ultimo = all[0];
      const ultimoTotal = Number(ultimo.efectivo || 0) + Number(ultimo.tarjeta || 0) + Number(ultimo.sinpe || 0) + Number(ultimo.sinFactura || 0);

      // Get current date info
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();

      // Week calculation using string YYYY-MM-DD (no timezone issues)
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - mondayOffset);
      const weekStartStr = formatDateToString(weekStart);

      // Month start using string YYYY-MM-DD
      const monthStart = new Date(currentYear, currentMonth, 1);
      const monthStartStr = formatDateToString(monthStart);

      let semanaTotal = 0;
      let diasSemana = 0;
      let mesTotal = 0;
      let diasMes = 0;
      let totalAcumulado = 0;

      for (const c of all) {
        const cTotal = Number(c.efectivo || 0) + Number(c.tarjeta || 0) + Number(c.sinpe || 0) + Number(c.sinFactura || 0);
        totalAcumulado += cTotal;

        const cFecha = String(c.fecha || "");

        // This week - compare as strings
        if (cFecha >= weekStartStr) {
          semanaTotal += cTotal;
          diasSemana++;
        }

        // This month - compare as strings
        if (cFecha >= monthStartStr && cFecha.startsWith(String(currentYear))) {
          mesTotal += cTotal;
          diasMes++;
        }
      }

      return {
        ultimo: { fecha: ultimo.fecha, total: ultimoTotal },
        semana: semanaTotal,
        mes: mesTotal,
        total: totalAcumulado,
        diasSemana,
        diasMes,
        totalCierres: all.length,
      };
    }),

  closingTrend: authedQuery
    .input(z.object({ storeId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.execute(sql`SELECT * FROM closings WHERE storeId = ${input.storeId} ORDER BY fecha DESC`);
      const all = Array.isArray(rows) ? rows[0] : (rows.rows || rows);

      // Get last 7 days with data
      const dayNames = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
      const trend: { dia: string; fecha: string; total: number }[] = [];

      // Take last 7 closings
      const last7 = (all || []).slice(0, 7).reverse();
      for (const c of last7) {
        // Parse fecha YYYY-MM-DD to get day safely (treat as local date)
        const fechaParts = String(c.fecha || "").split("-");
        const year = parseInt(fechaParts[0] || "0");
        const month = parseInt(fechaParts[1] || "0") - 1;
        const day = parseInt(fechaParts[2] || "0");
        const cDate = new Date(year, month, day);
        const total = Number(c.efectivo || 0) + Number(c.tarjeta || 0) + Number(c.sinpe || 0) + Number(c.sinFactura || 0);
        trend.push({
          dia: dayNames[cDate.getDay()],
          fecha: c.fecha,
          total,
        });
      }

      return trend;
    }),

  closingByPaymentMethod: authedQuery
    .input(z.object({ storeId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.execute(sql`SELECT * FROM closings WHERE storeId = ${input.storeId}`);
      const all = Array.isArray(rows) ? rows[0] : (rows.rows || rows);

      let efectivo = 0, tarjeta = 0, sinpe = 0, sinFactura = 0;

      for (const c of (all || [])) {
        efectivo += Number(c.efectivo || 0);
        tarjeta += Number(c.tarjeta || 0);
        sinpe += Number(c.sinpe || 0);
        sinFactura += Number(c.sinFactura || 0);
      }

      const total = efectivo + tarjeta + sinpe + sinFactura;

      return [
        { metodo: "efectivo", label: "EFECTIVO", total: efectivo, porcentaje: total > 0 ? Math.round((efectivo / total) * 100) : 0 },
        { metodo: "tarjeta", label: "TARJETA", total: tarjeta, porcentaje: total > 0 ? Math.round((tarjeta / total) * 100) : 0 },
        { metodo: "sinpe", label: "SINPE", total: sinpe, porcentaje: total > 0 ? Math.round((sinpe / total) * 100) : 0 },
        { metodo: "sinFactura", label: "SIN FACTURA", total: sinFactura, porcentaje: total > 0 ? Math.round((sinFactura / total) * 100) : 0 },
      ];
    }),

  closingWeeklyBreakdown: authedQuery
    .input(z.object({ storeId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.execute(sql`SELECT * FROM closings WHERE storeId = ${input.storeId} ORDER BY fecha DESC`);
      const all = Array.isArray(rows) ? rows[0] : (rows.rows || rows);

      // Get current week info using string dates (no timezone issues)
      const now = new Date();
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - mondayOffset);
      const weekStartStr = formatDateToString(weekStart);
      // Week end = weekStart + 6 days
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      const weekEndStr = formatDateToString(weekEnd);

      // Calculate week number
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      const daysSinceStart = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
      const weekNumber = Math.ceil((daysSinceStart + startOfYear.getDay() + 1) / 7);

      const dayNames = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];

      // Initialize week days (Mon-Sun) using string dates
      const weekDays: { dia: string; fecha: string; total: number; hasData: boolean }[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        weekDays.push({
          dia: dayNames[d.getDay()],
          fecha: formatDateToString(d),
          total: 0,
          hasData: false,
        });
      }

      let weekTotal = 0;

      // Fill in data from closings - compare as strings
      for (const c of (all || [])) {
        const cFecha = String(c.fecha || "");
        if (cFecha >= weekStartStr && cFecha <= weekEndStr) {
          const total = Number(c.efectivo || 0) + Number(c.tarjeta || 0) + Number(c.sinpe || 0) + Number(c.sinFactura || 0);
          weekTotal += total;
          // Find the day index by matching the date string
          const weekIdx = weekDays.findIndex(wd => wd.fecha === cFecha);
          if (weekIdx >= 0) {
            weekDays[weekIdx].total = total;
            weekDays[weekIdx].hasData = true;
          }
        }
      }

      const maxVal = Math.max(...weekDays.map(d => d.total), 1);

      return {
        semana: weekNumber,
        anio: now.getFullYear(),
        totalSemana: weekTotal,
        dias: weekDays.map(d => ({ ...d, porcentaje: Math.round((d.total / maxVal) * 100) })),
      };
    }),

  closingReportByPeriod: authedQuery
    .input(z.object({ storeId: z.number(), desde: z.string(), hasta: z.string() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.execute(sql`SELECT * FROM closings WHERE storeId = ${input.storeId} ORDER BY fecha DESC`);
      const all = Array.isArray(rows) ? rows[0] : (rows.rows || rows);

      const desde = input.desde;
      const hasta = input.hasta;

      const filtered = (all || []).filter((c: any) => {
        const cFecha = String(c.fecha || "");
        return cFecha >= desde && cFecha <= hasta;
      });

      let totalVentas = 0;
      let totalEfectivo = 0, totalTarjeta = 0, totalSinpe = 0, totalSinFact = 0;

      const resultRows = filtered.map((c: any) => {
        const ef = Number(c.efectivo || 0);
        const ta = Number(c.tarjeta || 0);
        const si = Number(c.sinpe || 0);
        const sf = Number(c.sinFactura || 0);
        const total = ef + ta + si + sf;
        totalVentas += total;
        totalEfectivo += ef;
        totalTarjeta += ta;
        totalSinpe += si;
        totalSinFact += sf;
        return {
          fecha: c.fecha,
          dia: c.dia,
          efectivo: ef,
          tarjeta: ta,
          sinpe: si,
          sinFactura: sf,
          total,
        };
      });

      return {
        totalVentas,
        diasConCierre: filtered.length,
        promedioDia: filtered.length > 0 ? Math.round(totalVentas / filtered.length) : 0,
        rows: resultRows,
        totalEfectivo,
        totalTarjeta,
        totalSinpe,
        totalSinFact,
      };
    }),

  // ========== PRINTED LABELS (Etiquetas) — restored to pre-2026-11-10 print flow ==========
  adjustmentItemsForLabels: authedQuery
    .input(z.object({ storeId: z.number(), adjustmentId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const items = await db.select().from(adjustmentItems)
        .where(eq(adjustmentItems.adjustmentId, input.adjustmentId))
        .orderBy(desc(adjustmentItems.id));

      let printedSet = new Set<number>();
      try {
        const printed = await db.select().from(printedLabels)
          .where(and(eq(printedLabels.storeId, input.storeId), eq(printedLabels.palletId, input.adjustmentId)));
        printedSet = new Set(printed.map(p => p.productId));
      } catch { /* table doesn't exist yet */ }

      return items.map(item => ({
        id: item.id,
        nombre: item.nombre,
        precio: item.precio,
        codigoBarras: item.codigoBarras,
        cantidad: item.cantidad,
        printed: printedSet.has(item.id),
      }));
    }),

  productsForLabels: authedQuery
    .input(z.object({ storeId: z.number(), palletId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const productList = await db.select().from(products)
        .where(and(
          eq(products.storeId, input.storeId),
          eq(products.palletId, input.palletId),
          eq(products.isActive, true)
        ))
        .orderBy(desc(products.id));

      let printedSet = new Set<number>();
      try {
        const printed = await db.select().from(printedLabels)
          .where(and(eq(printedLabels.storeId, input.storeId), eq(printedLabels.palletId, input.palletId)));
        printedSet = new Set(printed.map(p => p.productId));
      } catch { /* table doesn't exist yet */ }

      return productList.map(p => ({
        id: p.id,
        nombre: p.nombre,
        precio: p.precio,
        codigoBarras: p.codigoBarras,
        cantidad: p.cantidad,
        printed: printedSet.has(p.id),
      }));
    }),

  markLabelsPrinted: authedQuery
    .input(z.object({ storeId: z.number(), palletId: z.number(), productIds: z.array(z.number()) }))
    .mutation(async ({ input }) => {
      const db = getDb();
      for (const productId of input.productIds) {
        const existing = await db.select().from(printedLabels)
          .where(and(
            eq(printedLabels.storeId, input.storeId),
            eq(printedLabels.palletId, input.palletId),
            eq(printedLabels.productId, productId)
          ))
          .limit(1);

        if (existing.length === 0) {
          await db.insert(printedLabels).values({
            storeId: input.storeId,
            palletId: input.palletId,
            productId,
          });
        }
      }
      return { success: true, count: input.productIds.length };
    }),

  unmarkLabelPrinted: authedQuery
    .input(z.object({ storeId: z.number(), palletId: z.number(), productId: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(printedLabels)
        .where(and(
          eq(printedLabels.storeId, input.storeId),
          eq(printedLabels.palletId, input.palletId),
          eq(printedLabels.productId, input.productId)
        ));
      return { success: true };
    }),

  // ========== ASSEMBLERS ==========
  assemblers: authedQuery
    .input(z.object({ storeId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      return db.select().from(assemblers).where(and(eq(assemblers.storeId, input.storeId), eq(assemblers.isActive, true)));
    }),

  createAssembler: managerQuery
    .input(z.object({ storeId: z.number(), nombre: z.string(), telefono: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const result = await db.insert(assemblers).values(input);
      return { id: Number(result[0].insertId) };
    }),

  deleteAssembler: managerQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(assemblers).set({ isActive: false }).where(eq(assemblers.id, input.id));
      return { success: true };
    }),

  // ========== DASHBOARD STATS ==========
  dashboardStats: authedQuery
    .input(z.object({ storeId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      await ensureEnterpriseSchema();
      const [palletList, productList, closingList, adjustmentList] = await Promise.all([
        db.select().from(pallets).where(and(eq(pallets.storeId, input.storeId), eq(pallets.isActive, true))),
        db.select().from(products).where(and(eq(products.storeId, input.storeId), eq(products.isActive, true))),
        db.select().from(closings).where(eq(closings.storeId, input.storeId)),
        db.select().from(adjustments).where(and(eq(adjustments.storeId, input.storeId), eq(adjustments.isActive, true))),
      ]);

      const totalUnits = productList.reduce((sum, p) => sum + (p.cantidad || 1), 0);
      const totalCierreValue = closingList.reduce((sum, c) => sum + Number(c.total), 0);
      const stockValue = productList.reduce((sum, p) => sum + Number(p.precio || 0) * Number(p.cantidad || 0), 0);
      const stockCost = productList.reduce((sum, p) => {
        if (p.costo == null) return sum;
        return sum + Number(p.costo) * Number(p.cantidad || 0);
      }, 0);
      const estimatedProfit = stockValue - (stockCost > 0
        ? stockCost
        : palletList.reduce((s, p) => s + Number(p.costo || 0), 0));

      let transferValueOut = 0;
      let transferUnitsOut = 0;
      if (input.storeId === BODEGA_STORE_ID) {
        try {
          const outs = await db.select().from(inventoryMovements)
            .where(and(
              eq(inventoryMovements.storeId, BODEGA_STORE_ID),
              eq(inventoryMovements.movementType, "transfer_out"),
            ));
          for (const m of outs) {
            transferUnitsOut += Number(m.cantidad || 0);
            transferValueOut += Number(m.precio || 0) * Number(m.cantidad || 0);
          }
        } catch {
          // table may not exist yet on first boot race
        }
      }

      return {
        totalPallets: palletList.length,
        totalProducts: productList.length,
        totalUnits,
        totalClosings: closingList.length,
        totalAdjustments: adjustmentList.length,
        totalCierreValue,
        stockValue,
        stockCost,
        estimatedProfit,
        transferValueOut,
        transferUnitsOut,
      };
    }),

  // ========== EMPLOYEES ==========
  employees: authedQuery
    .input(z.object({ storeId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      return db.select({ id: employees.id, username: employees.username, name: employees.name, role: employees.role, isActive: employees.isActive, createdAt: employees.createdAt })
        .from(employees).where(eq(employees.storeId, input.storeId));
    }),

  allEmployees: authedQuery
    .query(async () => {
      const db = getDb();
      return db.select({ id: employees.id, username: employees.username, name: employees.name, role: employees.role, storeId: employees.storeId, isActive: employees.isActive, createdAt: employees.createdAt })
        .from(employees).where(eq(employees.isActive, true));
    }),

  createEmployee: adminQuery
    .input(z.object({ storeId: z.number(), username: z.string(), password: z.string(), name: z.string(), role: z.enum(["employee", "manager", "admin"]).default("employee") }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const hashedPassword = await bcrypt.hash(input.password, 10);
      const result = await db.insert(employees).values({ storeId: input.storeId, username: input.username, password: hashedPassword, name: input.name, role: input.role });
      return { id: Number(result[0].insertId) };
    }),

  deleteEmployee: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(employees).set({ isActive: false }).where(eq(employees.id, input.id));
      return { success: true };
    }),

  // ========== SEARCH PRODUCT BY BARCODE (anywhere) ==========
  searchProductByBarcode: authedQuery
    .input(z.object({
      storeId: z.number(),
      barcode: z.string(),
      /** When true (transfers), only return real stock rows — never catalog fakes. */
      productsOnly: z.boolean().optional(),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      const raw = String(input.barcode || "").trim();
      const normalized = raw.replace(/[\s\r\n]+/g, "");
      if (!normalized) return null;

      // Real stock in store: tolerate scanner whitespace / trim mismatches
      const stockRows: any = await db.execute(sql`
        SELECT * FROM products
        WHERE storeId = ${input.storeId}
          AND isActive = 1
          AND codigoBarras IS NOT NULL
          AND (
            codigoBarras = ${raw}
            OR codigoBarras = ${normalized}
            OR TRIM(codigoBarras) = ${normalized}
            OR REPLACE(codigoBarras, ' ', '') = ${normalized}
          )
      `);
      const prodRows: any[] = Array.isArray(stockRows)
        ? (Array.isArray(stockRows[0]) ? stockRows[0] : stockRows)
        : (stockRows?.rows || []);
      if (prodRows.length > 0) {
        const cantidad = prodRows.reduce((sum, row) => sum + Number(row.cantidad || 0), 0);
        const first = prodRows[0];
        return { ...first, cantidad, codigoBarras: first.codigoBarras || normalized, source: "products" as const };
      }

      if (input.productsOnly) return null;

      // Catalog (for name/price autocomplete only — not transferable stock)
      const dbRows = await db.select()
        .from(productDatabase)
        .where(and(
          eq(productDatabase.storeId, input.storeId),
          or(
            eq(productDatabase.codigoBarras, raw),
            eq(productDatabase.codigoBarras, normalized),
          ),
        ))
        .limit(1);
      if (dbRows.length > 0) {
        const row = dbRows[0];
        return { id: row.id, nombre: row.nombre, precio: row.precio, cantidad: 0, codigoBarras: row.codigoBarras, source: "catalog" as const };
      }

      const adjRows: any = await db.execute(
        sql`SELECT ai.* FROM adjustmentItems ai JOIN adjustments a ON ai.adjustmentId = a.id
            WHERE a.storeId = ${input.storeId}
              AND ai.codigoBarras IS NOT NULL
              AND (ai.codigoBarras = ${raw} OR ai.codigoBarras = ${normalized} OR TRIM(ai.codigoBarras) = ${normalized})
            ORDER BY ai.id DESC LIMIT 1`,
      );
      const adjItems = Array.isArray(adjRows) ? adjRows[0] : (adjRows.rows || adjRows);
      if (Array.isArray(adjItems) && adjItems.length > 0) {
        const row = adjItems[0];
        return { id: row.id, nombre: row.nombre, precio: row.precio, cantidad: 0, codigoBarras: row.codigoBarras, source: "adjustment" as const };
      }

      return null;
    }),

  // ========== TRANSFERS ==========
  createTransfer: managerQuery
    .input(z.object({ fromStoreId: z.number(), toStoreId: z.number(), fecha: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await ensureEnterpriseSchema();
      if (input.fromStoreId !== BODEGA_STORE_ID) {
        throw new Error("Las transferencias solo pueden salir de Bodega");
      }
      if (input.toStoreId === BODEGA_STORE_ID) {
        throw new Error("Destino no puede ser Bodega");
      }
      if (input.fromStoreId === input.toStoreId) {
        throw new Error("Origen y destino deben ser distintos");
      }
      const result = await db.insert(transfers).values({
        ...input,
        createdBy: ctx.user?.name || ctx.user?.unionId || null,
      });
      return { id: Number(result[0].insertId) };
    }),

  getTransfers: authedQuery
    .input(z.object({ storeId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (input.storeId) {
        return db.select().from(transfers)
          .where(or(eq(transfers.fromStoreId, input.storeId), eq(transfers.toStoreId, input.storeId)))
          .orderBy(desc(transfers.createdAt));
      }
      return db.select().from(transfers).orderBy(desc(transfers.createdAt));
    }),

  getTransferItems: authedQuery
    .input(z.object({ transferId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      return db.select().from(transferItems).where(eq(transferItems.transferId, input.transferId)).orderBy(transferItems.orden);
    }),

  addTransferItem: managerQuery
    .input(z.object({
      transferId: z.number(),
      codigoBarras: z.string().optional(),
      nombre: z.string(),
      precio: z.string(),
      cantidad: z.number().default(1),
      orden: z.number().default(1),
      costo: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await ensureEnterpriseSchema();
      const [transfer] = await db.select().from(transfers).where(eq(transfers.id, input.transferId));
      if (!transfer) throw new Error("Transferencia no encontrada");
      if (transfer.estado !== "activo") throw new Error("Solo se pueden agregar articulos a transferencias activas");
      if (transfer.fromStoreId !== BODEGA_STORE_ID) throw new Error("Transferencia invalida: origen no es Bodega");

      const barcode = input.codigoBarras?.trim();
      if (barcode) {
        const sourceRows = await db.select().from(products).where(and(
          eq(products.storeId, BODEGA_STORE_ID),
          eq(products.codigoBarras, barcode),
          eq(products.isActive, true),
        ));
        const available = sourceRows.reduce((sum, row) => sum + Number(row.cantidad || 0), 0);
        const existingItems = await db.select().from(transferItems).where(eq(transferItems.transferId, input.transferId));
        const alreadyQueued = existingItems
          .filter((i) => i.codigoBarras === barcode)
          .reduce((sum, i) => sum + Number(i.cantidad || 0), 0);
        if (available < alreadyQueued + input.cantidad) {
          throw new Error(`Stock insuficiente en Bodega para ${input.nombre}. Disponible ${available}, en transferencia ${alreadyQueued}, se piden ${input.cantidad}.`);
        }
        // Prefer costo from first source row if client omitted it
        if ((!input.costo || input.costo.trim() === "") && sourceRows[0]?.costo != null) {
          input = { ...input, costo: String(sourceRows[0].costo) };
        }
      }

      const { costo, ...rest } = input;
      const result = await db.insert(transferItems).values({
        ...rest,
        costo: costo && costo.trim() !== "" ? costo : null,
      });
      return { id: Number(result[0].insertId) };
    }),

  removeTransferItem: managerQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const [item] = await db.select().from(transferItems).where(eq(transferItems.id, input.id)).limit(1);
      if (!item) throw new Error("Articulo no encontrado");
      const [transfer] = await db.select().from(transfers).where(eq(transfers.id, item.transferId)).limit(1);
      if (!transfer || transfer.estado !== "activo") throw new Error("Solo se pueden quitar articulos de transferencias activas");
      await db.delete(transferItems).where(eq(transferItems.id, input.id));
      return { success: true };
    }),

  completeTransfer: managerQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await ensureEnterpriseSchema();
      return withNamedLock(db, `aolc_xfer_${input.id}`, async () => {
        const [transfer] = await db.select().from(transfers).where(eq(transfers.id, input.id));
        if (!transfer) throw new Error("Transferencia no encontrada");
        if (transfer.estado !== "activo") throw new Error("Esta transferencia ya no esta activa");
        if (transfer.fromStoreId !== BODEGA_STORE_ID) {
          throw new Error("Las transferencias solo pueden salir de Bodega");
        }

        const items = await db.select().from(transferItems).where(eq(transferItems.transferId, input.id));
        if (items.length === 0) throw new Error("La transferencia no tiene articulos");

        let [destPallet] = await db.select().from(pallets).where(and(
          eq(pallets.storeId, transfer.toStoreId),
          eq(pallets.palletId, "TRANSFERENCIAS"),
          eq(pallets.isActive, true),
        )).limit(1);
        if (!destPallet) {
          const created = await db.insert(pallets).values({
            storeId: transfer.toStoreId,
            palletId: "TRANSFERENCIAS",
            description: "Recibido por transferencia desde Bodega",
            fecha: transfer.fecha,
            costo: "0",
          });
          destPallet = { id: Number(created[0].insertId) } as typeof destPallet;
        }

        let totalUnits = 0;
        let totalVenta = 0;
        let totalCosto = 0;

        for (const item of items) {
          const barcode = item.codigoBarras?.trim();
          const needQty = Number(item.cantidad || 0);
          if (!barcode || needQty <= 0) {
            throw new Error(`Articulo invalido en transferencia: ${item.nombre}`);
          }

          // Lock stock rows by re-reading under transfer lock; FOR UPDATE via raw when possible
          const sourceRows = await db.select().from(products).where(and(
            eq(products.storeId, transfer.fromStoreId),
            eq(products.codigoBarras, barcode),
            eq(products.isActive, true),
          ));
          const available = sourceRows.reduce((sum, row) => sum + Number(row.cantidad || 0), 0);
          if (available < needQty) {
            throw new Error(`Stock insuficiente en Bodega para ${item.nombre} (${barcode}). Hay ${available}, se piden ${needQty}.`);
          }

          let remaining = needQty;
          let weightedCost = 0;
          for (const row of sourceRows) {
            if (remaining <= 0) break;
            const rowQty = Number(row.cantidad || 0);
            const take = Math.min(rowQty, remaining);
            const unitCost = row.costo != null ? Number(row.costo) : (item.costo != null ? Number(item.costo) : 0);
            weightedCost += unitCost * take;
            const left = rowQty - take;
            if (left <= 0) {
              await db.update(products).set({ cantidad: 0, isActive: false }).where(eq(products.id, row.id));
            } else {
              await db.update(products).set({ cantidad: left }).where(eq(products.id, row.id));
            }
            await db.insert(inventoryMovements).values({
              storeId: transfer.fromStoreId,
              toStoreId: transfer.toStoreId,
              movementType: "transfer_out",
              refType: "transfer",
              refId: transfer.id,
              productId: row.id,
              palletId: row.palletId,
              codigoBarras: barcode,
              nombre: item.nombre,
              cantidad: take,
              precio: String(item.precio),
              costo: String(unitCost),
              actorId: ctx.user?.id,
              actorName: ctx.user?.name || ctx.user?.unionId,
            });
            remaining -= take;
          }

          const avgCost = needQty > 0 ? weightedCost / needQty : 0;
          const lineCosto = item.costo != null ? String(item.costo) : (avgCost > 0 ? avgCost.toFixed(2) : null);

          const destInsert = await db.insert(products).values({
            storeId: transfer.toStoreId,
            palletId: destPallet.id,
            nombre: item.nombre,
            precio: String(item.precio),
            costo: lineCosto,
            cantidad: needQty,
            codigoBarras: barcode,
            esNuevo: false,
          });

          await db.insert(inventoryMovements).values({
            storeId: transfer.toStoreId,
            toStoreId: null,
            movementType: "transfer_in",
            refType: "transfer",
            refId: transfer.id,
            productId: Number(destInsert[0].insertId),
            palletId: destPallet.id,
            codigoBarras: barcode,
            nombre: item.nombre,
            cantidad: needQty,
            precio: String(item.precio),
            costo: lineCosto,
            actorId: ctx.user?.id,
            actorName: ctx.user?.name || ctx.user?.unionId,
          });

          totalUnits += needQty;
          totalVenta += Number(item.precio) * needQty;
          totalCosto += (lineCosto != null ? Number(lineCosto) : 0) * needQty;
        }

        await db.update(transfers).set({
          estado: "completado",
          completedAt: new Date(),
        }).where(and(eq(transfers.id, input.id), eq(transfers.estado, "activo")));

        return {
          success: true,
          itemsMoved: items.length,
          unitsMoved: totalUnits,
          totalVenta,
          totalCosto,
          gananciaEstimada: totalVenta - totalCosto,
          toStoreId: transfer.toStoreId,
        };
      });
    }),

  cancelTransfer: managerQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const [transfer] = await db.select().from(transfers).where(eq(transfers.id, input.id));
      if (!transfer) throw new Error("Transferencia no encontrada");
      if (transfer.estado !== "activo") throw new Error("Solo se pueden cancelar transferencias activas");
      await db.update(transfers).set({ estado: "cancelado" }).where(eq(transfers.id, input.id));
      return { success: true };
    }),

  /** Allocate pallet.costo evenly across active product units that lack costo */
  allocatePalletCost: managerQuery
    .input(z.object({ storeId: z.number(), palletId: z.number(), overwrite: z.boolean().default(false) }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await ensureEnterpriseSchema();
      const pallet = await assertPalletInStore(db, input.palletId, input.storeId);
      const palletCosto = Number(pallet.costo || 0);
      if (palletCosto <= 0) throw new Error("El contenedor no tiene costo para repartir");

      const rows = await db.select().from(products).where(and(
        eq(products.storeId, input.storeId),
        eq(products.palletId, input.palletId),
        eq(products.isActive, true),
      ));
      const totalUnits = rows.reduce((s, r) => s + Number(r.cantidad || 0), 0);
      if (totalUnits <= 0) throw new Error("El contenedor no tiene unidades activas");

      const unitCost = palletCosto / totalUnits;
      let updated = 0;
      for (const row of rows) {
        if (!input.overwrite && row.costo != null) continue;
        await db.update(products).set({ costo: unitCost.toFixed(2) }).where(eq(products.id, row.id));
        updated++;
      }
      return { success: true, unitCost: Number(unitCost.toFixed(2)), updated, totalUnits };
    }),

  palletProfitability: authedQuery
    .input(z.object({ storeId: z.number(), palletId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      await ensureEnterpriseSchema();
      const pallet = await assertPalletInStore(db, input.palletId, input.storeId);
      const rows = await db.select().from(products).where(and(
        eq(products.storeId, input.storeId),
        eq(products.palletId, input.palletId),
        eq(products.isActive, true),
      ));
      let ventas = 0;
      let costoArticulos = 0;
      let units = 0;
      let withCosto = 0;
      for (const r of rows) {
        const qty = Number(r.cantidad || 0);
        units += qty;
        ventas += Number(r.precio || 0) * qty;
        if (r.costo != null) {
          costoArticulos += Number(r.costo) * qty;
          withCosto += qty;
        }
      }
      const palletCosto = Number(pallet.costo || 0);
      const gananciaVsPallet = ventas - palletCosto;
      const gananciaVsUnitCost = withCosto > 0 ? ventas - costoArticulos - (units - withCosto > 0 ? 0 : 0) : null;
      return {
        palletId: pallet.id,
        palletLabel: pallet.palletId,
        description: pallet.description,
        palletCosto,
        ventas,
        units,
        articulos: rows.length,
        costoArticulos,
        unitsWithCosto: withCosto,
        ganancia: gananciaVsPallet,
        margenPct: ventas > 0 ? (gananciaVsPallet / ventas) * 100 : 0,
        gananciaUnitCost: gananciaVsUnitCost,
      };
    }),

  palletRelatedTransfers: authedQuery
    .input(z.object({ storeId: z.number(), palletId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      await ensureEnterpriseSchema();
      await assertPalletInStore(db, input.palletId, input.storeId);
      const barcodeRows = await db.select({ codigoBarras: products.codigoBarras }).from(products)
        .where(and(eq(products.storeId, input.storeId), eq(products.palletId, input.palletId)));
      const barcodes = [...new Set(barcodeRows.map((r) => r.codigoBarras).filter(Boolean) as string[])];
      if (barcodes.length === 0) return [];

      const movs = await db.select().from(inventoryMovements)
        .where(and(
          eq(inventoryMovements.refType, "transfer"),
          eq(inventoryMovements.movementType, "transfer_out"),
          inArray(inventoryMovements.codigoBarras, barcodes.slice(0, 200)),
        ))
        .orderBy(desc(inventoryMovements.createdAt))
        .limit(100);

      const transferIds = [...new Set(movs.map((m) => m.refId))];
      if (transferIds.length === 0) return [];
      return db.select().from(transfers).where(inArray(transfers.id, transferIds)).orderBy(desc(transfers.createdAt));
    }),

  inventoryMovements: authedQuery
    .input(z.object({
      storeId: z.number().optional(),
      refType: z.string().optional(),
      refId: z.number().optional(),
      limit: z.number().min(1).max(200).default(50),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      await ensureEnterpriseSchema();
      const conditions = [];
      if (input.storeId != null) conditions.push(eq(inventoryMovements.storeId, input.storeId));
      if (input.refType) conditions.push(eq(inventoryMovements.refType, input.refType));
      if (input.refId != null) conditions.push(eq(inventoryMovements.refId, input.refId));
      if (conditions.length === 0) {
        return db.select().from(inventoryMovements).orderBy(desc(inventoryMovements.createdAt)).limit(input.limit);
      }
      return db.select().from(inventoryMovements)
        .where(and(...conditions))
        .orderBy(desc(inventoryMovements.createdAt))
        .limit(input.limit);
    }),

  // ========== STORE EMPLOYEES (nombres para cierre) ==========
  storeEmployees: authedQuery
    .input(z.object({ storeId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      return db.select().from(storeEmployees).where(and(eq(storeEmployees.storeId, input.storeId), eq(storeEmployees.isActive, true)));
    }),

  allStoreEmployees: authedQuery
    .query(async () => {
      const db = getDb();
      return db.select().from(storeEmployees).where(eq(storeEmployees.isActive, true));
    }),

  createStoreEmployee: managerQuery
    .input(z.object({ storeId: z.number(), nombre: z.string() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const result = await db.insert(storeEmployees).values(input);
      return { id: Number(result[0].insertId) };
    }),

  deleteStoreEmployee: managerQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(storeEmployees).set({ isActive: false }).where(eq(storeEmployees.id, input.id));
      return { success: true };
    }),

  // Fix: move employees from Bodega (storeId 1) to new Los Chiles store
  fixLosChilesEmployees: adminQuery
    .mutation(async () => {
      const db = getDb();
      // Find Los Chiles store (not Bodega = id 1)
      const losChilesRows: any = await db.execute(
        sql`SELECT id FROM stores WHERE (name LIKE ${'%Los Chiles%'} OR slug = ${'los-chiles'}) AND id != 1 LIMIT 1`
      );
      const rows = Array.isArray(losChilesRows) ? losChilesRows[0] : (losChilesRows.rows || losChilesRows);
      if (!rows || rows.length === 0) {
        throw new Error("No se encontro tienda Los Chiles");
      }
      const losChilesId = rows[0].id;

      // Move all employees from storeId 1 to Los Chiles
      const result: any = await db.execute(
        sql`UPDATE employees SET storeId = ${losChilesId} WHERE storeId = 1`
      );

      return {
        success: true,
        losChilesId,
        message: `Empleados movidos`,
      };
    }),

  // ============================================
  // PAYROLL (Planilla / Nomina)
  // ============================================

  // -- Employees --
  payrollEmployees: authedQuery
    .input(z.object({ storeId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      if (input?.storeId) {
        return await db.select().from(payrollEmployees).where(and(eq(payrollEmployees.storeId, input.storeId), eq(payrollEmployees.isActive, true)));
      }
      return await db.select().from(payrollEmployees).where(eq(payrollEmployees.isActive, true));
    }),

  createPayrollEmployee: adminQuery
    .input(z.object({
      storeId: z.number(), nombre: z.string(), apellidos: z.string(),
      puesto: z.string(), salarioBase: z.string(), fechaIngreso: z.string(),
      cedula: z.string().optional(), tipoSalario: z.enum(["quincenal", "mensual", "semanal", "hora"]).optional(),
      telefono: z.string().optional(), correo: z.string().optional(),
      cuentaBancaria: z.string().optional(), banco: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      // Use raw SQL with fallback for DB compatibility
      const cedula = input.cedula || "";
      const tipoSalario = input.tipoSalario || "quincenal";
      const telefono = input.telefono || null;
      const correo = input.correo || null;
      const cuentaBancaria = input.cuentaBancaria || null;
      const banco = input.banco || null;

      try {
        const result: any = await db.execute(sql`
          INSERT INTO payrollEmployees (storeId, cedula, nombre, apellidos, puesto, salarioBase, tipoSalario, fechaIngreso, telefono, correo, cuentaBancaria, banco, estado, isActive)
          VALUES (${input.storeId}, ${cedula || null}, ${input.nombre}, ${input.apellidos}, ${input.puesto}, ${input.salarioBase}, ${tipoSalario}, ${input.fechaIngreso}, ${telefono}, ${correo}, ${cuentaBancaria}, ${banco}, 'activo', 1)
        `);
        const insertResult = Array.isArray(result) ? result[0] : (result.rows || result);
        return { id: Number(insertResult?.insertId || 0) };
      } catch (e: any) {
        // Fallback: try without cedula if column is not nullable
        try {
          const result2: any = await db.execute(sql`
            INSERT INTO payrollEmployees (storeId, nombre, apellidos, puesto, salarioBase, tipoSalario, fechaIngreso, telefono, correo, cuentaBancaria, banco, estado, isActive)
            VALUES (${input.storeId}, ${input.nombre}, ${input.apellidos}, ${input.puesto}, ${input.salarioBase}, ${tipoSalario}, ${input.fechaIngreso}, ${telefono}, ${correo}, ${cuentaBancaria}, ${banco}, 'activo', 1)
          `);
          const insertResult2 = Array.isArray(result2) ? result2[0] : (result2.rows || result2);
          return { id: Number(insertResult2?.insertId || 0) };
        } catch (fallbackError: any) {
          throw fallbackError;
        }
      }
    }),

  updatePayrollEmployee: adminQuery
    .input(z.object({
      id: z.number(), cedula: z.string().optional(), nombre: z.string().optional(), apellidos: z.string().optional(),
      puesto: z.string().optional(), salarioBase: z.string().optional(), tipoSalario: z.enum(["quincenal", "mensual", "semanal", "hora"]).optional(),
      fechaIngreso: z.string().optional(), telefono: z.string().optional(), correo: z.string().optional(),
      cuentaBancaria: z.string().optional(), banco: z.string().optional(), estado: z.enum(["activo", "inactivo", "suspendido"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, ...data } = input;
      await db.update(payrollEmployees).set(data).where(eq(payrollEmployees.id, id));
      return { success: true };
    }),

  deletePayrollEmployee: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(payrollEmployees).set({ isActive: false }).where(eq(payrollEmployees.id, input.id));
      return { success: true };
    }),

  // -- Periods --
  payrollPeriods: authedQuery
    .query(async () => {
      const db = getDb();
      return await db.select().from(payrollPeriods).where(eq(payrollPeriods.isActive, true)).orderBy(desc(payrollPeriods.id));
    }),

  createPayrollPeriod: adminQuery
    .input(z.object({
      nombre: z.string(), tipo: z.enum(["quincenal", "mensual", "semanal"]),
      fechaInicio: z.string(), fechaFin: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const result = await db.insert(payrollPeriods).values(input);
      return { id: Number(result[0].insertId) };
    }),

  updatePayrollPeriod: adminQuery
    .input(z.object({
      id: z.number(), nombre: z.string().optional(), estado: z.enum(["abierto", "cerrado", "procesando"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, ...data } = input;
      await db.update(payrollPeriods).set(data).where(eq(payrollPeriods.id, id));
      return { success: true };
    }),

  // -- Payments --
  payrollPayments: authedQuery
    .input(z.object({ periodId: z.number().optional(), employeeId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      if (input?.periodId && input?.employeeId) {
        return await db.select().from(payrollPayments)
          .where(and(eq(payrollPayments.periodId, input.periodId), eq(payrollPayments.employeeId, input.employeeId)))
          .orderBy(desc(payrollPayments.id));
      }
      if (input?.periodId) {
        return await db.select().from(payrollPayments).where(eq(payrollPayments.periodId, input.periodId)).orderBy(desc(payrollPayments.id));
      }
      if (input?.employeeId) {
        return await db.select().from(payrollPayments).where(eq(payrollPayments.employeeId, input.employeeId)).orderBy(desc(payrollPayments.id));
      }
      return await db.select().from(payrollPayments).orderBy(desc(payrollPayments.id));
    }),

  createPayrollPayment: adminQuery
    .input(z.object({
      employeeId: z.number(), periodId: z.number(), salarioBase: z.string(),
      horasExtra: z.string().optional(), montoHorasExtra: z.string().optional(),
      comisiones: z.string().optional(), aguinaldo: z.string().optional(), vacaciones: z.string().optional(),
      ccss: z.string().optional(), renta: z.string().optional(), adelantos: z.string().optional(),
      ausencias: z.string().optional(), otrasDeducciones: z.string().optional(),
      formaPago: z.enum(["transferencia", "cheque", "efectivo"]).optional(),
      observaciones: z.string().optional(), fechaPago: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const salarioBase = Number(input.salarioBase || 0);
      const horasExtra = Number(input.horasExtra || 0);
      const montoHorasExtra = Number(input.montoHorasExtra || 0);
      const comisiones = Number(input.comisiones || 0);
      const aguinaldo = Number(input.aguinaldo || 0);
      const vacaciones = Number(input.vacaciones || 0);
      const ccss = Number(input.ccss || 0);
      const renta = Number(input.renta || 0);
      const adelantos = Number(input.adelantos || 0);
      const ausencias = Number(input.ausencias || 0);
      const otrasDeducciones = Number(input.otrasDeducciones || 0);

      const totalIngresos = salarioBase + montoHorasExtra + comisiones + aguinaldo + vacaciones;
      const totalDeducciones = ccss + renta + adelantos + ausencias + otrasDeducciones;
      const netoPagar = totalIngresos - totalDeducciones;

      const result = await db.insert(payrollPayments).values({
        ...input,
        horasExtra: String(horasExtra), montoHorasExtra: String(montoHorasExtra),
        comisiones: String(comisiones), aguinaldo: String(aguinaldo), vacaciones: String(vacaciones),
        ccss: String(ccss), renta: String(renta), adelantos: String(adelantos),
        ausencias: String(ausencias), otrasDeducciones: String(otrasDeducciones),
        totalIngresos: String(totalIngresos), totalDeducciones: String(totalDeducciones),
        netoPagar: String(netoPagar),
        formaPago: input.formaPago || "transferencia",
        estado: "pendiente",
      });
      return { id: Number(result[0].insertId) };
    }),

  updatePayrollPayment: adminQuery
    .input(z.object({
      id: z.number(), salarioBase: z.string().optional(), horasExtra: z.string().optional(),
      montoHorasExtra: z.string().optional(), comisiones: z.string().optional(),
      aguinaldo: z.string().optional(), vacaciones: z.string().optional(),
      ccss: z.string().optional(), renta: z.string().optional(), adelantos: z.string().optional(),
      ausencias: z.string().optional(), otrasDeducciones: z.string().optional(),
      formaPago: z.enum(["transferencia", "cheque", "efectivo"]).optional(),
      estado: z.enum(["pendiente", "pagado", "anulado"]).optional(),
      observaciones: z.string().optional(), fechaPago: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, ...data } = input;

      // If any amount field changed, recalculate totals
      const existingRows = await db.select().from(payrollPayments).where(eq(payrollPayments.id, id)).limit(1);
      if (existingRows.length === 0) throw new Error("Pago no encontrado");
      const existing = existingRows[0];

      const salarioBase = data.salarioBase !== undefined ? Number(data.salarioBase) : Number(existing.salarioBase);
      const montoHorasExtra = data.montoHorasExtra !== undefined ? Number(data.montoHorasExtra) : Number(existing.montoHorasExtra || 0);
      const comisiones = data.comisiones !== undefined ? Number(data.comisiones) : Number(existing.comisiones || 0);
      const aguinaldo = data.aguinaldo !== undefined ? Number(data.aguinaldo) : Number(existing.aguinaldo || 0);
      const vacaciones = data.vacaciones !== undefined ? Number(data.vacaciones) : Number(existing.vacaciones || 0);
      const ccss = data.ccss !== undefined ? Number(data.ccss) : Number(existing.ccss || 0);
      const renta = data.renta !== undefined ? Number(data.renta) : Number(existing.renta || 0);
      const adelantos = data.adelantos !== undefined ? Number(data.adelantos) : Number(existing.adelantos || 0);
      const ausencias = data.ausencias !== undefined ? Number(data.ausencias) : Number(existing.ausencias || 0);
      const otrasDeducciones = data.otrasDeducciones !== undefined ? Number(data.otrasDeducciones) : Number(existing.otrasDeducciones || 0);

      const totalIngresos = salarioBase + montoHorasExtra + comisiones + aguinaldo + vacaciones;
      const totalDeducciones = ccss + renta + adelantos + ausencias + otrasDeducciones;
      const netoPagar = totalIngresos - totalDeducciones;

      await db.update(payrollPayments).set({
        ...data,
        totalIngresos: String(totalIngresos),
        totalDeducciones: String(totalDeducciones),
        netoPagar: String(netoPagar),
      }).where(eq(payrollPayments.id, id));
      return { success: true };
    }),

  deletePayrollPayment: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(payrollPayments).set({ estado: "anulado" }).where(eq(payrollPayments.id, input.id));
      return { success: true };
    }),

  // -- Payroll Report --
  payrollReportByPeriod: authedQuery
    .input(z.object({ periodId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const payments = await db.select().from(payrollPayments).where(eq(payrollPayments.periodId, input.periodId));
      const totalNeto = payments.reduce((s, p) => s + Number(p.netoPagar || 0), 0);
      const totalIngresos = payments.reduce((s, p) => s + Number(p.totalIngresos || 0), 0);
      const totalDeducciones = payments.reduce((s, p) => s + Number(p.totalDeducciones || 0), 0);
      const totalPagados = payments.filter(p => p.estado === "pagado").length;
      const totalPendientes = payments.filter(p => p.estado === "pendiente").length;
      return {
        totalPagos: payments.length,
        totalNeto,
        totalIngresos,
        totalDeducciones,
        totalPagados,
        totalPendientes,
        payments,
      };
    }),
});
