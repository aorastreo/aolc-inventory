import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { stores, pallets, products, productDatabase, adjustments, adjustmentItems, closings, assemblers, employees } from "@db/schema";
import { eq, and, desc, count } from "drizzle-orm";
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
            .orderBy(desc(pallets.createdAt));
        const productList = await db.select({
            palletId: products.palletId,
            count: count(products.id),
        }).from(products)
            .where(and(eq(products.storeId, input.storeId), eq(products.isActive, true)))
            .groupBy(products.palletId);
        const productCountMap = new Map();
        for (const p of productList) {
            productCountMap.set(p.palletId, p.count);
        }
        return palletList.map(p => ({
            id: p.id,
            palletId: p.palletId,
            fecha: p.fecha,
            description: p.description,
            costo: p.costo,
            articulos: productCountMap.get(p.id) || 0,
            ventas: null,
            ganancia: null,
        }));
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
    deleteProductDB: publicQuery
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
        const db = getDb();
        await db.update(productDatabase).set({ isActive: false }).where(eq(productDatabase.id, input.id));
        return { success: true };
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
