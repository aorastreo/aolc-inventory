var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// api/init-route.ts
var init_route_exports = {};
__export(init_route_exports, {
  initRoute: () => initRoute
});
import mysql3 from "mysql2/promise";
import { readFileSync as readFileSync2 } from "fs";
import { resolve as resolve2, dirname as dirname2 } from "path";
import { fileURLToPath as fileURLToPath2 } from "url";
async function getRawDb3() {
  return mysql3.createConnection(process.env.DATABASE_URL);
}
function loadBackup() {
  const backupPath = resolve2(__dirname2, "backup_data.json");
  const backupRaw = JSON.parse(readFileSync2(backupPath, "utf-8"));
  return {
    pallets: JSON.parse(backupRaw.pallets || "[]"),
    products: JSON.parse(backupRaw.articulos || "[]"),
    closings: JSON.parse(backupRaw.cierres || "[]"),
    adjustments: JSON.parse(backupRaw.ajustes || "[]"),
    productDb: JSON.parse(backupRaw.baseDatos || "[]"),
    assemblers: JSON.parse(backupRaw.armadores || "[]"),
    assignments: JSON.parse(backupRaw.asignacionesArmado || "[]")
  };
}
function initRoute(app2) {
  app2.get("/api/init-data", async (c) => {
    const secret = c.req.query("secret");
    if (secret !== "aolc-migrate-2024") return c.json({ error: "Unauthorized" }, 401);
    const conn = await getRawDb3();
    const results = [];
    try {
      const [check] = await conn.execute("SELECT COUNT(*) as count FROM pallets");
      if (check[0].count > 0) {
        results.push("Data already exists! Use /api/reset-data to replace.");
        return c.json({ success: true, results });
      }
      const data = loadBackup();
      results.push(`Migrating: ${data.pallets.length} pallets, ${data.products.length} products, ${data.closings.length} closings, ${data.adjustments.length} adjustments`);
      for (const p of data.pallets) {
        await conn.execute(
          "INSERT INTO pallets (storeId, palletId, fecha, description, costo) VALUES (1, ?, ?, ?, ?)",
          [p.id, p.fecha || null, p.descripcion, String(p.costo || 0)]
        );
      }
      results.push(`Inserted ${data.pallets.length} pallets`);
      const [palletRows] = await conn.execute("SELECT id, palletId FROM pallets WHERE storeId = 1");
      const palletMap = {};
      for (const row of palletRows) palletMap[row.palletId] = row.id;
      let productCount = 0;
      for (const prod of data.products) {
        const pltId = palletMap[prod.palletId];
        if (!pltId) continue;
        await conn.execute(
          "INSERT INTO products (storeId, palletId, codigo, nombre, precio, cantidad, codigoBarras, esNuevo, ordenAgregacion) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)",
          [pltId, prod.codigo || null, prod.nombre, String(prod.precio), prod.cantidad || 1, String(prod.codigoBarras || ""), prod.esNuevo ? 1 : 0, prod.ordenAgregacion || null]
        );
        productCount++;
      }
      results.push(`Inserted ${productCount} products`);
      for (const pd of data.productDb) {
        await conn.execute(
          "INSERT INTO productDatabase (storeId, nombre, precio, codigoBarras, categoria) VALUES (1, ?, ?, ?, ?)",
          [pd.nombre, String(pd.precio || 0), String(pd.codigoBarras || ""), pd.categoria || ""]
        );
      }
      results.push(`Inserted ${data.productDb.length} product DB entries`);
      for (const c2 of data.closings) {
        await conn.execute(
          "INSERT INTO closings (storeId, fecha, dia, efectivo, sinpe, tarjeta, sinFactura, total, inicial, semana, anio) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [c2.fecha, c2.dia || "", String(c2.efectivo || 0), String(c2.sinpe || 0), String(c2.tarjeta || 0), String(c2.sinFactura || 0), String(c2.total), String(c2.inicial || 0), c2.semana || null, c2.anio || null]
        );
      }
      results.push(`Inserted ${data.closings.length} closings`);
      for (const adj of data.adjustments) {
        const pltId = palletMap[adj.contenedorId];
        if (!pltId) continue;
        const estado = ["activo", "completado", "cancelado"].includes(adj.estado) ? adj.estado : "activo";
        const [result] = await conn.execute(
          "INSERT INTO adjustments (storeId, palletId, adjustmentId, description, estado, fecha, fechaHora, completedAt) VALUES (1, ?, ?, ?, ?, ?, ?, ?)",
          [pltId, adj.id, adj.descripcion || "", estado, adj.fecha || null, adj.fechaHora || null, estado === "completado" ? /* @__PURE__ */ new Date() : null]
        );
        for (const item of adj.articulos || []) {
          await conn.execute(
            "INSERT INTO adjustmentItems (adjustmentId, nombre, precio, cantidad, codigoBarras, orden) VALUES (?, ?, ?, ?, ?, ?)",
            [result.insertId, item.nombre, String(item.precio), item.cantidad || 1, String(item.codigoBarras || ""), item.orden || 1]
          );
        }
      }
      results.push(`Inserted ${data.adjustments.length} adjustments`);
      const asmMap = {};
      for (const a of data.assemblers) {
        const [result] = await conn.execute("INSERT INTO assemblers (storeId, nombre, telefono) VALUES (1, ?, ?)", [a.nombre, a.telefono || ""]);
        asmMap[a.id] = result.insertId;
      }
      for (const a of data.assignments) {
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
      return c.json({ success: true, results });
    } catch (e) {
      results.push(`ERROR: ${e.message}`);
      return c.json({ success: false, results }, 500);
    } finally {
      await conn.end();
    }
  });
  app2.get("/api/reset-data", async (c) => {
    const secret = c.req.query("secret");
    if (secret !== "aolc-migrate-2024") return c.json({ error: "Unauthorized" }, 401);
    const conn = await getRawDb3();
    const results = [];
    try {
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
      for (const p of data.pallets) {
        await conn.execute(
          "INSERT INTO pallets (storeId, palletId, fecha, description, costo) VALUES (1, ?, ?, ?, ?)",
          [p.id, p.fecha || null, p.descripcion, String(p.costo || 0)]
        );
      }
      results.push(`Inserted ${data.pallets.length} pallets`);
      const [palletRows] = await conn.execute("SELECT id, palletId FROM pallets WHERE storeId = 1");
      const palletMap = {};
      for (const row of palletRows) palletMap[row.palletId] = row.id;
      let productCount = 0;
      for (const prod of data.products) {
        const pltId = palletMap[prod.palletId];
        if (!pltId) continue;
        await conn.execute(
          "INSERT INTO products (storeId, palletId, codigo, nombre, precio, cantidad, codigoBarras, esNuevo, ordenAgregacion) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)",
          [pltId, prod.codigo || null, prod.nombre, String(prod.precio), prod.cantidad || 1, String(prod.codigoBarras || ""), prod.esNuevo ? 1 : 0, prod.ordenAgregacion || null]
        );
        productCount++;
      }
      results.push(`Inserted ${productCount} products`);
      for (const pd of data.productDb) {
        await conn.execute(
          "INSERT INTO productDatabase (storeId, nombre, precio, codigoBarras, categoria) VALUES (1, ?, ?, ?, ?)",
          [pd.nombre, String(pd.precio || 0), String(pd.codigoBarras || ""), pd.categoria || ""]
        );
      }
      results.push(`Inserted ${data.productDb.length} product DB entries`);
      for (const c2 of data.closings) {
        await conn.execute(
          "INSERT INTO closings (storeId, fecha, dia, efectivo, sinpe, tarjeta, sinFactura, total, inicial, semana, anio) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [c2.fecha, c2.dia || "", String(c2.efectivo || 0), String(c2.sinpe || 0), String(c2.tarjeta || 0), String(c2.sinFactura || 0), String(c2.total), String(c2.inicial || 0), c2.semana || null, c2.anio || null]
        );
      }
      results.push(`Inserted ${data.closings.length} closings`);
      for (const adj of data.adjustments) {
        const pltId = palletMap[adj.contenedorId];
        if (!pltId) continue;
        const estado = ["activo", "completado", "cancelado"].includes(adj.estado) ? adj.estado : "activo";
        const [result] = await conn.execute(
          "INSERT INTO adjustments (storeId, palletId, adjustmentId, description, estado, fecha, fechaHora, completedAt) VALUES (1, ?, ?, ?, ?, ?, ?, ?)",
          [pltId, adj.id, adj.descripcion || "", estado, adj.fecha || null, adj.fechaHora || null, estado === "completado" ? /* @__PURE__ */ new Date() : null]
        );
        for (const item of adj.articulos || []) {
          await conn.execute(
            "INSERT INTO adjustmentItems (adjustmentId, nombre, precio, cantidad, codigoBarras, orden) VALUES (?, ?, ?, ?, ?, ?)",
            [result.insertId, item.nombre, String(item.precio), item.cantidad || 1, String(item.codigoBarras || ""), item.orden || 1]
          );
        }
      }
      results.push(`Inserted ${data.adjustments.length} adjustments`);
      const asmMap = {};
      for (const a of data.assemblers) {
        const [result] = await conn.execute("INSERT INTO assemblers (storeId, nombre, telefono) VALUES (1, ?, ?)", [a.nombre, a.telefono || ""]);
        asmMap[a.id] = result.insertId;
      }
      for (const a of data.assignments) {
        const asmId = asmMap[a.armadorId];
        const pltId = palletMap[a.palletId];
        if (asmId && pltId) {
          await conn.execute(
            "INSERT INTO assemblyAssignments (storeId, assemblerId, palletId, fecha, items, estado) VALUES (1, ?, ?, ?, ?, ?)",
            [asmId, pltId, a.fecha || null, JSON.stringify(a.articulos || []), a.estado || "pendiente"]
          );
        }
      }
      results.push("Reset complete with new data!");
      return c.json({ success: true, results });
    } catch (e) {
      results.push(`ERROR: ${e.message}`);
      return c.json({ success: false, results }, 500);
    } finally {
      await conn.end();
    }
  });
}
var __dirname2;
var init_init_route = __esm({
  "api/init-route.ts"() {
    "use strict";
    __dirname2 = dirname2(fileURLToPath2(import.meta.url));
  }
});

// api/lib/vite.ts
var vite_exports = {};
__export(vite_exports, {
  serveStaticFiles: () => serveStaticFiles
});
import { serveStatic } from "@hono/node-server/serve-static";
import fs from "fs";
import path from "path";
import { fileURLToPath as fileURLToPath3 } from "url";
function serveStaticFiles(app2) {
  const possiblePaths = [
    path.resolve(__dirname3, "../../dist/public"),
    path.resolve(__dirname3, "../../../dist/public"),
    path.resolve(process.cwd(), "dist/public"),
    path.resolve(process.cwd(), "public")
  ];
  let distPath = "";
  for (const p of possiblePaths) {
    if (fs.existsSync(p) && fs.existsSync(path.join(p, "index.html"))) {
      distPath = p;
      console.log(`[STATIC] Serving from: ${distPath}`);
      break;
    }
  }
  if (!distPath) {
    console.error("[STATIC] dist/public not found. Searched:");
    possiblePaths.forEach((p) => console.error(`  - ${p}`));
    return;
  }
  app2.use("*", serveStatic({ root: distPath }));
  app2.notFound((c) => {
    const accept = c.req.header("accept") ?? "";
    if (!accept.includes("text/html")) {
      return c.json({ error: "Not Found" }, 404);
    }
    const indexPath = path.resolve(distPath, "index.html");
    const content = fs.readFileSync(indexPath, "utf-8");
    return c.html(content);
  });
}
var __dirname3;
var init_vite = __esm({
  "api/lib/vite.ts"() {
    "use strict";
    __dirname3 = path.dirname(fileURLToPath3(import.meta.url));
  }
});

// api/db-init.ts
var db_init_exports = {};
__export(db_init_exports, {
  initDatabase: () => initDatabase
});
import mysql4 from "mysql2/promise";
import bcrypt3 from "bcryptjs";
import fs2 from "fs";
import path2 from "path";
import { fileURLToPath as fileURLToPath4 } from "url";
async function getRawDb4() {
  return mysql4.createConnection(process.env.DATABASE_URL);
}
async function initDatabase() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("[DB-INIT] DATABASE_URL not set!");
    return;
  }
  console.log("[DB-INIT] Connecting to database...");
  const conn = await getRawDb4();
  try {
    for (const sql2 of TABLES) {
      await conn.execute(sql2);
    }
    console.log("[DB-INIT] All tables created/verified!");
    const [palletsCheck] = await conn.execute("SELECT COUNT(*) as count FROM pallets");
    if (palletsCheck[0].count > 0) {
      console.log("[DB-INIT] Data already exists, skipping migration.");
      const [adminCheck] = await conn.execute("SELECT id FROM employees WHERE username = 'admin'");
      if (adminCheck.length === 0) {
        const hashed2 = await bcrypt3.hash("admin123", 10);
        await conn.execute(
          `INSERT INTO employees (storeId, username, password, name, role) VALUES (1, 'admin', ?, 'Administrador', 'admin')`,
          [hashed2]
        );
        console.log("[DB-INIT] Admin user created!");
      }
      return;
    }
    await conn.execute(
      `INSERT INTO stores (id, name, slug, description) VALUES (1, 'American Outlet Los Chiles', 'los-chiles', 'Tienda principal en Los Chiles')`
    );
    console.log("[DB-INIT] Store created!");
    const hashed = await bcrypt3.hash("admin123", 10);
    await conn.execute(
      `INSERT INTO employees (storeId, username, password, name, role) VALUES (1, 'admin', ?, 'Administrador', 'admin')`,
      [hashed]
    );
    console.log("[DB-INIT] Admin user created!");
    await migrateBackupData(conn);
    console.log("[DB-INIT] Database initialized successfully!");
  } catch (e) {
    console.error("[DB-INIT] Error:", e.message);
  } finally {
    await conn.end();
  }
}
async function migrateBackupData(conn) {
  try {
    const backupPath = path2.join(__dirname4, "../backup_data.json");
    if (!fs2.existsSync(backupPath)) {
      console.log("[DB-INIT] No backup_data.json found, skipping data migration.");
      return;
    }
    console.log("[DB-INIT] Loading backup data...");
    const backupRaw = JSON.parse(fs2.readFileSync(backupPath, "utf-8"));
    const palletsData = JSON.parse(backupRaw.pallets || "[]");
    const productsData = JSON.parse(backupRaw.articulos || "[]");
    const closingsData = JSON.parse(backupRaw.cierres || "[]");
    const adjustmentsData = JSON.parse(backupRaw.ajustes || "[]");
    const productDbData = JSON.parse(backupRaw.baseDatos || "[]");
    const armadoresData = JSON.parse(backupRaw.armadores || "[]");
    const asignacionesData = JSON.parse(backupRaw.asignacionesArmado || "[]");
    console.log(`[DB-INIT] Migrating: ${palletsData.length} pallets, ${productsData.length} products, ${closingsData.length} closings, ${adjustmentsData.length} adjustments`);
    for (const p of palletsData) {
      await conn.execute(
        `INSERT INTO pallets (storeId, palletId, fecha, description, costo) VALUES (1, ?, ?, ?, ?)`,
        [p.id, p.fecha || null, p.descripcion, String(p.costo || 0)]
      );
    }
    const [palletRows] = await conn.execute("SELECT id, palletId FROM pallets WHERE storeId = 1");
    const palletMap = {};
    for (const row of palletRows) {
      palletMap[row.palletId] = row.id;
    }
    let productCount = 0;
    for (const prod of productsData) {
      const palletDbId = palletMap[prod.palletId];
      if (!palletDbId) continue;
      await conn.execute(
        `INSERT INTO products (storeId, palletId, codigo, nombre, precio, cantidad, codigoBarras, esNuevo, ordenAgregacion) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [palletDbId, prod.codigo || null, prod.nombre, String(prod.precio), prod.cantidad || 1, String(prod.codigoBarras || ""), prod.esNuevo ? 1 : 0, prod.ordenAgregacion || null]
      );
      productCount++;
    }
    console.log(`[DB-INIT] Inserted ${productCount} products`);
    for (const pd of productDbData) {
      await conn.execute(
        `INSERT INTO productDatabase (storeId, nombre, precio, codigoBarras, categoria) VALUES (1, ?, ?, ?, ?)`,
        [pd.nombre, String(pd.precio || 0), String(pd.codigoBarras || ""), pd.categoria || ""]
      );
    }
    for (const c of closingsData) {
      await conn.execute(
        `INSERT INTO closings (storeId, fecha, dia, efectivo, sinpe, tarjeta, sinFactura, total, inicial, semana, anio) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [c.fecha, c.dia || "", String(c.efectivo || 0), String(c.sinpe || 0), String(c.tarjeta || 0), String(c.sinFactura || 0), String(c.total), String(c.inicial || 0), c.semana || null, c.anio || null]
      );
    }
    for (const adj of adjustmentsData) {
      const pltId = palletMap[adj.contenedorId];
      if (!pltId) continue;
      const estado = ["activo", "completado", "cancelado"].includes(adj.estado) ? adj.estado : "activo";
      const [result] = await conn.execute(
        `INSERT INTO adjustments (storeId, palletId, adjustmentId, description, estado, fecha, fechaHora, completedAt) VALUES (1, ?, ?, ?, ?, ?, ?, ?)`,
        [pltId, adj.id, adj.descripcion || "", estado, adj.fecha || null, adj.fechaHora || null, estado === "completado" ? /* @__PURE__ */ new Date() : null]
      );
      const adjDbId = result.insertId;
      for (const item of adj.articulos || []) {
        await conn.execute(
          `INSERT INTO adjustmentItems (adjustmentId, nombre, precio, cantidad, codigoBarras, orden) VALUES (?, ?, ?, ?, ?, ?)`,
          [adjDbId, item.nombre, String(item.precio), item.cantidad || 1, String(item.codigoBarras || ""), item.orden || 1]
        );
      }
    }
    const asmMap = {};
    for (const a of armadoresData) {
      const [result] = await conn.execute(
        `INSERT INTO assemblers (storeId, nombre, telefono) VALUES (1, ?, ?)`,
        [a.nombre, a.telefono || ""]
      );
      asmMap[a.id] = result.insertId;
    }
    for (const a of asignacionesData) {
      const asmDbId = asmMap[a.armadorId];
      const pltDbId = palletMap[a.palletId];
      if (asmDbId && pltDbId) {
        await conn.execute(
          `INSERT INTO assemblyAssignments (storeId, assemblerId, palletId, fecha, items, estado) VALUES (1, ?, ?, ?, ?, ?)`,
          [asmDbId, pltDbId, a.fecha || null, JSON.stringify(a.articulos || []), a.estado || "pendiente"]
        );
      }
    }
    console.log("[DB-INIT] All backup data migrated!");
  } catch (e) {
    console.error("[DB-INIT] Migration error:", e.message);
  }
}
var __dirname4, TABLES;
var init_db_init = __esm({
  "api/db-init.ts"() {
    "use strict";
    __dirname4 = path2.dirname(fileURLToPath4(import.meta.url));
    TABLES = [
      `CREATE TABLE IF NOT EXISTS stores (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    isActive BOOLEAN DEFAULT TRUE NOT NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL ON UPDATE CURRENT_TIMESTAMP
  )`,
      `CREATE TABLE IF NOT EXISTS employees (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    storeId BIGINT UNSIGNED NOT NULL,
    username VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role ENUM('employee','manager','admin') DEFAULT 'employee' NOT NULL,
    isActive BOOLEAN DEFAULT TRUE NOT NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`,
      `CREATE TABLE IF NOT EXISTS pallets (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    storeId BIGINT UNSIGNED NOT NULL,
    palletId VARCHAR(20) NOT NULL,
    fecha VARCHAR(20),
    description VARCHAR(255) NOT NULL,
    costo DECIMAL(12,2) DEFAULT '0',
    isActive BOOLEAN DEFAULT TRUE NOT NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL ON UPDATE CURRENT_TIMESTAMP
  )`,
      `CREATE TABLE IF NOT EXISTS products (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    storeId BIGINT UNSIGNED NOT NULL,
    palletId BIGINT UNSIGNED NOT NULL,
    codigo VARCHAR(50),
    nombre VARCHAR(255) NOT NULL,
    precio DECIMAL(12,2) NOT NULL,
    cantidad INT DEFAULT 1 NOT NULL,
    codigoBarras VARCHAR(50),
    esNuevo BOOLEAN DEFAULT FALSE,
    ordenAgregacion INT,
    isActive BOOLEAN DEFAULT TRUE NOT NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL ON UPDATE CURRENT_TIMESTAMP
  )`,
      `CREATE TABLE IF NOT EXISTS productDatabase (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    storeId BIGINT UNSIGNED NOT NULL,
    nombre VARCHAR(255) NOT NULL,
    precio DECIMAL(12,2) DEFAULT '0',
    codigoBarras VARCHAR(50),
    categoria VARCHAR(100),
    isActive BOOLEAN DEFAULT TRUE NOT NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`,
      `CREATE TABLE IF NOT EXISTS adjustments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    storeId BIGINT UNSIGNED NOT NULL,
    palletId BIGINT UNSIGNED NOT NULL,
    adjustmentId VARCHAR(50) NOT NULL,
    description VARCHAR(255),
    estado ENUM('activo','completado','cancelado') DEFAULT 'activo' NOT NULL,
    fecha VARCHAR(20),
    fechaHora VARCHAR(50),
    completedAt TIMESTAMP NULL,
    isActive BOOLEAN DEFAULT TRUE NOT NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`,
      `CREATE TABLE IF NOT EXISTS adjustmentItems (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    adjustmentId BIGINT UNSIGNED NOT NULL,
    nombre VARCHAR(255) NOT NULL,
    precio DECIMAL(12,2) NOT NULL,
    cantidad INT DEFAULT 1 NOT NULL,
    codigoBarras VARCHAR(50),
    orden INT DEFAULT 1,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`,
      `CREATE TABLE IF NOT EXISTS closings (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    storeId BIGINT UNSIGNED NOT NULL,
    fecha VARCHAR(20) NOT NULL,
    dia VARCHAR(20),
    efectivo DECIMAL(12,2) DEFAULT '0',
    sinpe DECIMAL(12,2) DEFAULT '0',
    tarjeta DECIMAL(12,2) DEFAULT '0',
    sinFactura DECIMAL(12,2) DEFAULT '0',
    total DECIMAL(12,2) DEFAULT '0',
    inicial DECIMAL(12,2) DEFAULT '0',
    semana INT,
    anio INT,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`,
      `CREATE TABLE IF NOT EXISTS assemblers (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    storeId BIGINT UNSIGNED NOT NULL,
    nombre VARCHAR(255) NOT NULL,
    telefono VARCHAR(50),
    isActive BOOLEAN DEFAULT TRUE NOT NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`,
      `CREATE TABLE IF NOT EXISTS assemblyAssignments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    storeId BIGINT UNSIGNED NOT NULL,
    assemblerId BIGINT UNSIGNED NOT NULL,
    palletId BIGINT UNSIGNED NOT NULL,
    fecha VARCHAR(20),
    items JSON,
    estado ENUM('pendiente','en_progreso','completado') DEFAULT 'pendiente',
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`
    ];
  }
});

