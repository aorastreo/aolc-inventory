import { z } from "zod";
import { createRouter, publicQuery, adminQuery } from "./middleware";
import { getDb } from "./queries/connection";
import {
  stores, pallets, products, productDatabase,
  adjustments, adjustmentItems, closings, assemblers, assemblyAssignments, employees, printedLabels,
  transfers, transferItems, storeConfig, storeEmployees,
  payrollEmployees, payrollPeriods, payrollPayments,
} from "@db/schema";
import { eq, and, desc, like, sql, count, or } from "drizzle-orm";
import bcrypt from "bcryptjs";

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

async function getNextAutoBarcode(db: any): Promise<string> {
  // Search in products table
  const pResult: any = await db.execute(
    sql`SELECT codigoBarras FROM products 
        WHERE codigoBarras REGEXP '^[0-9]+$' 
        AND CAST(codigoBarras AS UNSIGNED) >= ${AUTO_BARCODE_MIN} 
        AND CAST(codigoBarras AS UNSIGNED) <= ${AUTO_BARCODE_MAX}
        ORDER BY CAST(codigoBarras AS UNSIGNED) DESC LIMIT 1`
  );
  // Search in productDatabase table
  const dResult: any = await db.execute(
    sql`SELECT codigoBarras FROM productDatabase 
        WHERE codigoBarras REGEXP '^[0-9]+$' 
        AND CAST(codigoBarras AS UNSIGNED) >= ${AUTO_BARCODE_MIN} 
        AND CAST(codigoBarras AS UNSIGNED) <= ${AUTO_BARCODE_MAX}
        ORDER BY CAST(codigoBarras AS UNSIGNED) DESC LIMIT 1`
  );
  // Search in adjustmentItems table
  const aResult: any = await db.execute(
    sql`SELECT codigoBarras FROM adjustmentItems 
        WHERE codigoBarras REGEXP '^[0-9]+$' 
        AND CAST(codigoBarras AS UNSIGNED) >= ${AUTO_BARCODE_MIN} 
        AND CAST(codigoBarras AS UNSIGNED) <= ${AUTO_BARCODE_MAX}
        ORDER BY CAST(codigoBarras AS UNSIGNED) DESC LIMIT 1`
  );

  const pRows = Array.isArray(pResult) ? pResult[0] : (pResult.rows || pResult);
  const dRows = Array.isArray(dResult) ? dResult[0] : (dResult.rows || dResult);
  const aRows = Array.isArray(aResult) ? aResult[0] : (aResult.rows || aResult);

  const pMax = (Array.isArray(pRows) && pRows.length > 0) ? parseInt(pRows[0].codigoBarras, 10) : 0;
  const dMax = (Array.isArray(dRows) && dRows.length > 0) ? parseInt(dRows[0].codigoBarras, 10) : 0;
  const aMax = (Array.isArray(aRows) && aRows.length > 0) ? parseInt(aRows[0].codigoBarras, 10) : 0;

  const lastAuto = Math.max(pMax, dMax, aMax);
  const nextCode = lastAuto > 0 ? lastAuto + 1 : AUTO_BARCODE_START;

  // Safety: don't exceed max range
  if (nextCode > AUTO_BARCODE_MAX) {
    throw new Error("Se agotaron los codigos automaticos en el rango 7700xxxx");
  }

  return String(nextCode);
}

