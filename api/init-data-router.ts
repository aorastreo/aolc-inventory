import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function getRawDb() {
  return mysql.createConnection(process.env.DATABASE_URL!);
}

export const initDataRouter = createRouter({
  migrate: publicQuery
    .input(z.object({ secret: z.string() }))
    .query(async ({ input }) => {
      // Simple security check
      if (input.secret !== "aolc-migrate-2024") {
        throw new Error("Unauthorized");
      }

      const conn = await getRawDb();
      const results: string[] = [];

      try {
        // Check if already has data
        const [palletsCheck]: any = await conn.execute("SELECT COUNT(*) as count FROM pallets");
        if (palletsCheck[0].count > 0) {
          results.push("Data already exists!");
          return { success: true, results };
        }

        // Load backup
        const backupPath = resolve(__dirname, "../backup_data.json");
        const backupRaw = JSON.parse(readFileSync(backupPath, "utf-8"));
        
        const palletsData = JSON.parse(backupRaw.pallets || "[]");
        const productsData = JSON.parse(backupRaw.articulos || "[]");
        const closingsData = JSON.parse(backupRaw.cierres || "[]");
        const adjustmentsData = JSON.parse(backupRaw.ajustes || "[]");
        const productDbData = JSON.parse(backupRaw.baseDatos || "[]");
        const armadoresData = JSON.parse(backupRaw.armadores || "[]");
        const asignacionesData = JSON.parse(backupRaw.asignacionesArmado || "[]");

        results.push(`Migrating: ${palletsData.length} pallets, ${productsData.length} products, ${closingsData.length} closings, ${adjustmentsData.length} adjustments`);

        // Insert pallets
        for (const p of palletsData) {
          await conn.execute(
            "INSERT INTO pallets (storeId, palletId, fecha, description, costo) VALUES (1, ?, ?, ?, ?)",
            [p.id, p.fecha || null, p.descripcion, String(p.costo || 0)]
          );
        }
        results.push(`Inserted ${palletsData.length} pallets`);

        // Get pallet mapping
        const [palletRows]: any = await conn.execute("SELECT id, palletId FROM pallets WHERE storeId = 1");
        const palletMap: Record<string, number> = {};
        for (const row of palletRows) palletMap[row.palletId] = row.id;

        // Insert products
        let productCount = 0;
        for (const prod of productsData) {
          const pltId = palletMap[prod.palletId];
          if (!pltId) continue;
          await conn.execute(
            "INSERT INTO products (storeId, palletId, codigo, nombre, precio, cantidad, codigoBarras, esNuevo, ordenAgregacion) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)",
            [pltId, prod.codigo || null, prod.nombre, String(prod.precio), prod.cantidad || 1, String(prod.codigoBarras || ""), prod.esNuevo ? 1 : 0, prod.ordenAgregacion || null]
          );
          productCount++;
        }
        results.push(`Inserted ${productCount} products`);

        // Insert product database
        for (const pd of productDbData) {
          await conn.execute(
            "INSERT INTO productDatabase (storeId, nombre, precio, codigoBarras, categoria) VALUES (1, ?, ?, ?, ?)",
            [pd.nombre, String(pd.precio || 0), String(pd.codigoBarras || ""), pd.categoria || ""]
          );
        }
        results.push(`Inserted ${productDbData.length} product DB entries`);

        // Insert closings
        for (const c of closingsData) {
          await conn.execute(
            "INSERT INTO closings (storeId, fecha, dia, efectivo, sinpe, tarjeta, sinFactura, total, inicial, semana, anio) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [c.fecha, c.dia || "", String(c.efectivo || 0), String(c.sinpe || 0), String(c.tarjeta || 0), String(c.sinFactura || 0), String(c.total), String(c.inicial || 0), c.semana || null, c.anio || null]
          );
        }
        results.push(`Inserted ${closingsData.length} closings`);

        // Insert adjustments
        for (const adj of adjustmentsData) {
          const pltId = palletMap[adj.contenedorId];
          if (!pltId) continue;
          const estado = ["activo", "completado", "cancelado"].includes(adj.estado) ? adj.estado : "activo";
          const [result]: any = await conn.execute(
            "INSERT INTO adjustments (storeId, palletId, adjustmentId, description, estado, fecha, fechaHora, completedAt) VALUES (1, ?, ?, ?, ?, ?, ?, ?)",
            [pltId, adj.id, adj.descripcion || "", estado, adj.fecha || null, adj.fechaHora || null, estado === "completado" ? new Date() : null]
          );
          
          for (const item of adj.articulos || []) {
            await conn.execute(
              "INSERT INTO adjustmentItems (adjustmentId, nombre, precio, cantidad, codigoBarras, orden) VALUES (?, ?, ?, ?, ?, ?)",
              [result.insertId, item.nombre, String(item.precio), item.cantidad || 1, String(item.codigoBarras || ""), item.orden || 1]
            );
          }
        }
        results.push(`Inserted ${adjustmentsData.length} adjustments`);

        // Insert assemblers
        const asmMap: Record<number, number> = {};
        for (const a of armadoresData) {
          const [result]: any = await conn.execute(
            "INSERT INTO assemblers (storeId, nombre, telefono) VALUES (1, ?, ?)",
            [a.nombre, a.telefono || ""]
          );
          asmMap[a.id] = result.insertId;
        }

        // Insert assignments
        for (const a of asignacionesData) {
          const asmId = asmMap[a.armadorId];
          const pltId = palletMap[a.palletId];
          if (asmId && pltId) {
            await conn.execute(
              "INSERT INTO assemblyAssignments (storeId, assemblerId, palletId, fecha, items, estado) VALUES (1, ?, ?, ?, ?, ?)",
              [asmId, pltId, a.fecha || null, JSON.stringify(a.articulos || []), a.estado || "pendiente"]
            );
          }
        }

        results.push("Migration complete!");
        return { success: true, results };

      } catch (e: any) {
        results.push(`ERROR: ${e.message}`);
        return { success: false, results };
      } finally {
        await conn.end();
      }
    }),
});