// api/boot.ts
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

// api/auth-router.ts
import * as cookie from "cookie";
import { Session } from "@contracts/constants";

// api/lib/cookies.ts
function isLocalhost(headers) {
  const host = headers.get("host") || "";
  return host.startsWith("localhost:") || host.startsWith("127.0.0.1:");
}
function getSessionCookieOptions(headers) {
  const localhost = isLocalhost(headers);
  return {
    httpOnly: true,
    path: "/",
    sameSite: localhost ? "Lax" : "None",
    secure: !localhost
  };
}

// api/middleware.ts
import { ErrorMessages } from "@contracts/constants";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var createRouter = t.router;
var publicQuery = t.procedure;
var requireAuth = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: ErrorMessages.unauthenticated
    });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});
function requireRole(role) {
  return t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== role) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: ErrorMessages.insufficientRole
      });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  });
}
var authedQuery = t.procedure.use(requireAuth);
var adminQuery = authedQuery.use(requireRole("admin"));
var managerQuery = t.procedure.use(requireAuth).use(t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user || ctx.user.role !== "admin" && ctx.user.role !== "manager") {
    throw new TRPCError({ code: "FORBIDDEN", message: ErrorMessages.insufficientRole });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
}));

// api/auth-router.ts
var authRouter = createRouter({
  me: authedQuery.query((opts) => opts.ctx.user),
  logout: authedQuery.mutation(async ({ ctx }) => {
    const opts = getSessionCookieOptions(ctx.req.headers);
    ctx.resHeaders.append(
      "set-cookie",
      cookie.serialize(Session.cookieName, "", {
        httpOnly: opts.httpOnly,
        path: opts.path,
        sameSite: opts.sameSite?.toLowerCase(),
        secure: opts.secure,
        maxAge: 0
      })
    );
    return { success: true };
  })
});

