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

    ready = true;
    console.log("[enterprise-schema] Ready (additive columns + inventory_movements)");
  } finally {
    await conn.end();
  }
}