export const inventoryRouter = createRouter({
  // ========== STORES ==========
  stores: publicQuery.query(async () => {
    const db = getDb();
    return db.select().from(stores).where(eq(stores.isActive, true));
  }),

  allStores: publicQuery.query(async () => {
    const db = getDb();
    return db.select().from(stores).orderBy(stores.id);
  }),

  createStore: publicQuery
    .input(z.object({ name: z.string(), slug: z.string(), description: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const result = await db.insert(stores).values({ name: input.name, slug: input.slug, description: input.description || "" });
      return { id: Number(result[0].insertId) };
    }),

  // ========== PALLETS ==========
  pallets: publicQuery
    .input(z.object({ storeId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      return db.select().from(pallets)
        .where(and(eq(pallets.storeId, input.storeId), eq(pallets.isActive, true)))
        .orderBy(desc(pallets.createdAt));
    }),

  palletById: publicQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const result = await db.select().from(pallets).where(eq(pallets.id, input.id)).limit(1);
      return result[0] || null;
    }),

  createPallet: publicQuery
    .input(z.object({ storeId: z.number(), palletId: z.string(), description: z.string(), fecha: z.string().optional(), costo: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const fecha = input.fecha || new Date().toISOString().split("T")[0];
      const costo = input.costo || "0";
      try {
        const result: any = await db.execute(sql`
          INSERT INTO pallets (storeId, palletId, description, fecha, costo, isActive)
          VALUES (${input.storeId}, ${input.palletId}, ${input.description}, ${fecha}, ${costo}, 1)
        `);
        const insertResult = Array.isArray(result) ? result[0] : (result.rows || result);
        return { id: Number(insertResult?.insertId || 0) };
      } catch (e: any) {
        // Fallback: try without fecha/costo if columns don't exist
        try {
          const result2: any = await db.execute(sql`
            INSERT INTO pallets (storeId, palletId, description, isActive)
            VALUES (${input.storeId}, ${input.palletId}, ${input.description}, 1)
          `);
          const insertResult2 = Array.isArray(result2) ? result2[0] : (result2.rows || result2);
          return { id: Number(insertResult2?.insertId || 0) };
        } catch (fallbackError: any) {
          throw fallbackError;
        }
      }
    }),

  updatePallet: publicQuery
    .input(z.object({ id: z.number(), palletId: z.string().optional(), description: z.string().optional(), costo: z.string().optional(), fecha: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, ...data } = input;
      const setData: Record<string, any> = {};
      if (data.palletId !== undefined) setData.palletId = data.palletId;
      if (data.description !== undefined) setData.description = data.description;
      if (data.costo !== undefined) setData.costo = data.costo;
      if (data.fecha !== undefined) setData.fecha = data.fecha;
      await db.update(pallets).set(setData).where(eq(pallets.id, id));
      return { success: true };
    }),

  deletePallet: publicQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(pallets).set({ isActive: false }).where(eq(pallets.id, input.id));
      return { success: true };
    }),

  palletsWithStats: publicQuery
    .input(z.object({ storeId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const palletList = await db.select().from(pallets)
        .where(and(eq(pallets.storeId, input.storeId), eq(pallets.isActive, true)))
        .orderBy(desc(pallets.id));

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

      return palletList.map(p => {
        const ventas = valueMap.get(p.id) || 0;
        const costo = Number(p.costo || 0);
        return {
          id: p.id,
          palletId: p.palletId,
          fecha: p.fecha,
          description: p.description,
          costo: p.costo,
          articulos: countMap.get(p.id) || 0,
          unidades: unitsMap.get(p.id) || 0,
          ventas,
          ganancia: ventas - costo,
        };
      });
    }),

  // ========== PRODUCT SEARCH (for autocomplete) ==========
  searchProductsSimilar: publicQuery
    .input(z.object({ storeId: z.number(), query: z.string() }))
    .query(async ({ input }) => {
      const db = getDb();
      const q = input.query.toLowerCase();
      if (!q || q.length < 2) return [];

      // Search in catalog
      const catalog = await db.select().from(productDatabase)
        .where(and(eq(productDatabase.storeId, input.storeId), eq(productDatabase.isActive, true)));
      const catalogMatches = catalog
        .filter(p => p.nombre.toLowerCase().includes(q))
        .map(p => ({ id: p.id, nombre: p.nombre, precio: p.precio, codigoBarras: p.codigoBarras, source: "catalog" as const }));

      // Search in existing products (with pallet info)
      const allProducts = await db.select().from(products)
        .where(and(eq(products.storeId, input.storeId), eq(products.isActive, true)));
      const productMatches = allProducts
        .filter(p => p.nombre.toLowerCase().includes(q))
        .map(p => ({ id: p.id, nombre: p.nombre, precio: p.precio, codigoBarras: p.codigoBarras, palletId: p.palletId, source: "product" as const }));

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
          contenedor: null as string | null,
          source: "catalog" as const,
        })),
        ...productMatches.map(p => ({
          id: `prod-${p.id}`,
          nombre: p.nombre,
          precio: Number(p.precio || 0),
          codigoBarras: p.codigoBarras,
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

  // ========== PRODUCTS ==========
  products: publicQuery
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

  createProduct: publicQuery
    .input(z.object({ storeId: z.number(), palletId: z.number(), nombre: z.string(), precio: z.string(), cantidad: z.number().default(1), codigoBarras: z.string().optional(), codigo: z.string().optional(), esNuevo: z.boolean().default(false) }))
    .mutation(async ({ input }) => {
      const db = getDb();
      let codigoBarras = input.codigoBarras;

      // Auto-generate barcode if not provided or empty
      if (!codigoBarras || codigoBarras.trim() === "") {
        codigoBarras = await getNextAutoBarcode(db);
      }

      const result = await db.insert(products).values({ ...input, codigoBarras });
      return { id: Number(result[0].insertId), codigoBarras };
    }),

  updateProduct: publicQuery
    .input(z.object({ id: z.number(), nombre: z.string().optional(), precio: z.string().optional(), cantidad: z.number().optional(), codigoBarras: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, ...data } = input;
      await db.update(products).set(data).where(eq(products.id, id));
      return { success: true };
    }),

  deleteProduct: publicQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(products).set({ isActive: false }).where(eq(products.id, input.id));
      return { success: true };
    }),

  searchProducts: publicQuery
    .input(z.object({ storeId: z.number(), query: z.string() }))
    .query(async ({ input }) => {
      const db = getDb();
      const all = await db.select().from(products)
        .where(and(eq(products.storeId, input.storeId), eq(products.isActive, true)));
      const q = input.query.toLowerCase();
      return all.filter(p => p.nombre.toLowerCase().includes(q) || (p.codigoBarras && p.codigoBarras.includes(q)));
    }),

  // ========== PRODUCT DATABASE ==========
  productDatabase: publicQuery
    .input(z.object({ storeId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      return db.select().from(productDatabase)
        .where(and(eq(productDatabase.storeId, input.storeId), eq(productDatabase.isActive, true)));
    }),

  searchProductDB: publicQuery
    .input(z.object({ storeId: z.number(), query: z.string() }))
    .query(async ({ input }) => {
      const db = getDb();
      const all = await db.select().from(productDatabase)
        .where(and(eq(productDatabase.storeId, input.storeId), eq(productDatabase.isActive, true)));
      const q = input.query.toLowerCase();
      return all.filter(p => p.nombre.toLowerCase().includes(q) || (p.codigoBarras && p.codigoBarras.includes(q)));
    }),

  createProductDB: publicQuery
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

  updateProductDB: publicQuery
    .input(z.object({ id: z.number(), nombre: z.string().optional(), precio: z.string().optional(), codigoBarras: z.string().optional(), categoria: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, ...data } = input;
      await db.update(productDatabase).set(data).where(eq(productDatabase.id, id));
      return { success: true };
    }),

  deleteProductDB: publicQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(productDatabase).set({ isActive: false }).where(eq(productDatabase.id, input.id));
      return { success: true };
    }),

  adjustmentsWithStats: publicQuery
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
  adjustments: publicQuery
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

  adjustmentById: publicQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const result = await db.select().from(adjustments).where(eq(adjustments.id, input.id)).limit(1);
      return result[0] || null;
    }),

  adjustmentItems: publicQuery
    .input(z.object({ adjustmentId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      return db.select().from(adjustmentItems).where(eq(adjustmentItems.adjustmentId, input.adjustmentId));
    }),

  createAdjustment: publicQuery
    .input(z.object({ storeId: z.number(), palletId: z.number(), adjustmentId: z.string(), description: z.string().optional(), fecha: z.string().optional(), fechaHora: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const result = await db.insert(adjustments).values({ ...input, estado: "activo" });
      return { id: Number(result[0].insertId) };
    }),

  addAdjustmentItem: publicQuery
    .input(z.object({ adjustmentId: z.number(), nombre: z.string(), precio: z.string(), cantidad: z.number().default(1), codigoBarras: z.string().optional(), orden: z.number().default(1) }))
    .mutation(async ({ input }) => {
      const db = getDb();
      let { codigoBarras } = input;

      // Auto-generate barcode if not provided or empty
      if (!codigoBarras || codigoBarras.trim() === "") {
        codigoBarras = await getNextAutoBarcode(db);
      }

      const result = await db.insert(adjustmentItems).values({ ...input, codigoBarras });
      return { id: Number(result[0].insertId), codigoBarras };
    }),

  removeAdjustmentItem: publicQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(adjustmentItems).where(eq(adjustmentItems.id, input.id));
      return { success: true };
    }),

  updateAdjustmentItem: publicQuery
    .input(z.object({ id: z.number(), nombre: z.string().optional(), precio: z.string().optional(), cantidad: z.number().optional(), codigoBarras: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, ...data } = input;
      await db.update(adjustmentItems).set(data).where(eq(adjustmentItems.id, id));
      return { success: true };
    }),

  completeAdjustment: publicQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();

      // Get the adjustment to find the pallet/store
      const [adj] = await db.select().from(adjustments).where(eq(adjustments.id, input.id));
      if (!adj) throw new Error("Ajuste no encontrado");

      // Get all items from this adjustment
      const items = await db.select().from(adjustmentItems).where(eq(adjustmentItems.adjustmentId, input.id));

      // Insert each item as a product into the container (pallet)
      for (const item of items) {
        await db.insert(products).values({
          storeId: adj.storeId,
          palletId: adj.palletId,
          nombre: item.nombre,
          precio: String(item.precio),
          cantidad: item.cantidad,
          codigoBarras: item.codigoBarras,
          esNuevo: false,
        });
      }

      // Mark adjustment as completed
      await db.update(adjustments).set({ estado: "completado", completedAt: new Date() }).where(eq(adjustments.id, input.id));
      return { success: true, productsAdded: items.length };
    }),

  applyAdjustmentToContainer: publicQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();

      // Get the adjustment to find the pallet/store
      const [adj] = await db.select().from(adjustments).where(eq(adjustments.id, input.id));
      if (!adj) throw new Error("Ajuste no encontrado");

      // Get all items from this adjustment
      const items = await db.select().from(adjustmentItems).where(eq(adjustmentItems.adjustmentId, input.id));
      if (items.length === 0) throw new Error("El ajuste no tiene articulos");

      // Insert each item as a product into the container (pallet)
      let productsAdded = 0;
      for (const item of items) {
        await db.insert(products).values({
          storeId: adj.storeId,
          palletId: adj.palletId,
          nombre: item.nombre,
          precio: String(item.precio),
          cantidad: item.cantidad,
          codigoBarras: item.codigoBarras,
          esNuevo: false,
        });
        productsAdded++;
      }

      return { success: true, productsAdded };
    }),

  forceApplyAdjustment: publicQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const [adj] = await db.select().from(adjustments).where(eq(adjustments.id, input.id));
      if (!adj) return { error: "Ajuste no encontrado" };

      const items = await db.select().from(adjustmentItems).where(eq(adjustmentItems.adjustmentId, input.id));
      if (items.length === 0) return { error: "Sin articulos" };

      let productsAdded = 0;
      for (const item of items) {
        await db.insert(products).values({
          storeId: adj.storeId,
          palletId: adj.palletId,
          nombre: item.nombre,
          precio: String(item.precio),
          cantidad: item.cantidad,
          codigoBarras: item.codigoBarras,
          esNuevo: false,
        });
        productsAdded++;
      }

      return { success: true, productsAdded, palletId: adj.palletId };
    }),

  cancelAdjustment: publicQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(adjustments).set({ estado: "cancelado", isActive: false }).where(eq(adjustments.id, input.id));
      return { success: true };
    }),

  // ========== STORE CONFIG ==========
  storeConfig: publicQuery
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
  closings: publicQuery
    .input(z.object({ storeId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.execute(sql`SELECT * FROM closings WHERE storeId = ${input.storeId} ORDER BY fecha DESC`);
      return Array.isArray(rows) ? rows[0] : (rows.rows || rows);
    }),

  createClosing: publicQuery
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

  updateClosing: publicQuery
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

      // Recalculate total and diferencia
      const ventas = Number(efectivo || 0) + Number(sinpe || 0) + Number(tarjeta || 0) + Number(sinFactura || 0);
      const totalCalculado = String(ventas);
      const diferencia = 0; // Since efectivo represents both cash sales and cash counted

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

  deleteClosing: publicQuery
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

  pendingReviews: publicQuery
    .query(async () => {
      const db = getDb();
      const rows = await db.execute(sql`SELECT * FROM closings ORDER BY createdAt DESC`);
      const all = Array.isArray(rows) ? rows[0] : (rows.rows || rows);
      // Filter manually since 'revisado' column may not exist in old DB schema
      return (all || []).filter((c: any) => c.revisado === false || c.revisado === 0 || c.revisado === undefined);
    }),

  closingStats: publicQuery
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

  closingTrend: publicQuery
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

  closingByPaymentMethod: publicQuery
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

  closingWeeklyBreakdown: publicQuery
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

  closingReportByPeriod: publicQuery
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

  // ========== PRINTED LABELS (Etiquetas) ==========
  adjustmentItemsForLabels: publicQuery
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

  productsForLabels: publicQuery
    .input(z.object({ storeId: z.number(), palletId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      // Get all products for this pallet - last added first
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

  markLabelsPrinted: publicQuery
    .input(z.object({ storeId: z.number(), palletId: z.number(), productIds: z.array(z.number()) }))
    .mutation(async ({ input }) => {
      const db = getDb();
      for (const productId of input.productIds) {
        // Check if already exists
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

  unmarkLabelPrinted: publicQuery
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
  assemblers: publicQuery
    .input(z.object({ storeId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      return db.select().from(assemblers).where(and(eq(assemblers.storeId, input.storeId), eq(assemblers.isActive, true)));
    }),

  createAssembler: publicQuery
    .input(z.object({ storeId: z.number(), nombre: z.string(), telefono: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const result = await db.insert(assemblers).values(input);
      return { id: Number(result[0].insertId) };
    }),

  deleteAssembler: publicQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(assemblers).set({ isActive: false }).where(eq(assemblers.id, input.id));
      return { success: true };
    }),

  // ========== DASHBOARD STATS ==========
  dashboardStats: publicQuery
    .input(z.object({ storeId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const [palletList, productList, closingList, adjustmentList] = await Promise.all([
        db.select().from(pallets).where(and(eq(pallets.storeId, input.storeId), eq(pallets.isActive, true))),
        db.select().from(products).where(and(eq(products.storeId, input.storeId), eq(products.isActive, true))),
        db.select().from(closings).where(eq(closings.storeId, input.storeId)),
        db.select().from(adjustments).where(and(eq(adjustments.storeId, input.storeId), eq(adjustments.isActive, true))),
      ]);

      const totalUnits = productList.reduce((sum, p) => sum + (p.cantidad || 1), 0);
      const totalCierreValue = closingList.reduce((sum, c) => sum + Number(c.total), 0);

      return {
        totalPallets: palletList.length,
        totalProducts: productList.length,
        totalUnits,
        totalClosings: closingList.length,
        totalAdjustments: adjustmentList.length,
        totalCierreValue,
      };
    }),

  // ========== EMPLOYEES ==========
  employees: publicQuery
    .input(z.object({ storeId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      return db.select({ id: employees.id, username: employees.username, name: employees.name, role: employees.role, isActive: employees.isActive, createdAt: employees.createdAt })
        .from(employees).where(eq(employees.storeId, input.storeId));
    }),

  allEmployees: publicQuery
    .query(async () => {
      const db = getDb();
      return db.select({ id: employees.id, username: employees.username, name: employees.name, role: employees.role, storeId: employees.storeId, isActive: employees.isActive, createdAt: employees.createdAt })
        .from(employees).where(eq(employees.isActive, true));
    }),

  createEmployee: publicQuery
    .input(z.object({ storeId: z.number(), username: z.string(), password: z.string(), name: z.string(), role: z.enum(["employee", "manager", "admin"]).default("employee") }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const hashedPassword = await bcrypt.hash(input.password, 10);
      const result = await db.insert(employees).values({ storeId: input.storeId, username: input.username, password: hashedPassword, name: input.name, role: input.role });
      return { id: Number(result[0].insertId) };
    }),

  deleteEmployee: publicQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(employees).set({ isActive: false }).where(eq(employees.id, input.id));
      return { success: true };
    }),

  // ========== SEARCH PRODUCT BY BARCODE (anywhere) ==========
  searchProductByBarcode: publicQuery
    .input(z.object({ storeId: z.number(), barcode: z.string() }))
    .query(async ({ input }) => {
      const db = getDb();

      // 1. Search in products (containers)
      const prodRows = await db.select()
        .from(products)
        .where(and(eq(products.storeId, input.storeId), eq(products.codigoBarras, input.barcode), eq(products.isActive, true)))
        .limit(1);
      if (prodRows.length > 0) return prodRows[0];

      // 2. Search in productDatabase (catalog)
      const dbRows = await db.select()
        .from(productDatabase)
        .where(and(eq(productDatabase.storeId, input.storeId), eq(productDatabase.codigoBarras, input.barcode)))
        .limit(1);
      if (dbRows.length > 0) {
        const row = dbRows[0];
        return { id: row.id, nombre: row.nombre, precio: row.precio, cantidad: 999, codigoBarras: row.codigoBarras };
      }

      // 3. Search in adjustmentItems (recent adjustments)
      const adjRows: any = await db.execute(
        sql`SELECT ai.* FROM adjustmentItems ai JOIN adjustments a ON ai.adjustmentId = a.id WHERE ai.codigoBarras = ${input.barcode} AND a.storeId = ${input.storeId} ORDER BY ai.id DESC LIMIT 1`
      );
      const adjItems = Array.isArray(adjRows) ? adjRows[0] : (adjRows.rows || adjRows);
      if (Array.isArray(adjItems) && adjItems.length > 0) {
        const row = adjItems[0];
        return { id: row.id, nombre: row.nombre, precio: row.precio, cantidad: 999, codigoBarras: row.codigoBarras };
      }

      return null;
    }),

  // ========== TRANSFERS ==========
  createTransfer: publicQuery
    .input(z.object({ fromStoreId: z.number(), toStoreId: z.number(), fecha: z.string() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const result = await db.insert(transfers).values(input);
      return { id: Number(result[0].insertId) };
    }),

  getTransfers: publicQuery
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

  getTransferItems: publicQuery
    .input(z.object({ transferId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      return db.select().from(transferItems).where(eq(transferItems.transferId, input.transferId)).orderBy(transferItems.orden);
    }),

  addTransferItem: publicQuery
    .input(z.object({ transferId: z.number(), codigoBarras: z.string().optional(), nombre: z.string(), precio: z.string(), cantidad: z.number().default(1), orden: z.number().default(1) }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const result = await db.insert(transferItems).values(input);
      return { id: Number(result[0].insertId) };
    }),

  removeTransferItem: publicQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(transferItems).where(eq(transferItems.id, input.id));
      return { success: true };
    }),

  completeTransfer: publicQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(transfers).set({ estado: "completado" }).where(eq(transfers.id, input.id));
      return { success: true };
    }),

  cancelTransfer: publicQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(transfers).set({ estado: "cancelado" }).where(eq(transfers.id, input.id));
      return { success: true };
    }),

  // ========== STORE EMPLOYEES (nombres para cierre) ==========
  storeEmployees: publicQuery
    .input(z.object({ storeId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      return db.select().from(storeEmployees).where(and(eq(storeEmployees.storeId, input.storeId), eq(storeEmployees.isActive, true)));
    }),

  allStoreEmployees: publicQuery
    .query(async () => {
      const db = getDb();
      return db.select().from(storeEmployees).where(eq(storeEmployees.isActive, true));
    }),

  createStoreEmployee: publicQuery
    .input(z.object({ storeId: z.number(), nombre: z.string() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const result = await db.insert(storeEmployees).values(input);
      return { id: Number(result[0].insertId) };
    }),

  deleteStoreEmployee: publicQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(storeEmployees).set({ isActive: false }).where(eq(storeEmployees.id, input.id));
      return { success: true };
    }),

  // Fix: move employees from Bodega (storeId 1) to new Los Chiles store
  fixLosChilesEmployees: publicQuery
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
  payrollEmployees: publicQuery
    .input(z.object({ storeId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      if (input?.storeId) {
        return await db.select().from(payrollEmployees).where(and(eq(payrollEmployees.storeId, input.storeId), eq(payrollEmployees.isActive, true)));
      }
      return await db.select().from(payrollEmployees).where(eq(payrollEmployees.isActive, true));
    }),

  createPayrollEmployee: publicQuery
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

  updatePayrollEmployee: publicQuery
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

  deletePayrollEmployee: publicQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(payrollEmployees).set({ isActive: false }).where(eq(payrollEmployees.id, input.id));
      return { success: true };
    }),

  // -- Periods --
  payrollPeriods: publicQuery
    .query(async () => {
      const db = getDb();
      return await db.select().from(payrollPeriods).where(eq(payrollPeriods.isActive, true)).orderBy(desc(payrollPeriods.id));
    }),

  createPayrollPeriod: publicQuery
    .input(z.object({
      nombre: z.string(), tipo: z.enum(["quincenal", "mensual", "semanal"]),
      fechaInicio: z.string(), fechaFin: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const result = await db.insert(payrollPeriods).values(input);
      return { id: Number(result[0].insertId) };
    }),

  updatePayrollPeriod: publicQuery
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
  payrollPayments: publicQuery
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

  createPayrollPayment: publicQuery
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

  updatePayrollPayment: publicQuery
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

  deletePayrollPayment: publicQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(payrollPayments).set({ estado: "anulado" }).where(eq(payrollPayments.id, input.id));
      return { success: true };
    }),

  // -- Payroll Report --
  payrollReportByPeriod: publicQuery
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
