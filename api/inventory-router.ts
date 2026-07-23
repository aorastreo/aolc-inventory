import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import {
  stores, pallets, products, productDatabase,
  adjustments, adjustmentItems, closings, assemblers, assemblyAssignments, employees, printedLabels
} from "@db/schema";
import { eq, and, desc, like, sql, count } from "drizzle-orm";
import bcrypt from "bcryptjs";

export const inventoryRouter = createRouter({
  // ========== STORES ==========
  stores: publicQuery.query(async () => {
    const db = getDb();
    return db.select().from(stores).where(eq(stores.isActive, true));
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
      const result = await db.insert(pallets).values({ storeId: input.storeId, palletId: input.palletId, description: input.description, fecha: input.fecha, costo: input.costo || "0" });
      return { id: Number(result[0].insertId) };
    }),

  updatePallet: publicQuery
    .input(z.object({ id: z.number(), description: z.string().optional(), costo: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, ...data } = input;
      await db.update(pallets).set(data).where(eq(pallets.id, id));
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
      const result = await db.insert(products).values(input);
      return { id: Number(result[0].insertId) };
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
      const result = await db.insert(productDatabase).values(input);
      return { id: Number(result[0].insertId) };
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
      const result = await db.insert(adjustmentItems).values(input);
      return { id: Number(result[0].insertId) };
    }),

  removeAdjustmentItem: publicQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(adjustmentItems).where(eq(adjustmentItems.id, input.id));
      return { success: true };
    }),

  completeAdjustment: publicQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(adjustments).set({ estado: "completado", completedAt: new Date() }).where(eq(adjustments.id, input.id));
      return { success: true };
    }),

  cancelAdjustment: publicQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(adjustments).set({ estado: "cancelado", isActive: false }).where(eq(adjustments.id, input.id));
      return { success: true };
    }),

  // ========== CLOSINGS ==========
  closings: publicQuery
    .input(z.object({ storeId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      return db.select().from(closings).where(eq(closings.storeId, input.storeId)).orderBy(desc(closings.fecha));
    }),

  createClosing: publicQuery
    .input(z.object({ storeId: z.number(), fecha: z.string(), dia: z.string().optional(), efectivo: z.string().default("0"), sinpe: z.string().default("0"), tarjeta: z.string().default("0"), sinFactura: z.string().default("0"), total: z.string().default("0"), inicial: z.string().default("50000"), semana: z.number().optional(), anio: z.number().optional() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const result = await db.insert(closings).values(input);
      return { id: Number(result[0].insertId) };
    }),

  updateClosing: publicQuery
    .input(z.object({ id: z.number(), fecha: z.string().optional(), dia: z.string().optional(), efectivo: z.string().optional(), sinpe: z.string().optional(), tarjeta: z.string().optional(), sinFactura: z.string().optional(), total: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, ...data } = input;
      await db.update(closings).set(data).where(eq(closings.id, id));
      return { success: true };
    }),

  deleteClosing: publicQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(closings).where(eq(closings.id, input.id));
      return { success: true };
    }),

  closingStats: publicQuery
    .input(z.object({ storeId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const all = await db.select().from(closings).where(eq(closings.storeId, input.storeId)).orderBy(desc(closings.fecha));

      if (all.length === 0) {
        return { ultimo: null, semana: 0, mes: 0, total: 0, diasSemana: 0, diasMes: 0, totalCierres: 0 };
      }

      // ULTIMO: last closing
      const ultimo = all[0];
      const ultimoTotal = Number(ultimo.efectivo || 0) + Number(ultimo.tarjeta || 0) + Number(ultimo.sinpe || 0) + Number(ultimo.sinFactura || 0);

      // Get current date info
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();

      // Week calculation (Monday = 1, Sunday = 0)
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - mondayOffset);
      weekStart.setHours(0, 0, 0, 0);

      // Month start
      const monthStart = new Date(currentYear, currentMonth, 1);

      let semanaTotal = 0;
      let diasSemana = 0;
      let mesTotal = 0;
      let diasMes = 0;
      let totalAcumulado = 0;

      for (const c of all) {
        const cTotal = Number(c.efectivo || 0) + Number(c.tarjeta || 0) + Number(c.sinpe || 0) + Number(c.sinFactura || 0);
        totalAcumulado += cTotal;

        const cDate = new Date(c.fecha + "T12:00:00");

        // This week
        if (cDate >= weekStart) {
          semanaTotal += cTotal;
          diasSemana++;
        }

        // This month
        if (cDate >= monthStart) {
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
      const all = await db.select().from(closings).where(eq(closings.storeId, input.storeId)).orderBy(desc(closings.fecha));

      // Get last 7 days with data
      const dayNames = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
      const trend: { dia: string; fecha: string; total: number }[] = [];

      // Take last 7 closings
      const last7 = all.slice(0, 7).reverse();
      for (const c of last7) {
        const cDate = new Date(c.fecha + "T12:00:00");
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
      const all = await db.select().from(closings).where(eq(closings.storeId, input.storeId));

      let efectivo = 0, tarjeta = 0, sinpe = 0, sinFactura = 0;

      for (const c of all) {
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
      const all = await db.select().from(closings).where(eq(closings.storeId, input.storeId)).orderBy(desc(closings.fecha));

      // Get current week info
      const now = new Date();
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - mondayOffset);
      weekStart.setHours(0, 0, 0, 0);

      // Calculate week number
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      const daysSinceStart = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
      const weekNumber = Math.ceil((daysSinceStart + startOfYear.getDay() + 1) / 7);

      const dayNames = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
      const dayFullNames = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];

      // Initialize week days (Mon-Sun)
      const weekDays: { dia: string; fecha: string; total: number; hasData: boolean }[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        weekDays.push({
          dia: dayNames[d.getDay()],
          fecha: d.toISOString().split("T")[0],
          total: 0,
          hasData: false,
        });
      }

      let weekTotal = 0;

      // Fill in data from closings
      for (const c of all) {
        const cDate = new Date(c.fecha + "T12:00:00");
        // Only this week
        if (cDate >= weekStart && cDate < new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000)) {
          const total = Number(c.efectivo || 0) + Number(c.tarjeta || 0) + Number(c.sinpe || 0) + Number(c.sinFactura || 0);
          weekTotal += total;
          const dayIdx = cDate.getDay();
          const weekIdx = dayIdx === 0 ? 6 : dayIdx - 1; // Mon=0, Sun=6
          if (weekDays[weekIdx]) {
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
      const all = await db.select().from(closings)
        .where(eq(closings.storeId, input.storeId))
        .orderBy(desc(closings.fecha));

      const desde = new Date(input.desde + "T00:00:00");
      const hasta = new Date(input.hasta + "T23:59:59");

      const filtered = all.filter(c => {
        const cDate = new Date(c.fecha + "T12:00:00");
        return cDate >= desde && cDate <= hasta;
      });

      let totalVentas = 0;
      let totalEfectivo = 0, totalTarjeta = 0, totalSinpe = 0, totalSinFact = 0;

      const rows = filtered.map(c => {
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
        rows,
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
        .orderBy(adjustmentItems.orden);

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
      // Get all products for this pallet
      const productList = await db.select().from(products)
        .where(and(
          eq(products.storeId, input.storeId),
          eq(products.palletId, input.palletId),
          eq(products.isActive, true)
        ))
        .orderBy(products.nombre);

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
});
