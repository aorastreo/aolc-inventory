import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TABLES = [
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
async function getRawDb() {
  return mysql.createConnection(process.env.DATABASE_URL);
}
async function initDatabase() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("[DB-INIT] DATABASE_URL not set!");
    return;
  }
  console.log("[DB-INIT] Connecting to database...");
  const conn = await getRawDb();
  try {
    for (const sql of TABLES) {
      await conn.execute(sql);
    }
    console.log("[DB-INIT] All tables created/verified!");
    const [palletsCheck] = await conn.execute("SELECT COUNT(*) as count FROM pallets");
    if (palletsCheck[0].count > 0) {
      console.log("[DB-INIT] Data already exists, skipping migration.");
      const [adminCheck] = await conn.execute("SELECT id FROM employees WHERE username = 'admin'");
      if (adminCheck.length === 0) {
        const hashed2 = await bcrypt.hash("admin123", 10);
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
    const hashed = await bcrypt.hash("admin123", 10);
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
    const backupPath = path.join(__dirname, "../backup_data.json");
    if (!fs.existsSync(backupPath)) {
      console.log("[DB-INIT] No backup_data.json found, skipping data migration.");
      return;
    }
    console.log("[DB-INIT] Loading backup data...");
    const backupRaw = JSON.parse(fs.readFileSync(backupPath, "utf-8"));
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
export {
  initDatabase
};
