import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { stores, pallets, products, productDatabase, adjustments, adjustmentItems, closings } from "@db/schema";
import { eq, and, desc } from "drizzle-orm";
export const inventoryRouter = createRouter({
    // ========== STORES ==========
    stores: publicQuery.query(async () => {
        const db = getDb();
        return db.select().from(stores).where(eq(stores.isActive, true));
    }),
    storeBySlug: publicQuery
        .input(z.object({ slug: z.string() }))
        .query(async ({ input }) => {
        const db = getDb();
        const result = await db.select().from(stores).where(eq(stores.slug, input.slug)).limit(1);
        return result[0] || null;
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
        .input(z.object({
        storeId: z.number(),
        palletId: z.string(),
        description: z.string(),
        fecha: z.string().optional(),
        costo: z.string().optional(),
    }))
        .mutation(async ({ input }) => {
        const db = getDb();
        const result = await db.insert(pallets).values({
            storeId: input.storeId,
            palletId: input.palletId,
            description: input.description,
            fecha: input.fecha,
            costo: input.costo || "0",
        });
        return { id: Number(result[0].insertId) };
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
        .input(z.object({
        storeId: z.number(),
        palletId: z.number(),
        nombre: z.string(),
        precio: z.string(),
        cantidad: z.number().default(1),
        codigoBarras: z.string().optional(),
        codigo: z.string().optional(),
        esNuevo: z.boolean().default(false),
    }))
        .mutation(async ({ input }) => {
        const db = getDb();
        const result = await db.insert(products).values({
            storeId: input.storeId,
            palletId: input.palletId,
            nombre: input.nombre,
            precio: input.precio,
            cantidad: input.cantidad,
            codigoBarras: input.codigoBarras,
            codigo: input.codigo,
            esNuevo: input.esNuevo,
        });
        return { id: Number(result[0].insertId) };
    }),
    updateProduct: publicQuery
        .input(z.object({
        id: z.number(),
        nombre: z.string().optional(),
        precio: z.string().optional(),
        cantidad: z.number().optional(),
        codigoBarras: z.string().optional(),
    }))
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
        return all.filter(p => p.nombre.toLowerCase().includes(q) ||
            (p.codigoBarras && p.codigoBarras.includes(q)));
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
    adjustmentItems: publicQuery
        .input(z.object({ adjustmentId: z.number() }))
        .query(async ({ input }) => {
        const db = getDb();
        return db.select().from(adjustmentItems)
            .where(eq(adjustmentItems.adjustmentId, input.adjustmentId));
    }),
    createAdjustment: publicQuery
        .input(z.object({
        storeId: z.number(),
        palletId: z.number(),
        adjustmentId: z.string(),
        description: z.string().optional(),
        fecha: z.string().optional(),
        fechaHora: z.string().optional(),
    }))
        .mutation(async ({ input }) => {
        const db = getDb();
        const result = await db.insert(adjustments).values({
            storeId: input.storeId,
            palletId: input.palletId,
            adjustmentId: input.adjustmentId,
            description: input.description,
            fecha: input.fecha,
            fechaHora: input.fechaHora,
            estado: "activo",
        });
        return { id: Number(result[0].insertId) };
    }),
    completeAdjustment: publicQuery
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
        const db = getDb();
        await db.update(adjustments)
            .set({ estado: "completado", completedAt: new Date() })
            .where(eq(adjustments.id, input.id));
        return { success: true };
    }),
    // ========== CLOSINGS ==========
    closings: publicQuery
        .input(z.object({ storeId: z.number() }))
        .query(async ({ input }) => {
        const db = getDb();
        return db.select().from(closings)
            .where(eq(closings.storeId, input.storeId))
            .orderBy(desc(closings.fecha));
    }),
    createClosing: publicQuery
        .input(z.object({
        storeId: z.number(),
        fecha: z.string(),
        dia: z.string().optional(),
        efectivo: z.string().default("0"),
        sinpe: z.string().default("0"),
        tarjeta: z.string().default("0"),
        sinFactura: z.string().default("0"),
        total: z.string().default("0"),
        inicial: z.string().default("0"),
        semana: z.number().optional(),
        anio: z.number().optional(),
    }))
        .mutation(async ({ input }) => {
        const db = getDb();
        const result = await db.insert(closings).values(input);
        return { id: Number(result[0].insertId) };
    }),
    // ========== DASHBOARD STATS ==========
    dashboardStats: publicQuery
        .input(z.object({ storeId: z.number() }))
        .query(async ({ input }) => {
        const db = getDb();
        const palletList = await db.select().from(pallets)
            .where(and(eq(pallets.storeId, input.storeId), eq(pallets.isActive, true)));
        const productList = await db.select().from(products)
            .where(and(eq(products.storeId, input.storeId), eq(products.isActive, true)));
        const closingList = await db.select().from(closings)
            .where(eq(closings.storeId, input.storeId));
        const adjustmentList = await db.select().from(adjustments)
            .where(and(eq(adjustments.storeId, input.storeId), eq(adjustments.isActive, true)));
        const totalUnits = productList.reduce((sum, p) => sum + (p.cantidad || 1), 0);
        return {
            totalPallets: palletList.length,
            totalProducts: productList.length,
            totalUnits,
            totalClosings: closingList.length,
            totalAdjustments: adjustmentList.length,
        };
    }),
});
