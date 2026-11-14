import mysql from "mysql2/promise";

let ready = false;

async function tryExec(conn: mysql.Connection, statement: string) {
  try {
    await conn.execute(statement);
  } catch (err: any) {
    const msg = String(err?.message || err || "");
    if (/Duplicate column|already exists|ER_DUP_FIELDNAME|ER_DUP_KEYNAME/i.test(msg)) return;
    console.warn("[enterprise-schema]", msg);
  }
}

/**
 * Additive-only schema upgrades for profitability + audit.
 * Never drops or truncates data.
 */
export async function ensureEnterpriseSchema() {
  if (ready) return;
  const url = process.env.DATABASE_URL;
  if (!url) return;

  const conn = await mysql.createConnection(url);
  try {
    await tryExec(conn, "ALTER TABLE products ADD COLUMN costo DECIMAL(12,2) NULL");
    await tryExec(conn, "ALTER TABLE adjustmentItems ADD COLUMN costo DECIMAL(12,2) NULL");
    await tryExec(conn, "ALTER TABLE adjustmentItems ADD COLUMN codigo VARCHAR(50) NULL");
    await tryExec(conn, "ALTER TABLE adjustmentItems ADD COLUMN precioRefUsd DECIMAL(12,2) NULL");
    await tryExec(conn, "ALTER TABLE adjustmentItems ADD COLUMN sourceUrl VARCHAR(500) NULL");
    await tryExec(conn, "ALTER TABLE productDatabase ADD COLUMN codigo VARCHAR(50) NULL");
    await tryExec(conn, "ALTER TABLE pallets ADD COLUMN cajasAprox INT NULL");
    await tryExec(
      conn,
      "ALTER TABLE printedLabels ADD COLUMN sourceType VARCHAR(20) NOT NULL DEFAULT 'pallet'",
    );
    await tryExec(conn, "ALTER TABLE printedLabels ADD COLUMN copies INT NULL DEFAULT 1");
    await tryExec(
      conn,
      "CREATE INDEX idx_printed_store_source_ref ON printedLabels (storeId, sourceType, palletId)",
    );
    await tryExec(conn, "ALTER TABLE transferItems ADD COLUMN costo DECIMAL(12,2) NULL");
    await tryExec(conn, "ALTER TABLE transfers ADD COLUMN completedAt TIMESTAMP NULL");
    await tryExec(conn, "ALTER TABLE transfers ADD COLUMN createdBy VARCHAR(255) NULL");
    await tryExec(conn, "ALTER TABLE adjustments ADD COLUMN completedBy VARCHAR(255) NULL");
    await tryExec(conn, "CREATE INDEX idx_products_store_codigo ON products (storeId, codigo)");
    await tryExec(conn, "CREATE INDEX idx_adj_items_codigo ON adjustmentItems (codigo)");

    await tryExec(
      conn,
      `CREATE TABLE IF NOT EXISTS price_history (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        storeId BIGINT UNSIGNED NOT NULL,
        codigo VARCHAR(50) NULL,
        codigoBarras VARCHAR(50) NULL,
        nombre VARCHAR(255) NOT NULL,
        precio DECIMAL(12,2) NOT NULL,
        precioRefUsd DECIMAL(12,2) NULL,
        source VARCHAR(40) DEFAULT 'manual',
        palletId BIGINT UNSIGNED NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        INDEX idx_ph_store_codigo (storeId, codigo),
        INDEX idx_ph_store_barcode (storeId, codigoBarras),
        INDEX idx_ph_store_nombre (storeId, nombre(100))
      )`,
    );

    await tryExec(
      conn,
      `CREATE TABLE IF NOT EXISTS inventory_movements (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        storeId BIGINT UNSIGNED NOT NULL,
        toStoreId BIGINT UNSIGNED NULL,
        movementType VARCHAR(40) NOT NULL,
        refType VARCHAR(40) NOT NULL,
        refId BIGINT UNSIGNED NOT NULL,
        productId BIGINT UNSIGNED NULL,
        palletId BIGINT UNSIGNED NULL,
        codigoBarras VARCHAR(50) NULL,
        nombre VARCHAR(255) NULL,
        cantidad INT NOT NULL DEFAULT 0,
        precio DECIMAL(12,2) NULL,
        costo DECIMAL(12,2) NULL,
        actorId BIGINT UNSIGNED NULL,
        actorName VARCHAR(255) NULL,
        note VARCHAR(500) NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        INDEX idx_mov_store_created (storeId, createdAt),
        INDEX idx_mov_ref (refType, refId),
        INDEX idx_mov_barcode (codigoBarras)
      )`,
    );

    await tryExec(conn, "CREATE INDEX idx_products_store_barcode ON products (storeId, codigoBarras)");
    await tryExec(conn, "CREATE INDEX idx_products_store_pallet ON products (storeId, palletId)");

    await tryExec(
      conn,
      `CREATE TABLE IF NOT EXISTS financeEntries (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        storeId BIGINT UNSIGNED NOT NULL,
        tipo ENUM('ingreso','egreso') NOT NULL,
        categoria VARCHAR(50) NOT NULL,
        monto DECIMAL(12,2) NOT NULL,
        fecha VARCHAR(20) NOT NULL,
        metodoPago ENUM('efectivo','sinpe','tarjeta','transferencia','otro') NOT NULL DEFAULT 'efectivo',
        descripcion VARCHAR(500) NULL,
        fixedCostId BIGINT UNSIGNED NULL,
        createdBy VARCHAR(255) NULL,
        isActive BOOLEAN NOT NULL DEFAULT TRUE,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
        INDEX idx_fin_store_fecha (storeId, fecha),
        INDEX idx_fin_tipo (tipo),
        INDEX idx_fin_categoria (categoria),
        INDEX idx_fin_fixed (fixedCostId, fecha)
      )`,
    );
    await tryExec(conn, "ALTER TABLE financeEntries ADD COLUMN fixedCostId BIGINT UNSIGNED NULL");
    await tryExec(conn, "CREATE INDEX idx_fin_fixed ON financeEntries (fixedCostId, fecha)");

    await tryExec(
      conn,
      `CREATE TABLE IF NOT EXISTS financeFixedCosts (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        storeId BIGINT UNSIGNED NOT NULL,
        nombre VARCHAR(120) NOT NULL,
        categoria VARCHAR(50) NOT NULL,
        monto DECIMAL(12,2) NOT NULL,
        frecuencia ENUM('semanal','quincenal','mensual') NOT NULL DEFAULT 'mensual',
        diaMes INT NOT NULL DEFAULT 1,
        metodoPago ENUM('efectivo','sinpe','tarjeta','transferencia','otro') NOT NULL DEFAULT 'transferencia',
        descripcion VARCHAR(500) NULL,
        isActive BOOLEAN NOT NULL DEFAULT TRUE,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
        INDEX idx_ffc_store (storeId),
        INDEX idx_ffc_active (isActive)
      )`,
    );
    await tryExec(
      conn,
      "ALTER TABLE financeFixedCosts ADD COLUMN frecuencia ENUM('semanal','quincenal','mensual') NOT NULL DEFAULT 'mensual'",
    );

    // Retail stores for finance book (Bodega stays operational only)
    await tryExec(
      conn,
      `INSERT INTO stores (name, slug, description, isActive)
       SELECT 'Los Chiles', 'los-chiles', 'Tienda Los Chiles', 1
       FROM DUAL
       WHERE NOT EXISTS (SELECT 1 FROM stores WHERE slug = 'los-chiles' OR name LIKE '%Los Chiles%')`,
    );
    await tryExec(
      conn,
      `INSERT INTO stores (name, slug, description, isActive)
       SELECT 'Pavón', 'pavon', 'Tienda Pavón', 1
       FROM DUAL
       WHERE NOT EXISTS (SELECT 1 FROM stores WHERE slug = 'pavon' OR name LIKE '%Pavon%' OR name LIKE '%Pavón%')`,
    );
    await tryExec(
      conn,
      `INSERT INTO stores (name, slug, description, isActive)
       SELECT 'Santa Rosa', 'santa-rosa', 'Tienda Santa Rosa', 1
       FROM DUAL
       WHERE NOT EXISTS (SELECT 1 FROM stores WHERE slug = 'santa-rosa' OR name LIKE '%Santa Rosa%')`,
    );

    // HR / Personal (from-scratch attendance + settlement foundation)
    await tryExec(
      conn,
      `CREATE TABLE IF NOT EXISTS hrEmployees (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        storeId BIGINT UNSIGNED NOT NULL,
        cedula VARCHAR(50) NULL,
        nombre VARCHAR(255) NOT NULL,
        apellidos VARCHAR(255) NOT NULL,
        puesto VARCHAR(100) NOT NULL,
        salarioBase DECIMAL(12,2) NOT NULL,
        tipoSalario ENUM('semanal','quincenal','mensual') NOT NULL DEFAULT 'quincenal',
        fechaIngreso VARCHAR(20) NOT NULL,
        telefono VARCHAR(50) NULL,
        estado ENUM('activo','inactivo') NOT NULL DEFAULT 'activo',
        isActive BOOLEAN NOT NULL DEFAULT TRUE,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
        INDEX idx_hr_emp_store (storeId),
        INDEX idx_hr_emp_active (isActive, estado)
      )`,
    );

    await tryExec(
      conn,
      `CREATE TABLE IF NOT EXISTS hrStoreSchedules (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        storeId BIGINT UNSIGNED NOT NULL,
        diaSemana INT NOT NULL,
        laborable BOOLEAN NOT NULL DEFAULT TRUE,
        horaEntrada VARCHAR(5) NOT NULL DEFAULT '08:00',
        horaSalida VARCHAR(5) NOT NULL DEFAULT '17:00',
        isActive BOOLEAN NOT NULL DEFAULT TRUE,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
        UNIQUE KEY uq_hr_sched_store_day (storeId, diaSemana),
        INDEX idx_hr_sched_store (storeId)
      )`,
    );

    await tryExec(
      conn,
      `CREATE TABLE IF NOT EXISTS hrAttendanceEvents (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        storeId BIGINT UNSIGNED NOT NULL,
        employeeId BIGINT UNSIGNED NOT NULL,
        fecha VARCHAR(20) NOT NULL,
        tipo ENUM('ausencia','tardanza','salida_tarde') NOT NULL,
        horaProgramada VARCHAR(5) NULL,
        horaReal VARCHAR(5) NULL,
        minutos INT NOT NULL DEFAULT 0,
        justificada BOOLEAN NOT NULL DEFAULT FALSE,
        nota VARCHAR(500) NULL,
        createdBy VARCHAR(255) NULL,
        isActive BOOLEAN NOT NULL DEFAULT TRUE,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
        INDEX idx_hr_att_store_fecha (storeId, fecha),
        INDEX idx_hr_att_employee (employeeId, fecha),
        INDEX idx_hr_att_tipo (tipo)
      )`,
    );

    ready = true;
    console.log("[enterprise-schema] Ready (additive columns + inventory_movements + finance + hr)");
  } finally {
    await conn.end();
  }
}
