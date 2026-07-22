import mysql from "mysql2/promise";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
async function getRawDb() {
    return mysql.createConnection(process.env.DATABASE_URL);
}
function loadBackup() {
    const backupPath = resolve(__dirname, "backup_data.json");
    const backupRaw = JSON.parse(readFileSync(backupPath, "utf-8"));
    return {
        pallets: JSON.parse(backupRaw.pallets || "[]"),
        products: JSON.parse(backupRaw.articulos || "[]"),
        closings: JSON.parse(backupRaw.cierres || "[]"),
        adjustments: JSON.parse(backupRaw.ajustes || "[]"),
        productDb: JSON.parse(backupRaw.baseDatos || "[]"),
        assemblers: JSON.parse(backupRaw.armadores || "[]"),
        assignments: JSON.parse(backupRaw.asignacionesArmado || "[]"),
    };
}
export function initRoute(app) {
    // Migrate data (inserts only if empty)
    app.get("/api/init-data", async (c) => {
        const secret = c.req.query("secret");
        if (secret !== "aolc-migrate-2024")
            return c.json({ error: "Unauthorized" }, 401);
        const conn = await getRawDb();
        const results = [];
        try {
            const [check] = await conn.execute("SELECT COUNT(*) as count FROM pallets");
            if (check[0].count > 0) {
                results.push("Data already exists! Use /api/reset-data to replace.");
                return c.json({ success: true, results });
            }
            const data = loadBackup();
            results.push(`Migrating: ${data.pallets.length} pallets, ${data.products.length} products, ${data.closings.length} closings, ${data.adjustments.length} adjustments`);
            // Pallets
            for (const p of data.pallets) {
                await conn.execute("INSERT INTO pallets (storeId, palletId, fecha, description, costo) VALUES (1, ?, ?, ?, ?)", [p.id, p.fecha || null, p.descripcion, String(p.costo || 0)]);
            }
            results.push(`Inserted ${data.pallets.length} pallets`);
            // Products
            const [palletRows] = await conn.execute("SELECT id, palletId FROM pallets WHERE storeId = 1");
            const palletMap = {};
            for (const row of palletRows)
                palletMap[row.palletId] = row.id;
            let productCount = 0;
            for (const prod of data.products) {
                const pltId = palletMap[prod.palletId];
                if (!pltId)
                    continue;
                await conn.execute("INSERT INTO products (storeId, palletId, codigo, nombre, precio, cantidad, codigoBarras, esNuevo, ordenAgregacion) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)", [pltId, prod.codigo || null, prod.nombre, String(prod.precio), prod.cantidad || 1, String(prod.codigoBarras || ""), prod.esNuevo ? 1 : 0, prod.ordenAgregacion || null]);
                productCount++;
            }
            results.push(`Inserted ${productCount} products`);
            // Product DB
            for (const pd of data.productDb) {
                await conn.execute("INSERT INTO productDatabase (storeId, nombre, precio, codigoBarras, categoria) VALUES (1, ?, ?, ?, ?)", [pd.nombre, String(pd.precio || 0), String(pd.codigoBarras || ""), pd.categoria || ""]);
            }
            results.push(`Inserted ${data.productDb.length} product DB entries`);
            // Closings
            for (const c of data.closings) {
                await conn.execute("INSERT INTO closings (storeId, fecha, dia, efectivo, sinpe, tarjeta, sinFactura, total, inicial, semana, anio) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [c.fecha, c.dia || "", String(c.efectivo || 0), String(c.sinpe || 0), String(c.tarjeta || 0), String(c.sinFactura || 0), String(c.total), String(c.inicial || 0), c.semana || null, c.anio || null]);
            }
            results.push(`Inserted ${data.closings.length} closings`);
            // Adjustments
            for (const adj of data.adjustments) {
                const pltId = palletMap[adj.contenedorId];
                if (!pltId)
                    continue;
                const estado = ["activo", "completado", "cancelado"].includes(adj.estado) ? adj.estado : "activo";
                const [result] = await conn.execute("INSERT INTO adjustments (storeId, palletId, adjustmentId, description, estado, fecha, fechaHora, completedAt) VALUES (1, ?, ?, ?, ?, ?, ?, ?)", [pltId, adj.id, adj.descripcion || "", estado, adj.fecha || null, adj.fechaHora || null, estado === "completado" ? new Date() : null]);
                for (const item of adj.articulos || []) {
                    await conn.execute("INSERT INTO adjustmentItems (adjustmentId, nombre, precio, cantidad, codigoBarras, orden) VALUES (?, ?, ?, ?, ?, ?)", [result.insertId, item.nombre, String(item.precio), item.cantidad || 1, String(item.codigoBarras || ""), item.orden || 1]);
                }
            }
            results.push(`Inserted ${data.adjustments.length} adjustments`);
            // Assemblers
            const asmMap = {};
            for (const a of data.assemblers) {
                const [result] = await conn.execute("INSERT INTO assemblers (storeId, nombre, telefono) VALUES (1, ?, ?)", [a.nombre, a.telefono || ""]);
                asmMap[a.id] = result.insertId;
            }
            // Assignments
            for (const a of data.assignments) {
                const asmId = asmMap[a.armadorId];
                const pltId = palletMap[a.palletId];
                if (asmId && pltId) {
                    await conn.execute("INSERT INTO assemblyAssignments (storeId, assemblerId, palletId, fecha, items, estado) VALUES (1, ?, ?, ?, ?, ?)", [asmId, pltId, a.fecha || null, JSON.stringify(a.articulos || []), a.estado || "pendiente"]);
                }
            }
            results.push("Migration complete!");
            return c.json({ success: true, results });
        }
        catch (e) {
            results.push(`ERROR: ${e.message}`);
            return c.json({ success: false, results }, 500);
        }
        finally {
            await conn.end();
        }
    });
    // RESET data (truncates and re-inserts)
    app.get("/api/reset-data", async (c) => {
        const secret = c.req.query("secret");
        if (secret !== "aolc-migrate-2024")
            return c.json({ error: "Unauthorized" }, 401);
        const conn = await getRawDb();
        const results = [];
        try {
            // Clear all data tables
            await conn.execute("SET FOREIGN_KEY_CHECKS = 0");
            await conn.execute("TRUNCATE TABLE pallets");
            await conn.execute("TRUNCATE TABLE products");
            await conn.execute("TRUNCATE TABLE productDatabase");
            await conn.execute("TRUNCATE TABLE adjustments");
            await conn.execute("TRUNCATE TABLE adjustmentItems");
            await conn.execute("TRUNCATE TABLE closings");
            await conn.execute("TRUNCATE TABLE assemblers");
            await conn.execute("TRUNCATE TABLE assemblyAssignments");
            await conn.execute("SET FOREIGN_KEY_CHECKS = 1");
            results.push("All data tables cleared!");
            const data = loadBackup();
            results.push(`Inserting: ${data.pallets.length} pallets, ${data.products.length} products, ${data.closings.length} closings, ${data.adjustments.length} adjustments`);
            // Pallets
            for (const p of data.pallets) {
                await conn.execute("INSERT INTO pallets (storeId, palletId, fecha, description, costo) VALUES (1, ?, ?, ?, ?)", [p.id, p.fecha || null, p.descripcion, String(p.costo || 0)]);
            }
            results.push(`Inserted ${data.pallets.length} pallets`);
            // Products
            const [palletRows] = await conn.execute("SELECT id, palletId FROM pallets WHERE storeId = 1");
            const palletMap = {};
            for (const row of palletRows)
                palletMap[row.palletId] = row.id;
            let productCount = 0;
            for (const prod of data.products) {
                const pltId = palletMap[prod.palletId];
                if (!pltId)
                    continue;
                await conn.execute("INSERT INTO products (storeId, palletId, codigo, nombre, precio, cantidad, codigoBarras, esNuevo, ordenAgregacion) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)", [pltId, prod.codigo || null, prod.nombre, String(prod.precio), prod.cantidad || 1, String(prod.codigoBarras || ""), prod.esNuevo ? 1 : 0, prod.ordenAgregacion || null]);
                productCount++;
            }
            results.push(`Inserted ${productCount} products`);
            // Product DB
            for (const pd of data.productDb) {
                await conn.execute("INSERT INTO productDatabase (storeId, nombre, precio, codigoBarras, categoria) VALUES (1, ?, ?, ?, ?)", [pd.nombre, String(pd.precio || 0), String(pd.codigoBarras || ""), pd.categoria || ""]);
            }
            results.push(`Inserted ${data.productDb.length} product DB entries`);
            // Closings
            for (const c of data.closings) {
                await conn.execute("INSERT INTO closings (storeId, fecha, dia, efectivo, sinpe, tarjeta, sinFactura, total, inicial, semana, anio) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [c.fecha, c.dia || "", String(c.efectivo || 0), String(c.sinpe || 0), String(c.tarjeta || 0), String(c.sinFactura || 0), String(c.total), String(c.inicial || 0), c.semana || null, c.anio || null]);
            }
            results.push(`Inserted ${data.closings.length} closings`);
            // Adjustments
            for (const adj of data.adjustments) {
                const pltId = palletMap[adj.contenedorId];
                if (!pltId)
                    continue;
                const estado = ["activo", "completado", "cancelado"].includes(adj.estado) ? adj.estado : "activo";
                const [result] = await conn.execute("INSERT INTO adjustments (storeId, palletId, adjustmentId, description, estado, fecha, fechaHora, completedAt) VALUES (1, ?, ?, ?, ?, ?, ?, ?)", [pltId, adj.id, adj.descripcion || "", estado, adj.fecha || null, adj.fechaHora || null, estado === "completado" ? new Date() : null]);
                for (const item of adj.articulos || []) {
                    await conn.execute("INSERT INTO adjustmentItems (adjustmentId, nombre, precio, cantidad, codigoBarras, orden) VALUES (?, ?, ?, ?, ?, ?)", [result.insertId, item.nombre, String(item.precio), item.cantidad || 1, String(item.codigoBarras || ""), item.orden || 1]);
                }
            }
            results.push(`Inserted ${data.adjustments.length} adjustments`);
            // Assemblers
            const asmMap = {};
            for (const a of data.assemblers) {
                const [result] = await conn.execute("INSERT INTO assemblers (storeId, nombre, telefono) VALUES (1, ?, ?)", [a.nombre, a.telefono || ""]);
                asmMap[a.id] = result.insertId;
            }
            // Assignments
            for (const a of data.assignments) {
                const asmId = asmMap[a.armadorId];
                const pltId = palletMap[a.palletId];
                if (asmId && pltId) {
                    await conn.execute("INSERT INTO assemblyAssignments (storeId, assemblerId, palletId, fecha, items, estado) VALUES (1, ?, ?, ?, ?, ?)", [asmId, pltId, a.fecha || null, JSON.stringify(a.articulos || []), a.estado || "pendiente"]);
                }
            }
            results.push("Reset complete with new data!");
            return c.json({ success: true, results });
        }
        catch (e) {
            results.push(`ERROR: ${e.message}`);
            return c.json({ success: false, results }, 500);
        }
        finally {
            await conn.end();
        }
    });
}