// api/local-auth-router.ts
import { z } from "zod";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mysql from "mysql2/promise";
var JWT_SECRET = process.env.JWT_SECRET || "aolc-secret-key-2024";
async function getRawDb() {
  return mysql.createConnection(process.env.DATABASE_URL);
}
var localAuthRouter = createRouter({
  // Login with username/password
  login: publicQuery.input(z.object({
    username: z.string(),
    password: z.string()
  })).mutation(async ({ input }) => {
    const conn = await getRawDb();
    try {
      const [rows] = await conn.execute(
        "SELECT id, storeId, username, password, name, role FROM employees WHERE username = ? AND isActive = true LIMIT 1",
        [input.username]
      );
      if (rows.length === 0) {
        throw new Error("Usuario o contrase\xF1a incorrectos");
      }
      const user = rows[0];
      const valid = await bcrypt.compare(input.password, user.password);
      if (!valid) {
        throw new Error("Usuario o contrase\xF1a incorrectos");
      }
      const token = jwt.sign(
        { id: user.id, username: user.username, name: user.name, role: user.role, storeId: user.storeId },
        JWT_SECRET,
        { expiresIn: "7d" }
      );
      return {
        token,
        user: { id: user.id, name: user.name, username: user.username, role: user.role, storeId: user.storeId }
      };
    } finally {
      await conn.end();
    }
  }),
  // Register new employee
  register: publicQuery.input(z.object({
    username: z.string().min(3),
    password: z.string().min(4),
    name: z.string(),
    storeId: z.number(),
    role: z.enum(["employee", "manager", "admin"]).default("employee")
  })).mutation(async ({ input }) => {
    const conn = await getRawDb();
    try {
      const [existing] = await conn.execute(
        "SELECT id FROM employees WHERE username = ?",
        [input.username]
      );
      if (existing.length > 0) {
        throw new Error("El usuario ya existe");
      }
      const hashedPassword = await bcrypt.hash(input.password, 10);
      const [result] = await conn.execute(
        "INSERT INTO employees (storeId, username, password, name, role) VALUES (?, ?, ?, ?, ?)",
        [input.storeId, input.username, hashedPassword, input.name, input.role]
      );
      return { id: Number(result.insertId) };
    } finally {
      await conn.end();
    }
  }),
  // Get current user from token
  me: publicQuery.input(z.object({ token: z.string() })).query(async ({ input }) => {
    try {
      const decoded = jwt.verify(input.token, JWT_SECRET);
      return {
        id: decoded.id,
        name: decoded.name,
        username: decoded.username,
        role: decoded.role,
        storeId: decoded.storeId
      };
    } catch {
      return null;
    }
  }),
  // List employees by store
  list: publicQuery.input(z.object({ storeId: z.number() })).query(async ({ input }) => {
    const conn = await getRawDb();
    try {
      const [rows] = await conn.execute(
        "SELECT id, username, name, role, isActive, createdAt FROM employees WHERE storeId = ?",
        [input.storeId]
      );
      return rows;
    } finally {
      await conn.end();
    }
  }),
  // Seed default employees (idempotent)
  seedDefaults: publicQuery.mutation(async () => {
    const conn = await getRawDb();
    try {
      const [existing] = await conn.execute(
        "SELECT id FROM employees WHERE username = ?",
        ["german"]
      );
      if (existing.length === 0) {
        const hashedPassword = await bcrypt.hash("german123", 10);
        await conn.execute(
          "INSERT INTO employees (storeId, username, password, name, role) VALUES (?, ?, ?, ?, ?)",
          [1, "german", hashedPassword, "German", "employee"]
        );
        return { created: true, message: "Usuario German creado exitosamente" };
      }
      return { created: false, message: "Usuario German ya existe" };
    } finally {
      await conn.end();
    }
  })
});

