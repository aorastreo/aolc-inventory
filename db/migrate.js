import { getDb } from "../api/queries/connection";
import { pallets, products, productDatabase, adjustments, adjustmentItems, closings, assemblers, assemblyAssignments } from "./schema";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
// Store ID for Los Chiles (first store)
const STORE_ID = 1;
async function migrate() {
    const db = getDb();
    console.log("[Migrate] Starting data migration...");
    const adminBackup = JSON.parse(readFileSync(resolve(__dirname, "../backup_admin.json"), "utf-8"));
    // Parse stringified JSON fields
    const palletsData = JSON.parse(adminBackup.pallets);
    const productsData = JSON.parse(adminBackup.articulos);
    const closingsData = JSON.parse(adminBackup.cierres);
    const adjustmentsData = JSON.parse(adminBackup.ajustes);
    const productDbData = JSON.parse(adminBackup.baseDatos);
    const armadoresData = JSON.parse(adminBackup.armadores);
    const asignacionesData = JSON.parse(adminBackup.asignacionesArmado);
    console.log(`[Migrate] Pallets: ${palletsData.length}`);
    console.log(`[Migrate] Products: ${productsData.length}`);
    console.log(`[Migrate] Closings: ${closingsData.length}`);
    console.log(`[Migrate] Adjustments: ${adjustmentsData.length}`);
    console.log(`[Migrate] Product DB: ${productDbData.length}`);
    // 1. Insert Pallets
    console.log("[Migrate] Inserting pallets...");
    const palletIdMap = new Map(); // old ID -> new DB ID
    for (const p of palletsData) {
        const result = await db.insert(pallets).values({
            storeId: STORE_ID,
            palletId: p.id,
            fecha: p.fecha,
            description: p.descripcion,
            costo: String(p.costo),
        });
        const newId = Number(result[0].insertId);
        palletIdMap.set(p.id, newId);
        console.log(`  Pallet ${p.id} -> DB ID ${newId}`);
    }
    // 2. Insert Products
    console.log("[Migrate] Inserting products...");
    const productIdMap = new Map(); // old ID -> new DB ID
    for (const prod of productsData) {
        const newPalletId = palletIdMap.get(prod.palletId);
        if (!newPalletId) {
            console.log(`  Skipping product ${prod.id} - pallet ${prod.palletId} not found`);
            continue;
        }
        const result = await db.insert(products).values({
            storeId: STORE_ID,
            palletId: newPalletId,
            codigo: prod.codigo,
            nombre: prod.nombre,
            precio: String(prod.precio),
            cantidad: prod.cantidad || 1,
            codigoBarras: String(prod.codigoBarras),
            esNuevo: prod.esNuevo || false,
            ordenAgregacion: prod.ordenAgregacion,
        });
        const newId = Number(result[0].insertId);
        productIdMap.set(prod.id, newId);
    }
    console.log(`[Migrate] Inserted ${productIdMap.size} products`);
    // 3. Insert Product Database
    console.log("[Migrate] Inserting product database...");
    for (const pd of productDbData) {
        await db.insert(productDatabase).values({
            storeId: STORE_ID,
            nombre: pd.nombre,
            precio: String(pd.precio),
            codigoBarras: String(pd.codigoBarras),
            categoria: pd.categoria || "",
        });
    }
    console.log(`[Migrate] Inserted ${productDbData.length} product DB entries`);
    // 4. Insert Adjustments
    console.log("[Migrate] Inserting adjustments...");
    const adjustmentIdMap = new Map(); // old adjustment ID -> new DB ID
    for (const adj of adjustmentsData) {
        const newPalletId = palletIdMap.get(adj.contenedorId);
        if (!newPalletId) {
            console.log(`  Skipping adjustment ${adj.id} - pallet ${adj.contenedorId} not found`);
            continue;
        }
        const result = await db.insert(adjustments).values({
            storeId: STORE_ID,
            palletId: newPalletId,
            adjustmentId: adj.id,
            description: adj.descripcion,
            estado: adj.estado === "cancelado" ? "cancelado" : adj.estado === "completado" ? "completado" : "activo",
            fecha: adj.fecha,
            fechaHora: adj.fechaHora,
            completedAt: adj.estado === "completado" ? new Date() : null,
        });
        const newId = Number(result[0].insertId);
        adjustmentIdMap.set(adj.id, newId);
        // Insert adjustment items
        if (adj.articulos && Array.isArray(adj.articulos)) {
            for (const item of adj.articulos) {
                await db.insert(adjustmentItems).values({
                    adjustmentId: newId,
                    nombre: item.nombre,
                    precio: String(item.precio),
                    cantidad: item.cantidad || 1,
                    codigoBarras: String(item.codigoBarras),
                    orden: item.orden || 1,
                });
            }
        }
    }
    console.log(`[Migrate] Inserted ${adjustmentIdMap.size} adjustments`);
    // 5. Insert Closings
    console.log("[Migrate] Inserting closings...");
    for (const c of closingsData) {
        await db.insert(closings).values({
            storeId: STORE_ID,
            fecha: c.fecha,
            dia: c.dia,
            efectivo: String(c.efectivo),
            sinpe: String(c.sinpe),
            tarjeta: String(c.tarjeta),
            sinFactura: String(c.sinFactura || 0),
            total: String(c.total),
            inicial: String(c.inicial || 0),
            semana: c.semana,
            anio: c.anio,
        });
    }
    console.log(`[Migrate] Inserted ${closingsData.length} closings`);
    // 6. Insert Assemblers
    console.log("[Migrate] Inserting assemblers...");
    const assemblerIdMap = new Map();
    for (const a of armadoresData) {
        const result = await db.insert(assemblers).values({
            storeId: STORE_ID,
            nombre: a.nombre,
            telefono: a.telefono,
        });
        const newId = Number(result[0].insertId);
        assemblerIdMap.set(a.id, newId);
    }
    console.log(`[Migrate] Inserted ${armadoresData.length} assemblers`);
    // 7. Insert Assembly Assignments
    console.log("[Migrate] Inserting assembly assignments...");
    for (const a of asignacionesData) {
        const newAssemblerId = assemblerIdMap.get(a.armadorId);
        const newPalletId = palletIdMap.get(a.palletId);
        if (!newAssemblerId || !newPalletId)
            continue;
        await db.insert(assemblyAssignments).values({
            storeId: STORE_ID,
            assemblerId: newAssemblerId,
            palletId: newPalletId,
            fecha: a.fecha,
            items: a.articulos,
            estado: a.estado || "pendiente",
        });
    }
    console.log(`[Migrate] Inserted ${asignacionesData.length} assignments`);
    console.log("\n[Migrate] ✅ Migration complete!");
    console.log(`  Store: Los Chiles (ID: ${STORE_ID})`);
    console.log(`  Pallets: ${palletIdMap.size}`);
    console.log(`  Products: ${productIdMap.size}`);
    console.log(`  Closings: ${closingsData.length}`);
    console.log(`  Adjustments: ${adjustmentIdMap.size}`);
}
migrate().catch(console.error);
