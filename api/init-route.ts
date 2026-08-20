import { Hono } from "hono";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function getRawDb() {
  return mysql.createConnection(process.env.DATABASE_URL!);
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

export function initRoute(app: Hono) {
  // Migrate data (inserts only if empty)
  app.get("/api/init-data", async (c) => {
    const secret = c.req.query("secret");
    if (secret !== "aolc-migrate-2024") return c.json({ error: "Unauthorized" }, 401);

    const conn = await getRawDb();
    const results: string[] = [];

    try {
      const [check]: any = await conn.execute("SELECT COUNT(*) as count FROM pallets");
      if (check[0].count > 0) {
        results.push("Data already exists! Use /api/reset-data to replace.");
        return c.json({ success: true, results });
      }

      const data = loadBackup();
      results.push(`Migrating: ${data.pallets.length} pallets, ${data.products.length} products, ${data.closings.length} closings, ${data.adjustments.length} adjustments`);

      // Pallets
      for (const p of data.pallets) {
        await conn.execute("INSERT INTO pallets (storeId, palletId, fecha, description, costo) VALUES (1, ?, ?, ?, ?)",
          [p.id, p.fecha || null, p.descripcion, String(p.costo || 0)]);
      }
      results.push(`Inserted ${data.pallets.length} pallets`);

      // Products
      const [palletRows]: any = await conn.execute("SELECT id, palletId FROM pallets WHERE storeId = 1");
      const palletMap: Record<string, number> = {};
      for (const row of palletRows) palletMap[row.palletId] = row.id;

      let productCount = 0;
      for (const prod of data.products) {
        const pltId = palletMap[prod.palletId];
        if (!pltId) continue;
        await conn.execute("INSERT INTO products (storeId, palletId, codigo, nombre, precio, cantidad, codigoBarras, esNuevo, ordenAgregacion) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)",
          [pltId, prod.codigo || null, prod.nombre, String(prod.precio), prod.cantidad || 1, String(prod.codigoBarras || ""), prod.esNuevo ? 1 : 0, prod.ordenAgregacion || null]);
        productCount++;
      }
      results.push(`Inserted ${productCount} products`);

      // Product DB
      for (const pd of data.productDb) {
        await conn.execute("INSERT INTO productDatabase (storeId, nombre, precio, codigoBarras, categoria) VALUES (1, ?, ?, ?, ?)",
          [pd.nombre, String(pd.precio || 0), String(pd.codigoBarras || ""), pd.categoria || ""]);
      }
      results.push(`Inserted ${data.productDb.length} product DB entries`);

      // Closings
      for (const c of data.closings) {
        await conn.execute("INSERT INTO closings (storeId, fecha, dia, efectivo, sinpe, tarjeta, sinFactura, total, inicial, semana, anio) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [c.fecha, c.dia || "", String(c.efectivo || 0), String(c.sinpe || 0), String(c.tarjeta || 0), String(c.sinFactura || 0), String(c.total), String(c.inicial || 0), c.semana || null, c.anio || null]);
      }
      results.push(`Inserted ${data.closings.length} closings`);

      // Adjustments
      for (const adj of data.adjustments) {
        const pltId = palletMap[adj.contenedorId];
        if (!pltId) continue;
        const estado = ["activo", "completado", "cancelado"].includes(adj.estado) ? adj.estado : "activo";
        const [result]: any = await conn.execute("INSERT INTO adjustments (storeId, palletId, adjustmentId, description, estado, fecha, fechaHora, completedAt) VALUES (1, ?, ?, ?, ?, ?, ?, ?)",
          [pltId, adj.id, adj.descripcion || "", estado, adj.fecha || null, adj.fechaHora || null, estado === "completado" ? new Date() : null]);
        for (const item of adj.articulos || []) {
          await conn.execute("INSERT INTO adjustmentItems (adjustmentId, nombre, precio, cantidad, codigoBarras, orden) VALUES (?, ?, ?, ?, ?, ?)",
            [result.insertId, item.nombre, String(item.precio), item.cantidad || 1, String(item.codigoBarras || ""), item.orden || 1]);
        }
      }
      results.push(`Inserted ${data.adjustments.length} adjustments`);

      // Assemblers
      const asmMap: Record<number, number> = {};
      for (const a of data.assemblers) {
        const [result]: any = await conn.execute("INSERT INTO assemblers (storeId, nombre, telefono) VALUES (1, ?, ?)", [a.nombre, a.telefono || ""]);
        asmMap[a.id] = result.insertId;
      }

      // Assignments
      for (const a of data.assignments) {
        const asmId = asmMap[a.armadorId];
        const pltId = palletMap[a.palletId];
        if (asmId && pltId) {
          await conn.execute("INSERT INTO assemblyAssignments (storeId, assemblerId, palletId, fecha, items, estado) VALUES (1, ?, ?, ?, ?, ?)",
            [asmId, pltId, a.fecha || null, JSON.stringify(a.articulos || []), a.estado || "pendiente"]);
        }
      }

      results.push("Migration complete!");
      return c.json({ success: true, results });
    } catch (e: any) {
      results.push(`ERROR: ${e.message}`);
      return c.json({ success: false, results }, 500);
    } finally {
      await conn.end();
    }
  });

  // RESET data (truncates and re-inserts)
  app.get("/api/reset-data", async (c) => {
    const secret = c.req.query("secret");
    if (secret !== "aolc-migrate-2024") return c.json({ error: "Unauthorized" }, 401);

    const conn = await getRawDb();
    const results: string[] = [];

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
        await conn.execute("INSERT INTO pallets (storeId, palletId, fecha, description, costo) VALUES (1, ?, ?, ?, ?)",
          [p.id, p.fecha || null, p.descripcion, String(p.costo || 0)]);
      }
      results.push(`Inserted ${data.pallets.length} pallets`);

      // Products
      const [palletRows]: any = await conn.execute("SELECT id, palletId FROM pallets WHERE storeId = 1");
      const palletMap: Record<string, number> = {};
      for (const row of palletRows) palletMap[row.palletId] = row.id;

      let productCount = 0;
      for (const prod of data.products) {
        const pltId = palletMap[prod.palletId];
        if (!pltId) continue;
        await conn.execute("INSERT INTO products (storeId, palletId, codigo, nombre, precio, cantidad, codigoBarras, esNuevo, ordenAgregacion) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)",
          [pltId, prod.codigo || null, prod.nombre, String(prod.precio), prod.cantidad || 1, String(prod.codigoBarras || ""), prod.esNuevo ? 1 : 0, prod.ordenAgregacion || null]);
        productCount++;
      }
      results.push(`Inserted ${productCount} products`);

      // Product DB
      for (const pd of data.productDb) {
        await conn.execute("INSERT INTO productDatabase (storeId, nombre, precio, codigoBarras, categoria) VALUES (1, ?, ?, ?, ?)",
          [pd.nombre, String(pd.precio || 0), String(pd.codigoBarras || ""), pd.categoria || ""]);
      }
      results.push(`Inserted ${data.productDb.length} product DB entries`);

      // Closings
      for (const c of data.closings) {
        await conn.execute("INSERT INTO closings (storeId, fecha, dia, efectivo, sinpe, tarjeta, sinFactura, total, inicial, semana, anio) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [c.fecha, c.dia || "", String(c.efectivo || 0), String(c.sinpe || 0), String(c.tarjeta || 0), String(c.sinFactura || 0), String(c.total), String(c.inicial || 0), c.semana || null, c.anio || null]);
      }
      results.push(`Inserted ${data.closings.length} closings`);

      // Adjustments
      for (const adj of data.adjustments) {
        const pltId = palletMap[adj.contenedorId];
        if (!pltId) continue;
        const estado = ["activo", "completado", "cancelado"].includes(adj.estado) ? adj.estado : "activo";
        const [result]: any = await conn.execute("INSERT INTO adjustments (storeId, palletId, adjustmentId, description, estado, fecha, fechaHora, completedAt) VALUES (1, ?, ?, ?, ?, ?, ?, ?)",
          [pltId, adj.id, adj.descripcion || "", estado, adj.fecha || null, adj.fechaHora || null, estado === "completado" ? new Date() : null]);
        for (const item of adj.articulos || []) {
          await conn.execute("INSERT INTO adjustmentItems (adjustmentId, nombre, precio, cantidad, codigoBarras, orden) VALUES (?, ?, ?, ?, ?, ?)",
            [result.insertId, item.nombre, String(item.precio), item.cantidad || 1, String(item.codigoBarras || ""), item.orden || 1]);
        }
      }
      results.push(`Inserted ${data.adjustments.length} adjustments`);

      // Assemblers
      const asmMap: Record<number, number> = {};
      for (const a of data.assemblers) {
        const [result]: any = await conn.execute("INSERT INTO assemblers (storeId, nombre, telefono) VALUES (1, ?, ?)", [a.nombre, a.telefono || ""]);
        asmMap[a.id] = result.insertId;
      }

      // Assignments
      for (const a of data.assignments) {
        const asmId = asmMap[a.armadorId];
        const pltId = palletMap[a.palletId];
        if (asmId && pltId) {
          await conn.execute("INSERT INTO assemblyAssignments (storeId, assemblerId, palletId, fecha, items, estado) VALUES (1, ?, ?, ?, ?, ?)",
            [asmId, pltId, a.fecha || null, JSON.stringify(a.articulos || []), a.estado || "pendiente"]);
        }
      }

      results.push("Reset complete with new data!");
      return c.json({ success: true, results });
    } catch (e: any) {
      results.push(`ERROR: ${e.message}`);
      return c.json({ success: false, results }, 500);
    } finally {
      await conn.end();
    }
  });

  // Force apply a completed adjustment to its container (pallet)
  app.get("/api/force-apply-adjustment", async (c) => {
    const id = c.req.query("id");
    if (!id) return c.json({ error: "Missing ?id= parameter" }, 400);

    const conn = await getRawDb();
    try {
      // Get adjustment
      const [adjRows]: any = await conn.execute("SELECT * FROM adjustments WHERE id = ?", [id]);
      if (adjRows.length === 0) return c.json({ error: "Adjustment not found" }, 404);
      const adj = adjRows[0];

      // Get items
      const [itemRows]: any = await conn.execute("SELECT * FROM adjustmentItems WHERE adjustmentId = ?", [id]);
      if (itemRows.length === 0) return c.json({ error: "No items in adjustment" }, 400);

      // Insert items as products
      let productsAdded = 0;
      for (const item of itemRows) {
        await conn.execute(
          "INSERT INTO products (storeId, palletId, nombre, precio, cantidad, codigoBarras, esNuevo) VALUES (?, ?, ?, ?, ?, ?, false)",
          [adj.storeId, adj.palletId, item.nombre, String(item.precio), item.cantidad, item.codigoBarras]
        );
        productsAdded++;
      }

      return c.json({ success: true, productsAdded, adjustmentId: adj.id, palletId: adj.palletId });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    } finally {
      await conn.end();
    }
  });

  // Quick add store
  app.get("/api/add-store", async (c) => {
    const name = c.req.query("name");
    const slug = c.req.query("slug");
    if (!name || !slug) return c.json({ error: "Missing ?name= and ?slug= parameters" }, 400);

    const conn = await getRawDb();
    try {
      const [result]: any = await conn.execute(
        "INSERT INTO stores (name, slug, description, isActive) VALUES (?, ?, ?, true)",
        [name, slug, name]
      );
      return c.json({ success: true, id: result.insertId, name, slug });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    } finally {
      await conn.end();
    }
  });

  // Quick rename store
  app.get("/api/rename-store", async (c) => {
    const id = c.req.query("id");
    const name = c.req.query("name");
    const slug = c.req.query("slug");
    if (!id || !name) return c.json({ error: "Missing ?id= and ?name= parameters" }, 400);

    const conn = await getRawDb();
    try {
      if (slug) {
        await conn.execute("UPDATE stores SET name = ?, description = ?, slug = ? WHERE id = ?", [name, name, slug, id]);
      } else {
        await conn.execute("UPDATE stores SET name = ?, description = ? WHERE id = ?", [name, name, id]);
      }
      return c.json({ success: true, id, name, slug });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    } finally {
      await conn.end();
    }
  });

  // Check all stores in DB
  app.get("/api/check-stores", async (c) => {
    const conn = await getRawDb();
    try {
      const [rows]: any = await conn.execute("SELECT id, name, slug, isActive FROM stores ORDER BY id");
      return c.json({ stores: rows });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    } finally {
      await conn.end();
    }
  });

  // Migrate closings table - add new columns
  app.get("/api/migrate-closings", async (c) => {
    const conn = await getRawDb();
    const results: string[] = [];
    try {
      // Add new columns if they don't exist
      const columns = [
        "ALTER TABLE closings ADD COLUMN hora VARCHAR(10) DEFAULT NULL",
        "ALTER TABLE closings ADD COLUMN diferencia DECIMAL(12,2) DEFAULT 0",
        "ALTER TABLE closings ADD COLUMN observaciones TEXT DEFAULT NULL",
        "ALTER TABLE closings ADD COLUMN revisado TINYINT(1) DEFAULT 0 NOT NULL",
        "ALTER TABLE closings ADD COLUMN createdBy VARCHAR(255) DEFAULT NULL",
        "ALTER TABLE closings ADD COLUMN cierreHora TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
      ];
      for (const sql of columns) {
        try {
          await conn.execute(sql);
          results.push(`OK: ${sql.split("ADD COLUMN")[1].split(" ")[1]}`);
        } catch (e: any) {
          if (e.message.includes("Duplicate column")) {
            results.push(`SKIP: ${sql.split("ADD COLUMN")[1].split(" ")[1]} already exists`);
          } else {
            results.push(`ERR: ${e.message}`);
          }
        }
      }

      // Create storeConfig table
      try {
        await conn.execute(`
          CREATE TABLE IF NOT EXISTS storeConfig (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            storeId BIGINT UNSIGNED NOT NULL UNIQUE,
            montoInicial DECIMAL(12,2) DEFAULT 50000,
            updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
          )
        `);
        results.push("OK: storeConfig table created");

        // Seed default values
        await conn.execute("INSERT INTO storeConfig (storeId, montoInicial) VALUES (1, 50000) ON DUPLICATE KEY UPDATE montoInicial = VALUES(montoInicial)");
        results.push("OK: storeConfig seeded");
      } catch (e: any) {
        results.push(`ERR storeConfig: ${e.message}`);
      }

      return c.json({ success: true, results });
    } catch (e: any) {
      return c.json({ success: false, error: e.message, results }, 500);
    } finally {
      await conn.end();
    }
  });

  // Add registradoPor column to closings (simple fix)
  app.get("/api/fix-closings-registradoPor", async (c) => {
    const conn = await getRawDb();
    try {
      await conn.execute("ALTER TABLE closings ADD COLUMN registradoPor VARCHAR(255) DEFAULT NULL");
      return c.json({ success: true, message: "registradoPor added" });
    } catch (e: any) {
      if (e.message.includes("Duplicate column")) {
        return c.json({ success: true, message: "registradoPor already exists" });
      }
      return c.json({ success: false, error: e.message }, 500);
    } finally {
      await conn.end();
    }
  });

  // Check closings columns
  // Quick fix - add registradoPor column to closings
  app.get("/api/fix-closings-registradoPor", async (c) => {
    const conn = await getRawDb();
    const results: string[] = [];
    try {
      // Add registradoPor to closings
      try {
        await conn.execute("ALTER TABLE closings ADD COLUMN registradoPor VARCHAR(255) DEFAULT NULL");
        results.push("OK: registradoPor column added to closings");
      } catch (e: any) {
        if (e.message.includes("Duplicate column")) {
          results.push("SKIP: registradoPor already exists in closings");
        } else {
          results.push(`ERR closings: ${e.message}`);
        }
      }

      // Create storeEmployees table
      try {
        await conn.execute(`
          CREATE TABLE IF NOT EXISTS storeEmployees (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            storeId BIGINT UNSIGNED NOT NULL,
            nombre VARCHAR(255) NOT NULL,
            isActive TINYINT(1) DEFAULT 1 NOT NULL,
            createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        results.push("OK: storeEmployees table created");
      } catch (e: any) {
        results.push(`ERR storeEmployees: ${e.message}`);
      }

      return c.json({ success: true, results });
    } catch (e: any) {
      return c.json({ success: false, error: e.message, results }, 500);
    } finally {
      await conn.end();
    }
  });

  // Check closings columns
  app.get("/api/check-closings-columns", async (c) => {
    const conn = await getRawDb();
    try {
      const [rows]: any = await conn.execute("SHOW COLUMNS FROM closings");
      return c.json({ columns: rows.map((r: any) => r.Field) });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    } finally {
      await conn.end();
    }
  });

  // Migrate closings from Bodega (old Los Chiles) to new Los Chiles store + update German's store
  app.get("/api/migrate-loschiles", async (c) => {
    const conn = await getRawDb();
    try {
      // 1. Find the new Los Chiles store (not Bodega = id 1)
      const [losChilesRows]: any = await conn.execute(
        "SELECT id FROM stores WHERE (name LIKE ? OR slug = ?) AND id != 1 LIMIT 1",
        ["%Los Chiles%", "los-chiles"]
      );
      if (!losChilesRows || losChilesRows.length === 0) {
        return c.json({ error: "No se encontro tienda Los Chiles. Primero creala con /api/add-store" }, 404);
      }
      const losChilesId = losChilesRows[0].id;

      const results: string[] = [];
      results.push(`Tienda Los Chiles encontrada: id=${losChilesId}`);

      // 2. Move closings from storeId 1 (old Los Chiles) to new Los Chiles
      const [cierresResult]: any = await conn.execute(
        "UPDATE closings SET storeId = ? WHERE storeId = 1",
        [losChilesId]
      );
      results.push(`Cierres movidos: ${cierresResult.affectedRows || 0}`);

      // 3. Move pallets from storeId 1 to new Los Chiles (if needed later)
      // Note: Pallets stay in Bodega, that's correct

      // 4. Update German's storeId from 1 to Los Chiles
      const [germanResult]: any = await conn.execute(
        "UPDATE employees SET storeId = ? WHERE username = 'german' AND storeId = 1",
        [losChilesId]
      );
      results.push(`German actualizado: ${germanResult.affectedRows || 0}`);

      // 5. Also update any other employees that were on store 1 (old Los Chiles) to new Los Chiles
      const [otherEmps]: any = await conn.execute(
        "UPDATE employees SET storeId = ? WHERE storeId = 1 AND username != 'german'",
        [losChilesId]
      );
      results.push(`Otros empleados actualizados: ${otherEmps.affectedRows || 0}`);

      return c.json({ success: true, losChilesId, results });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    } finally {
      await conn.end();
    }
  });

  // List active employees
  app.get("/api/list-employees", async (c) => {
    const conn = await getRawDb();
    try {
      const [rows]: any = await conn.execute(
        "SELECT id, username, name, storeId, role FROM employees WHERE isActive = true ORDER BY storeId"
      );
      return c.json({ employees: rows });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    } finally {
      await conn.end();
    }
  });

  // Reset employee password
  app.get("/api/reset-password", async (c) => {
    const id = c.req.query("id");
    const password = c.req.query("password");
    if (!id || !password) return c.json({ error: "Missing ?id= and ?password=" }, 400);

    const conn = await getRawDb();
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      await conn.execute(
        "UPDATE employees SET password = ? WHERE id = ?",
        [hashedPassword, id]
      );
      return c.json({ success: true, message: "Contrasena actualizada" });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    } finally {
      await conn.end();
    }
  });
}