// api/inventory-router.ts
import { z as z2 } from "zod";

// api/queries/connection.ts
import { drizzle } from "drizzle-orm/mysql2";

// api/lib/env.ts
import "dotenv/config";
function required(name) {
  const value = process.env[name];
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value ?? "";
}
var env = {
  appId: required("APP_ID"),
  appSecret: required("APP_SECRET"),
  isProduction: process.env.NODE_ENV === "production",
  databaseUrl: required("DATABASE_URL"),
  kimiAuthUrl: required("KIMI_AUTH_URL"),
  kimiOpenUrl: required("KIMI_OPEN_URL"),
  ownerUnionId: process.env.OWNER_UNION_ID ?? ""
};

// db/schema.ts
var schema_exports = {};
__export(schema_exports, {
  adjustmentItems: () => adjustmentItems,
  adjustments: () => adjustments,
  assemblers: () => assemblers,
  assemblyAssignments: () => assemblyAssignments,
  closings: () => closings,
  employees: () => employees,
  pallets: () => pallets,
  printedLabels: () => printedLabels,
  productDatabase: () => productDatabase,
  products: () => products,
  stores: () => stores,
  userStores: () => userStores,
  users: () => users
});
import {
  mysqlTable,
  mysqlEnum,
  serial,
  bigint,
  varchar,
  text,
  timestamp,
  int,
  json,
  boolean,
  decimal
} from "drizzle-orm/mysql-core";
var users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => /* @__PURE__ */ new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull()
});
var employees = mysqlTable("employees", {
  id: serial("id").primaryKey(),
  storeId: bigint("storeId", { mode: "number", unsigned: true }).notNull(),
  username: varchar("username", { length: 100 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  role: mysqlEnum("role", ["employee", "manager", "admin"]).default("employee").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var stores = mysqlTable("stores", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 50 }).notNull().unique(),
  description: text("description"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => /* @__PURE__ */ new Date())
});
var userStores = mysqlTable("userStores", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  storeId: bigint("storeId", { mode: "number", unsigned: true }).notNull(),
  role: mysqlEnum("role", ["viewer", "editor", "manager"]).default("editor").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var pallets = mysqlTable("pallets", {
  id: serial("id").primaryKey(),
  storeId: bigint("storeId", { mode: "number", unsigned: true }).notNull(),
  palletId: varchar("palletId", { length: 20 }).notNull(),
  fecha: varchar("fecha", { length: 20 }),
  description: varchar("description", { length: 255 }).notNull(),
  costo: decimal("costo", { precision: 12, scale: 2 }).default("0"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => /* @__PURE__ */ new Date())
});
var products = mysqlTable("products", {
  id: serial("id").primaryKey(),
  storeId: bigint("storeId", { mode: "number", unsigned: true }).notNull(),
  palletId: bigint("palletId", { mode: "number", unsigned: true }).notNull(),
  codigo: varchar("codigo", { length: 50 }),
  nombre: varchar("nombre", { length: 255 }).notNull(),
  precio: decimal("precio", { precision: 12, scale: 2 }).notNull(),
  cantidad: int("cantidad").default(1).notNull(),
  codigoBarras: varchar("codigoBarras", { length: 50 }),
  esNuevo: boolean("esNuevo").default(false),
  ordenAgregacion: int("ordenAgregacion"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => /* @__PURE__ */ new Date())
});
var productDatabase = mysqlTable("productDatabase", {
  id: serial("id").primaryKey(),
  storeId: bigint("storeId", { mode: "number", unsigned: true }).notNull(),
  nombre: varchar("nombre", { length: 255 }).notNull(),
  precio: decimal("precio", { precision: 12, scale: 2 }).default("0"),
  codigoBarras: varchar("codigoBarras", { length: 50 }),
  categoria: varchar("categoria", { length: 100 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var adjustments = mysqlTable("adjustments", {
  id: serial("id").primaryKey(),
  storeId: bigint("storeId", { mode: "number", unsigned: true }).notNull(),
  palletId: bigint("palletId", { mode: "number", unsigned: true }).notNull(),
  adjustmentId: varchar("adjustmentId", { length: 50 }).notNull(),
  description: varchar("description", { length: 255 }),
  estado: mysqlEnum("estado", ["activo", "completado", "cancelado"]).default("activo").notNull(),
  fecha: varchar("fecha", { length: 20 }),
  fechaHora: varchar("fechaHora", { length: 50 }),
  completedAt: timestamp("completedAt"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var adjustmentItems = mysqlTable("adjustmentItems", {
  id: serial("id").primaryKey(),
  adjustmentId: bigint("adjustmentId", { mode: "number", unsigned: true }).notNull(),
  nombre: varchar("nombre", { length: 255 }).notNull(),
  precio: decimal("precio", { precision: 12, scale: 2 }).notNull(),
  cantidad: int("cantidad").default(1).notNull(),
  codigoBarras: varchar("codigoBarras", { length: 50 }),
  orden: int("orden").default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var closings = mysqlTable("closings", {
  id: serial("id").primaryKey(),
  storeId: bigint("storeId", { mode: "number", unsigned: true }).notNull(),
  fecha: varchar("fecha", { length: 20 }).notNull(),
  dia: varchar("dia", { length: 20 }),
  efectivo: decimal("efectivo", { precision: 12, scale: 2 }).default("0"),
  sinpe: decimal("sinpe", { precision: 12, scale: 2 }).default("0"),
  tarjeta: decimal("tarjeta", { precision: 12, scale: 2 }).default("0"),
  sinFactura: decimal("sinFactura", { precision: 12, scale: 2 }).default("0"),
  total: decimal("total", { precision: 12, scale: 2 }).default("0"),
  inicial: decimal("inicial", { precision: 12, scale: 2 }).default("0"),
  semana: int("semana"),
  anio: int("anio"),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var assemblers = mysqlTable("assemblers", {
  id: serial("id").primaryKey(),
  storeId: bigint("storeId", { mode: "number", unsigned: true }).notNull(),
  nombre: varchar("nombre", { length: 255 }).notNull(),
  telefono: varchar("telefono", { length: 50 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var assemblyAssignments = mysqlTable("assemblyAssignments", {
  id: serial("id").primaryKey(),
  storeId: bigint("storeId", { mode: "number", unsigned: true }).notNull(),
  assemblerId: bigint("assemblerId", { mode: "number", unsigned: true }).notNull(),
  palletId: bigint("palletId", { mode: "number", unsigned: true }).notNull(),
  fecha: varchar("fecha", { length: 20 }),
  items: json("items"),
  estado: mysqlEnum("estado", ["pendiente", "en_progreso", "completado"]).default("pendiente"),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var printedLabels = mysqlTable("printedLabels", {
  id: serial("id").primaryKey(),
  storeId: bigint("storeId", { mode: "number", unsigned: true }).notNull(),
  palletId: bigint("palletId", { mode: "number", unsigned: true }).notNull(),
  productId: bigint("productId", { mode: "number", unsigned: true }).notNull(),
  printedAt: timestamp("printedAt").defaultNow().notNull()
});

// db/relations.ts
var relations_exports = {};

// api/queries/connection.ts
var fullSchema = { ...schema_exports, ...relations_exports };
var instance;
function getDb() {
  if (!instance) {
    instance = drizzle(env.databaseUrl, {
      mode: "planetscale",
      schema: fullSchema
    });
  }
  return instance;
}

// api/inventory-router.ts
import { eq, and, desc, sql, count } from "drizzle-orm";
import bcrypt2 from "bcryptjs";
var inventoryRouter = createRouter({
  // ========== STORES ==========
  stores: publicQuery.query(async () => {
    const db = getDb();
    return db.select().from(stores).where(eq(stores.isActive, true));
  }),
  // ========== PALLETS ==========
  pallets: publicQuery.input(z2.object({ storeId: z2.number() })).query(async ({ input }) => {
    const db = getDb();
    return db.select().from(pallets).where(and(eq(pallets.storeId, input.storeId), eq(pallets.isActive, true))).orderBy(desc(pallets.createdAt));
  }),
  palletById: publicQuery.input(z2.object({ id: z2.number() })).query(async ({ input }) => {
    const db = getDb();
    const result = await db.select().from(pallets).where(eq(pallets.id, input.id)).limit(1);
    return result[0] || null;
  }),
  createPallet: publicQuery.input(z2.object({ storeId: z2.number(), palletId: z2.string(), description: z2.string(), fecha: z2.string().optional(), costo: z2.string().optional() })).mutation(async ({ input }) => {
    const db = getDb();
    const result = await db.insert(pallets).values({ storeId: input.storeId, palletId: input.palletId, description: input.description, fecha: input.fecha, costo: input.costo || "0" });
    return { id: Number(result[0].insertId) };
  }),
  updatePallet: publicQuery.input(z2.object({ id: z2.number(), description: z2.string().optional(), costo: z2.string().optional() })).mutation(async ({ input }) => {
    const db = getDb();
    const { id, ...data } = input;
    await db.update(pallets).set(data).where(eq(pallets.id, id));
    return { success: true };
  }),
  deletePallet: publicQuery.input(z2.object({ id: z2.number() })).mutation(async ({ input }) => {
    const db = getDb();
    await db.update(pallets).set({ isActive: false }).where(eq(pallets.id, input.id));
    return { success: true };
  }),
  palletsWithStats: publicQuery.input(z2.object({ storeId: z2.number() })).query(async ({ input }) => {
    const db = getDb();
    const palletList = await db.select().from(pallets).where(and(eq(pallets.storeId, input.storeId), eq(pallets.isActive, true))).orderBy(desc(pallets.id));
    const productCounts = await db.select({
      palletId: products.palletId,
      count: count(products.id),
      totalUnits: sql`SUM(${products.cantidad})`
    }).from(products).where(and(eq(products.storeId, input.storeId), eq(products.isActive, true))).groupBy(products.palletId);
    const countMap = /* @__PURE__ */ new Map();
    const unitsMap = /* @__PURE__ */ new Map();
    for (const p of productCounts) {
      countMap.set(p.palletId, p.count);
      unitsMap.set(p.palletId, Number(p.totalUnits) || 0);
    }
    const productValues = await db.select({
      palletId: products.palletId,
      totalPrecio: sql`SUM(${products.precio} * ${products.cantidad})`
    }).from(products).where(and(eq(products.storeId, input.storeId), eq(products.isActive, true))).groupBy(products.palletId);
    const valueMap = /* @__PURE__ */ new Map();
    for (const v of productValues) {
      valueMap.set(v.palletId, Number(v.totalPrecio) || 0);
    }
    return palletList.map((p) => {
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
        ganancia: ventas - costo
      };
    });
  }),
  // ========== PRODUCT SEARCH (for autocomplete) ==========
  searchProductsSimilar: publicQuery.input(z2.object({ storeId: z2.number(), query: z2.string() })).query(async ({ input }) => {
    const db = getDb();
    const q = input.query.toLowerCase();
    if (!q || q.length < 2) return [];
    const catalog = await db.select().from(productDatabase).where(and(eq(productDatabase.storeId, input.storeId), eq(productDatabase.isActive, true)));
    const catalogMatches = catalog.filter((p) => p.nombre.toLowerCase().includes(q)).map((p) => ({ id: p.id, nombre: p.nombre, precio: p.precio, codigoBarras: p.codigoBarras, source: "catalog" }));
    const allProducts = await db.select().from(products).where(and(eq(products.storeId, input.storeId), eq(products.isActive, true)));
    const productMatches = allProducts.filter((p) => p.nombre.toLowerCase().includes(q)).map((p) => ({ id: p.id, nombre: p.nombre, precio: p.precio, codigoBarras: p.codigoBarras, palletId: p.palletId, source: "product" }));
    const palletIds = [...new Set(productMatches.map((p) => p.palletId))];
    const palletList = palletIds.length > 0 ? await db.select().from(pallets).where(and(eq(pallets.storeId, input.storeId), eq(pallets.isActive, true))) : [];
    const palletMap = new Map(palletList.map((p) => [p.id, p]));
    const combined = [
      ...catalogMatches.map((c) => ({
        id: `cat-${c.id}`,
        nombre: c.nombre,
        precio: Number(c.precio || 0),
        codigoBarras: c.codigoBarras,
        contenedor: null,
        source: "catalog"
      })),
      ...productMatches.map((p) => ({
        id: `prod-${p.id}`,
        nombre: p.nombre,
        precio: Number(p.precio || 0),
        codigoBarras: p.codigoBarras,
        contenedor: palletMap.get(p.palletId)?.description || palletMap.get(p.palletId)?.palletId || null,
        source: "product"
      }))
    ];
    const seen = /* @__PURE__ */ new Set();
    return combined.filter((item) => {
      const key = item.nombre.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 10);
  }),
  // ========== PRODUCTS ==========
  products: publicQuery.input(z2.object({ storeId: z2.number(), palletId: z2.number().optional() })).query(async ({ input }) => {
    const db = getDb();
    if (input.palletId) {
      return db.select().from(products).where(and(eq(products.storeId, input.storeId), eq(products.palletId, input.palletId), eq(products.isActive, true))).orderBy(products.ordenAgregacion);
    }
    return db.select().from(products).where(and(eq(products.storeId, input.storeId), eq(products.isActive, true))).orderBy(desc(products.createdAt));
  }),
  createProduct: publicQuery.input(z2.object({ storeId: z2.number(), palletId: z2.number(), nombre: z2.string(), precio: z2.string(), cantidad: z2.number().default(1), codigoBarras: z2.string().optional(), codigo: z2.string().optional(), esNuevo: z2.boolean().default(false) })).mutation(async ({ input }) => {
    const db = getDb();
    const result = await db.insert(products).values(input);
    return { id: Number(result[0].insertId) };
  }),
  updateProduct: publicQuery.input(z2.object({ id: z2.number(), nombre: z2.string().optional(), precio: z2.string().optional(), cantidad: z2.number().optional(), codigoBarras: z2.string().optional() })).mutation(async ({ input }) => {
    const db = getDb();
    const { id, ...data } = input;
    await db.update(products).set(data).where(eq(products.id, id));
    return { success: true };
  }),
  deleteProduct: publicQuery.input(z2.object({ id: z2.number() })).mutation(async ({ input }) => {
    const db = getDb();
    await db.update(products).set({ isActive: false }).where(eq(products.id, input.id));
    return { success: true };
  }),
  searchProducts: publicQuery.input(z2.object({ storeId: z2.number(), query: z2.string() })).query(async ({ input }) => {
    const db = getDb();
    const all = await db.select().from(products).where(and(eq(products.storeId, input.storeId), eq(products.isActive, true)));
    const q = input.query.toLowerCase();
    return all.filter((p) => p.nombre.toLowerCase().includes(q) || p.codigoBarras && p.codigoBarras.includes(q));
  }),
  // ========== PRODUCT DATABASE ==========
  productDatabase: publicQuery.input(z2.object({ storeId: z2.number() })).query(async ({ input }) => {
    const db = getDb();
    return db.select().from(productDatabase).where(and(eq(productDatabase.storeId, input.storeId), eq(productDatabase.isActive, true)));
  }),
  searchProductDB: publicQuery.input(z2.object({ storeId: z2.number(), query: z2.string() })).query(async ({ input }) => {
    const db = getDb();
    const all = await db.select().from(productDatabase).where(and(eq(productDatabase.storeId, input.storeId), eq(productDatabase.isActive, true)));
    const q = input.query.toLowerCase();
    return all.filter((p) => p.nombre.toLowerCase().includes(q) || p.codigoBarras && p.codigoBarras.includes(q));
  }),
  createProductDB: publicQuery.input(z2.object({ storeId: z2.number(), nombre: z2.string(), precio: z2.string().optional(), codigoBarras: z2.string().optional(), categoria: z2.string().optional() })).mutation(async ({ input }) => {
    const db = getDb();
    const result = await db.insert(productDatabase).values(input);
    return { id: Number(result[0].insertId) };
  }),
  updateProductDB: publicQuery.input(z2.object({ id: z2.number(), nombre: z2.string().optional(), precio: z2.string().optional(), codigoBarras: z2.string().optional(), categoria: z2.string().optional() })).mutation(async ({ input }) => {
    const db = getDb();
    const { id, ...data } = input;
    await db.update(productDatabase).set(data).where(eq(productDatabase.id, id));
    return { success: true };
  }),
  deleteProductDB: publicQuery.input(z2.object({ id: z2.number() })).mutation(async ({ input }) => {
    const db = getDb();
    await db.update(productDatabase).set({ isActive: false }).where(eq(productDatabase.id, input.id));
    return { success: true };
  }),
  adjustmentsWithStats: publicQuery.input(z2.object({ storeId: z2.number() })).query(async ({ input }) => {
    const db = getDb();
    const adjList = await db.select().from(adjustments).where(eq(adjustments.storeId, input.storeId)).orderBy(desc(adjustments.palletId), desc(adjustments.createdAt));
    const items = await db.select().from(adjustmentItems);
    return adjList.map((a) => {
      const adjItems = items.filter((i) => i.adjustmentId === a.id);
      const productCount = adjItems.length;
      const unitCount = adjItems.reduce((sum, i) => sum + (i.cantidad || 0), 0);
      return {
        id: a.id,
        adjustmentId: a.adjustmentId,
        description: a.description,
        estado: a.estado,
        fecha: a.fecha,
        productCount,
        unitCount
      };
    });
  }),
  // ========== ADJUSTMENTS ==========
  adjustments: publicQuery.input(z2.object({ storeId: z2.number(), palletId: z2.number().optional() })).query(async ({ input }) => {
    const db = getDb();
    if (input.palletId) {
      return db.select().from(adjustments).where(and(eq(adjustments.storeId, input.storeId), eq(adjustments.palletId, input.palletId), eq(adjustments.isActive, true))).orderBy(desc(adjustments.createdAt));
    }
    return db.select().from(adjustments).where(and(eq(adjustments.storeId, input.storeId), eq(adjustments.isActive, true))).orderBy(desc(adjustments.createdAt));
  }),
  adjustmentById: publicQuery.input(z2.object({ id: z2.number() })).query(async ({ input }) => {
    const db = getDb();
    const result = await db.select().from(adjustments).where(eq(adjustments.id, input.id)).limit(1);
    return result[0] || null;
  }),
  adjustmentItems: publicQuery.input(z2.object({ adjustmentId: z2.number() })).query(async ({ input }) => {
    const db = getDb();
    return db.select().from(adjustmentItems).where(eq(adjustmentItems.adjustmentId, input.adjustmentId));
  }),
  createAdjustment: publicQuery.input(z2.object({ storeId: z2.number(), palletId: z2.number(), adjustmentId: z2.string(), description: z2.string().optional(), fecha: z2.string().optional(), fechaHora: z2.string().optional() })).mutation(async ({ input }) => {
    const db = getDb();
    const result = await db.insert(adjustments).values({ ...input, estado: "activo" });
    return { id: Number(result[0].insertId) };
  }),
  addAdjustmentItem: publicQuery.input(z2.object({ adjustmentId: z2.number(), nombre: z2.string(), precio: z2.string(), cantidad: z2.number().default(1), codigoBarras: z2.string().optional(), orden: z2.number().default(1) })).mutation(async ({ input }) => {
    const db = getDb();
    const result = await db.insert(adjustmentItems).values(input);
    return { id: Number(result[0].insertId) };
  }),
  removeAdjustmentItem: publicQuery.input(z2.object({ id: z2.number() })).mutation(async ({ input }) => {
    const db = getDb();
    await db.delete(adjustmentItems).where(eq(adjustmentItems.id, input.id));
    return { success: true };
  }),
  completeAdjustment: publicQuery.input(z2.object({ id: z2.number() })).mutation(async ({ input }) => {
    const db = getDb();
    await db.update(adjustments).set({ estado: "completado", completedAt: /* @__PURE__ */ new Date() }).where(eq(adjustments.id, input.id));
    return { success: true };
  }),
  cancelAdjustment: publicQuery.input(z2.object({ id: z2.number() })).mutation(async ({ input }) => {
    const db = getDb();
    await db.update(adjustments).set({ estado: "cancelado", isActive: false }).where(eq(adjustments.id, input.id));
    return { success: true };
  }),
  // ========== CLOSINGS ==========
  closings: publicQuery.input(z2.object({ storeId: z2.number() })).query(async ({ input }) => {
    const db = getDb();
    return db.select().from(closings).where(eq(closings.storeId, input.storeId)).orderBy(desc(closings.fecha));
  }),
  createClosing: publicQuery.input(z2.object({ storeId: z2.number(), fecha: z2.string(), dia: z2.string().optional(), efectivo: z2.string().default("0"), sinpe: z2.string().default("0"), tarjeta: z2.string().default("0"), sinFactura: z2.string().default("0"), total: z2.string().default("0"), inicial: z2.string().default("50000"), semana: z2.number().optional(), anio: z2.number().optional() })).mutation(async ({ input }) => {
    const db = getDb();
    const result = await db.insert(closings).values(input);
    return { id: Number(result[0].insertId) };
  }),
  updateClosing: publicQuery.input(z2.object({ id: z2.number(), fecha: z2.string().optional(), dia: z2.string().optional(), efectivo: z2.string().optional(), sinpe: z2.string().optional(), tarjeta: z2.string().optional(), sinFactura: z2.string().optional(), total: z2.string().optional() })).mutation(async ({ input }) => {
    const db = getDb();
    const { id, ...data } = input;
    await db.update(closings).set(data).where(eq(closings.id, id));
    return { success: true };
  }),
  deleteClosing: publicQuery.input(z2.object({ id: z2.number() })).mutation(async ({ input }) => {
    const db = getDb();
    await db.delete(closings).where(eq(closings.id, input.id));
    return { success: true };
  }),
  closingStats: publicQuery.input(z2.object({ storeId: z2.number() })).query(async ({ input }) => {
    const db = getDb();
    const all = await db.select().from(closings).where(eq(closings.storeId, input.storeId)).orderBy(desc(closings.fecha));
    if (all.length === 0) {
      return { ultimo: null, semana: 0, mes: 0, total: 0, diasSemana: 0, diasMes: 0, totalCierres: 0 };
    }
    const ultimo = all[0];
    const ultimoTotal = Number(ultimo.efectivo || 0) + Number(ultimo.tarjeta || 0) + Number(ultimo.sinpe || 0) + Number(ultimo.sinFactura || 0);
    const now = /* @__PURE__ */ new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - mondayOffset);
    weekStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(currentYear, currentMonth, 1);
    let semanaTotal = 0;
    let diasSemana = 0;
    let mesTotal = 0;
    let diasMes = 0;
    let totalAcumulado = 0;
    for (const c of all) {
      const cTotal = Number(c.efectivo || 0) + Number(c.tarjeta || 0) + Number(c.sinpe || 0) + Number(c.sinFactura || 0);
      totalAcumulado += cTotal;
      const cDate = /* @__PURE__ */ new Date(c.fecha + "T12:00:00");
      if (cDate >= weekStart) {
        semanaTotal += cTotal;
        diasSemana++;
      }
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
      totalCierres: all.length
    };
  }),
  closingTrend: publicQuery.input(z2.object({ storeId: z2.number() })).query(async ({ input }) => {
    const db = getDb();
    const all = await db.select().from(closings).where(eq(closings.storeId, input.storeId)).orderBy(desc(closings.fecha));
    const dayNames = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
    const trend = [];
    const last7 = all.slice(0, 7).reverse();
    for (const c of last7) {
      const cDate = /* @__PURE__ */ new Date(c.fecha + "T12:00:00");
      const total = Number(c.efectivo || 0) + Number(c.tarjeta || 0) + Number(c.sinpe || 0) + Number(c.sinFactura || 0);
      trend.push({
        dia: dayNames[cDate.getDay()],
        fecha: c.fecha,
        total
      });
    }
    return trend;
  }),
  closingByPaymentMethod: publicQuery.input(z2.object({ storeId: z2.number() })).query(async ({ input }) => {
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
      { metodo: "efectivo", label: "EFECTIVO", total: efectivo, porcentaje: total > 0 ? Math.round(efectivo / total * 100) : 0 },
      { metodo: "tarjeta", label: "TARJETA", total: tarjeta, porcentaje: total > 0 ? Math.round(tarjeta / total * 100) : 0 },
      { metodo: "sinpe", label: "SINPE", total: sinpe, porcentaje: total > 0 ? Math.round(sinpe / total * 100) : 0 },
      { metodo: "sinFactura", label: "SIN FACTURA", total: sinFactura, porcentaje: total > 0 ? Math.round(sinFactura / total * 100) : 0 }
    ];
  }),
  closingWeeklyBreakdown: publicQuery.input(z2.object({ storeId: z2.number() })).query(async ({ input }) => {
    const db = getDb();
    const all = await db.select().from(closings).where(eq(closings.storeId, input.storeId)).orderBy(desc(closings.fecha));
    const now = /* @__PURE__ */ new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - mondayOffset);
    weekStart.setHours(0, 0, 0, 0);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const daysSinceStart = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1e3));
    const weekNumber = Math.ceil((daysSinceStart + startOfYear.getDay() + 1) / 7);
    const dayNames = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
    const dayFullNames = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];
    const weekDays = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      weekDays.push({
        dia: dayNames[d.getDay()],
        fecha: d.toISOString().split("T")[0],
        total: 0,
        hasData: false
      });
    }
    let weekTotal = 0;
    for (const c of all) {
      const cDate = /* @__PURE__ */ new Date(c.fecha + "T12:00:00");
      if (cDate >= weekStart && cDate < new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1e3)) {
        const total = Number(c.efectivo || 0) + Number(c.tarjeta || 0) + Number(c.sinpe || 0) + Number(c.sinFactura || 0);
        weekTotal += total;
        const dayIdx = cDate.getDay();
        const weekIdx = dayIdx === 0 ? 6 : dayIdx - 1;
        if (weekDays[weekIdx]) {
          weekDays[weekIdx].total = total;
          weekDays[weekIdx].hasData = true;
        }
      }
    }
    const maxVal = Math.max(...weekDays.map((d) => d.total), 1);
    return {
      semana: weekNumber,
      anio: now.getFullYear(),
      totalSemana: weekTotal,
      dias: weekDays.map((d) => ({ ...d, porcentaje: Math.round(d.total / maxVal * 100) }))
    };
  }),
  closingReportByPeriod: publicQuery.input(z2.object({ storeId: z2.number(), desde: z2.string(), hasta: z2.string() })).query(async ({ input }) => {
    const db = getDb();
    const all = await db.select().from(closings).where(eq(closings.storeId, input.storeId)).orderBy(desc(closings.fecha));
    const desde = /* @__PURE__ */ new Date(input.desde + "T00:00:00");
    const hasta = /* @__PURE__ */ new Date(input.hasta + "T23:59:59");
    const filtered = all.filter((c) => {
      const cDate = /* @__PURE__ */ new Date(c.fecha + "T12:00:00");
      return cDate >= desde && cDate <= hasta;
    });
    let totalVentas = 0;
    let totalEfectivo = 0, totalTarjeta = 0, totalSinpe = 0, totalSinFact = 0;
    const rows = filtered.map((c) => {
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
        total
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
      totalSinFact
    };
  }),
  // ========== PRINTED LABELS (Etiquetas) ==========
  adjustmentItemsForLabels: publicQuery.input(z2.object({ storeId: z2.number(), adjustmentId: z2.number() })).query(async ({ input }) => {
    const db = getDb();
    const items = await db.select().from(adjustmentItems).where(eq(adjustmentItems.adjustmentId, input.adjustmentId)).orderBy(adjustmentItems.orden);
    let printedSet = /* @__PURE__ */ new Set();
    try {
      const printed = await db.select().from(printedLabels).where(and(eq(printedLabels.storeId, input.storeId), eq(printedLabels.palletId, input.adjustmentId)));
      printedSet = new Set(printed.map((p) => p.productId));
    } catch {
    }
    return items.map((item) => ({
      id: item.id,
      nombre: item.nombre,
      precio: item.precio,
      codigoBarras: item.codigoBarras,
      cantidad: item.cantidad,
      printed: printedSet.has(item.id)
    }));
  }),
  productsForLabels: publicQuery.input(z2.object({ storeId: z2.number(), palletId: z2.number() })).query(async ({ input }) => {
    const db = getDb();
    const productList = await db.select().from(products).where(and(
      eq(products.storeId, input.storeId),
      eq(products.palletId, input.palletId),
      eq(products.isActive, true)
    )).orderBy(products.nombre);
    let printedSet = /* @__PURE__ */ new Set();
    try {
      const printed = await db.select().from(printedLabels).where(and(eq(printedLabels.storeId, input.storeId), eq(printedLabels.palletId, input.palletId)));
      printedSet = new Set(printed.map((p) => p.productId));
    } catch {
    }
    return productList.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      precio: p.precio,
      codigoBarras: p.codigoBarras,
      cantidad: p.cantidad,
      printed: printedSet.has(p.id)
    }));
  }),
  markLabelsPrinted: publicQuery.input(z2.object({ storeId: z2.number(), palletId: z2.number(), productIds: z2.array(z2.number()) })).mutation(async ({ input }) => {
    const db = getDb();
    for (const productId of input.productIds) {
      const existing = await db.select().from(printedLabels).where(and(
        eq(printedLabels.storeId, input.storeId),
        eq(printedLabels.palletId, input.palletId),
        eq(printedLabels.productId, productId)
      )).limit(1);
      if (existing.length === 0) {
        await db.insert(printedLabels).values({
          storeId: input.storeId,
          palletId: input.palletId,
          productId
        });
      }
    }
    return { success: true, count: input.productIds.length };
  }),
  unmarkLabelPrinted: publicQuery.input(z2.object({ storeId: z2.number(), palletId: z2.number(), productId: z2.number() })).mutation(async ({ input }) => {
    const db = getDb();
    await db.delete(printedLabels).where(and(
      eq(printedLabels.storeId, input.storeId),
      eq(printedLabels.palletId, input.palletId),
      eq(printedLabels.productId, input.productId)
    ));
    return { success: true };
  }),
  // ========== ASSEMBLERS ==========
  assemblers: publicQuery.input(z2.object({ storeId: z2.number() })).query(async ({ input }) => {
    const db = getDb();
    return db.select().from(assemblers).where(and(eq(assemblers.storeId, input.storeId), eq(assemblers.isActive, true)));
  }),
  createAssembler: publicQuery.input(z2.object({ storeId: z2.number(), nombre: z2.string(), telefono: z2.string().optional() })).mutation(async ({ input }) => {
    const db = getDb();
    const result = await db.insert(assemblers).values(input);
    return { id: Number(result[0].insertId) };
  }),
  deleteAssembler: publicQuery.input(z2.object({ id: z2.number() })).mutation(async ({ input }) => {
    const db = getDb();
    await db.update(assemblers).set({ isActive: false }).where(eq(assemblers.id, input.id));
    return { success: true };
  }),
  // ========== DASHBOARD STATS ==========
  dashboardStats: publicQuery.input(z2.object({ storeId: z2.number() })).query(async ({ input }) => {
    const db = getDb();
    const [palletList, productList, closingList, adjustmentList] = await Promise.all([
      db.select().from(pallets).where(and(eq(pallets.storeId, input.storeId), eq(pallets.isActive, true))),
      db.select().from(products).where(and(eq(products.storeId, input.storeId), eq(products.isActive, true))),
      db.select().from(closings).where(eq(closings.storeId, input.storeId)),
      db.select().from(adjustments).where(and(eq(adjustments.storeId, input.storeId), eq(adjustments.isActive, true)))
    ]);
    const totalUnits = productList.reduce((sum, p) => sum + (p.cantidad || 1), 0);
    const totalCierreValue = closingList.reduce((sum, c) => sum + Number(c.total), 0);
    return {
      totalPallets: palletList.length,
      totalProducts: productList.length,
      totalUnits,
      totalClosings: closingList.length,
      totalAdjustments: adjustmentList.length,
      totalCierreValue
    };
  }),
  // ========== EMPLOYEES ==========
  employees: publicQuery.input(z2.object({ storeId: z2.number() })).query(async ({ input }) => {
    const db = getDb();
    return db.select({ id: employees.id, username: employees.username, name: employees.name, role: employees.role, isActive: employees.isActive, createdAt: employees.createdAt }).from(employees).where(eq(employees.storeId, input.storeId));
  }),
  createEmployee: publicQuery.input(z2.object({ storeId: z2.number(), username: z2.string(), password: z2.string(), name: z2.string(), role: z2.enum(["employee", "manager", "admin"]).default("employee") })).mutation(async ({ input }) => {
    const db = getDb();
    const hashedPassword = await bcrypt2.hash(input.password, 10);
    const result = await db.insert(employees).values({ storeId: input.storeId, username: input.username, password: hashedPassword, name: input.name, role: input.role });
    return { id: Number(result[0].insertId) };
  }),
  deleteEmployee: publicQuery.input(z2.object({ id: z2.number() })).mutation(async ({ input }) => {
    const db = getDb();
    await db.update(employees).set({ isActive: false }).where(eq(employees.id, input.id));
    return { success: true };
  })
});

// api/init-data-router.ts
import { z as z3 } from "zod";
import mysql2 from "mysql2/promise";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
var __dirname = dirname(fileURLToPath(import.meta.url));
async function getRawDb2() {
  return mysql2.createConnection(process.env.DATABASE_URL);
}
var initDataRouter = createRouter({
  migrate: publicQuery.input(z3.object({ secret: z3.string() })).query(async ({ input }) => {
    if (input.secret !== "aolc-migrate-2024") {
      throw new Error("Unauthorized");
    }
    const conn = await getRawDb2();
    const results = [];
    try {
      const [palletsCheck] = await conn.execute("SELECT COUNT(*) as count FROM pallets");
      if (palletsCheck[0].count > 0) {
        results.push("Data already exists!");
        return { success: true, results };
      }
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
      for (const p of palletsData) {
        await conn.execute(
          "INSERT INTO pallets (storeId, palletId, fecha, description, costo) VALUES (1, ?, ?, ?, ?)",
          [p.id, p.fecha || null, p.descripcion, String(p.costo || 0)]
        );
      }
      results.push(`Inserted ${palletsData.length} pallets`);
      const [palletRows] = await conn.execute("SELECT id, palletId FROM pallets WHERE storeId = 1");
      const palletMap = {};
      for (const row of palletRows) palletMap[row.palletId] = row.id;
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
      for (const pd of productDbData) {
        await conn.execute(
          "INSERT INTO productDatabase (storeId, nombre, precio, codigoBarras, categoria) VALUES (1, ?, ?, ?, ?)",
          [pd.nombre, String(pd.precio || 0), String(pd.codigoBarras || ""), pd.categoria || ""]
        );
      }
      results.push(`Inserted ${productDbData.length} product DB entries`);
      for (const c of closingsData) {
        await conn.execute(
          "INSERT INTO closings (storeId, fecha, dia, efectivo, sinpe, tarjeta, sinFactura, total, inicial, semana, anio) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [c.fecha, c.dia || "", String(c.efectivo || 0), String(c.sinpe || 0), String(c.tarjeta || 0), String(c.sinFactura || 0), String(c.total), String(c.inicial || 0), c.semana || null, c.anio || null]
        );
      }
      results.push(`Inserted ${closingsData.length} closings`);
      for (const adj of adjustmentsData) {
        const pltId = palletMap[adj.contenedorId];
        if (!pltId) continue;
        const estado = ["activo", "completado", "cancelado"].includes(adj.estado) ? adj.estado : "activo";
        const [result] = await conn.execute(
          "INSERT INTO adjustments (storeId, palletId, adjustmentId, description, estado, fecha, fechaHora, completedAt) VALUES (1, ?, ?, ?, ?, ?, ?, ?)",
          [pltId, adj.id, adj.descripcion || "", estado, adj.fecha || null, adj.fechaHora || null, estado === "completado" ? /* @__PURE__ */ new Date() : null]
        );
        for (const item of adj.articulos || []) {
          await conn.execute(
            "INSERT INTO adjustmentItems (adjustmentId, nombre, precio, cantidad, codigoBarras, orden) VALUES (?, ?, ?, ?, ?, ?)",
            [result.insertId, item.nombre, String(item.precio), item.cantidad || 1, String(item.codigoBarras || ""), item.orden || 1]
          );
        }
      }
      results.push(`Inserted ${adjustmentsData.length} adjustments`);
      const asmMap = {};
      for (const a of armadoresData) {
        const [result] = await conn.execute(
          "INSERT INTO assemblers (storeId, nombre, telefono) VALUES (1, ?, ?)",
          [a.nombre, a.telefono || ""]
        );
        asmMap[a.id] = result.insertId;
      }
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
    } catch (e) {
      results.push(`ERROR: ${e.message}`);
      return { success: false, results };
    } finally {
      await conn.end();
    }
  })
});

// api/router.ts
var appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  localAuth: localAuthRouter,
  inventory: inventoryRouter,
  initData: initDataRouter
});

// api/kimi/auth.ts
import { setCookie } from "hono/cookie";
import * as jose2 from "jose";
import * as cookie2 from "cookie";
import { Session as Session2 } from "@contracts/constants";
import { Errors } from "@contracts/errors";

// api/kimi/session.ts
import * as jose from "jose";
var JWT_ALG = "HS256";
async function signSessionToken(payload) {
  const secret = new TextEncoder().encode(env.appSecret);
  return new jose.SignJWT(payload).setProtectedHeader({ alg: JWT_ALG }).setIssuedAt().setExpirationTime("1 year").sign(secret);
}
async function verifySessionToken(token) {
  if (!token) {
    console.warn("[session] No token provided for verification.");
    return null;
  }
  try {
    const secret = new TextEncoder().encode(env.appSecret);
    const { payload } = await jose.jwtVerify(token, secret, {
      algorithms: [JWT_ALG]
    });
    const { unionId, clientId } = payload;
    if (!unionId || !clientId) {
      console.warn("[session] JWT payload missing required fields.");
      return null;
    }
    return { unionId, clientId };
  } catch (error) {
    console.warn("[session] JWT verification failed:", error);
    return null;
  }
}

// api/kimi/platform.ts
async function kimiRequest(path3, token, init) {
  const resp = await fetch(`${env.kimiOpenUrl}${path3}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...init?.headers
    }
  });
  if (!resp.ok) {
    const text2 = await resp.text();
    console.warn(
      `[kimi] Request to ${path3} failed (${resp.status}): ${text2}`
    );
    return null;
  }
  return resp.json();
}
var users2 = {
  getProfile: (token) => kimiRequest("/v1/users/me/profile", token)
};

// api/queries/users.ts
import { eq as eq2 } from "drizzle-orm";
async function findUserByUnionId(unionId) {
  const rows = await getDb().select().from(users).where(eq2(users.unionId, unionId)).limit(1);
  return rows.at(0);
}
async function upsertUser(data) {
  const values = { ...data };
  const updateSet = {
    lastSignInAt: /* @__PURE__ */ new Date(),
    ...data
  };
  if (values.role === void 0 && values.unionId && values.unionId === env.ownerUnionId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  await getDb().insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

// api/kimi/auth.ts
async function exchangeAuthCode(code, redirectUri) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: env.appId,
    redirect_uri: redirectUri,
    client_secret: env.appSecret
  });
  const resp = await fetch(`${env.kimiAuthUrl}/api/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });
  if (!resp.ok) {
    const text2 = await resp.text();
    throw new Error(`Token exchange failed (${resp.status}): ${text2}`);
  }
  return resp.json();
}
var jwks = jose2.createRemoteJWKSet(
  new URL(`${env.kimiAuthUrl}/api/.well-known/jwks.json`)
);
async function verifyAccessToken(accessToken) {
  const { payload } = await jose2.jwtVerify(accessToken, jwks);
  const userId = payload.user_id;
  const clientId = payload.client_id;
  if (!userId) {
    throw new Error("user_id missing from access token");
  }
  return { userId, clientId };
}
async function authenticateRequest(headers) {
  const cookies = cookie2.parse(headers.get("cookie") || "");
  const token = cookies[Session2.cookieName];
  if (!token) {
    console.warn("[auth] No session cookie found in request.");
    throw Errors.forbidden("Invalid authentication token.");
  }
  const claim = await verifySessionToken(token);
  if (!claim) {
    throw Errors.forbidden("Invalid authentication token.");
  }
  const user = await findUserByUnionId(claim.unionId);
  if (!user) {
    throw Errors.forbidden("User not found. Please re-login.");
  }
  return user;
}
function createOAuthCallbackHandler() {
  return async (c) => {
    const code = c.req.query("code");
    const state = c.req.query("state");
    const error = c.req.query("error");
    const errorDescription = c.req.query("error_description");
    if (error) {
      if (error === "access_denied") {
        return c.redirect("/", 302);
      }
      return c.json(
        { error, error_description: errorDescription },
        400
      );
    }
    if (!code || !state) {
      return c.json({ error: "code and state are required" }, 400);
    }
    try {
      const redirectUri = atob(state);
      const tokenResp = await exchangeAuthCode(code, redirectUri);
      const { userId } = await verifyAccessToken(tokenResp.access_token);
      const userProfile = await users2.getProfile(tokenResp.access_token);
      if (!userProfile) {
        throw new Error("Failed to fetch user profile from Kimi Open");
      }
      await upsertUser({
        unionId: userId,
        name: userProfile.name,
        avatar: userProfile.avatar_url,
        lastSignInAt: /* @__PURE__ */ new Date()
      });
      const token = await signSessionToken({
        unionId: userId,
        clientId: env.appId
      });
      const cookieOpts = getSessionCookieOptions(c.req.raw.headers);
      setCookie(c, Session2.cookieName, token, {
        ...cookieOpts,
        maxAge: Session2.maxAgeMs / 1e3
      });
      return c.redirect("/", 302);
    } catch (error2) {
      console.error("[OAuth] Callback failed", error2);
      return c.json({ error: "OAuth callback failed" }, 500);
    }
  };
}

// api/context.ts
async function createContext(opts) {
  const ctx = { req: opts.req, resHeaders: opts.resHeaders };
  try {
    ctx.user = await authenticateRequest(opts.req.headers);
  } catch {
  }
  return ctx;
}

// api/boot.ts
import { Paths } from "@contracts/constants";
async function seedDefaultEmployee() {
  try {
    const mysql5 = await import("mysql2/promise");
    const bcrypt4 = await import("bcryptjs");
    const conn = await mysql5.default.createConnection(process.env.DATABASE_URL);
    const [existing] = await conn.execute(
      "SELECT id FROM employees WHERE username = ?",
      ["german"]
    );
    if (existing.length === 0) {
      const hashedPassword = await bcrypt4.default.hash("german123", 10);
      await conn.execute(
        "INSERT INTO employees (storeId, username, password, name, role) VALUES (?, ?, ?, ?, ?)",
        [1, "german", hashedPassword, "German", "employee"]
      );
      console.log("[SEED] Employee 'German' created successfully.");
    } else {
      console.log("[SEED] Employee 'German' already exists.");
    }
    await conn.end();
  } catch (err) {
    console.log("[SEED] Warning:", err.message);
  }
}
var app = new Hono();
app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));
app.get(Paths.oauthCallback, createOAuthCallbackHandler());
var { initRoute: initRoute2 } = await Promise.resolve().then(() => (init_init_route(), init_route_exports));
initRoute2(app);
app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext
  });
});
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));
var boot_default = app;
if (env.isProduction) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles: serveStaticFiles2 } = await Promise.resolve().then(() => (init_vite(), vite_exports));
  const { initDatabase: initDatabase2 } = await Promise.resolve().then(() => (init_db_init(), db_init_exports));
  serveStaticFiles2(app);
  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
  initDatabase2().catch((err) => {
    console.error("[DB-INIT] Failed:", err.message);
  });
  seedDefaultEmployee();
}
export {
  boot_default as default
};
