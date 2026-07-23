import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import mysql from "mysql2/promise";

const D: Record<string, string | boolean> = {
  labelWidth: "50mm", labelHeight: "25mm",
  nameFontSize: "5pt", nameTop: "1mm", nameTextAlign: "center", nameFontWeight: "bold",
  priceFontSize: "20pt", ivaFontSize: "8pt", priceTop: "6mm", priceTextAlign: "center", priceFontWeight: "bold",
  barcodeWidth: "42mm", barcodeHeight: "7mm", barcodeFontSize: "28pt", barcodeTop: "12mm", barcodeAlign: "center",
  barcodeNumberFontSize: "8pt", barcodeNumberLetterSpacing: "2px", barcodeNumberTop: "17mm", barcodeNumberAlign: "center",
  footerFontSize: "5pt", footerTop: "20mm", footerTextAlign: "center",
  showPrice: true, showIva: true, showBarcode: true, showBarcodeNumber: true, showFooter: true, showDate: true,
  footerText: "American Outlet Los Chiles",
};

const ALL_FIELDS = Object.keys(D).filter(k => k !== "footerText");

async function getRawDb() {
  return mysql.createConnection(process.env.DATABASE_URL!);
}

// Ensure labelConfig table exists
async function ensureTable() {
  const conn = await getRawDb();
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS labelConfig (
        id INT AUTO_INCREMENT PRIMARY KEY,
        storeId BIGINT UNSIGNED NOT NULL DEFAULT 1,
        labelWidth VARCHAR(20) NOT NULL DEFAULT '50mm',
        labelHeight VARCHAR(20) NOT NULL DEFAULT '25mm',
        nameFontSize VARCHAR(10) NOT NULL DEFAULT '5pt',
        nameTop VARCHAR(10) NOT NULL DEFAULT '1mm',
        nameTextAlign VARCHAR(10) NOT NULL DEFAULT 'center',
        nameFontWeight VARCHAR(10) NOT NULL DEFAULT 'bold',
        priceFontSize VARCHAR(10) NOT NULL DEFAULT '20pt',
        ivaFontSize VARCHAR(10) NOT NULL DEFAULT '8pt',
        priceTop VARCHAR(10) NOT NULL DEFAULT '6mm',
        priceTextAlign VARCHAR(10) NOT NULL DEFAULT 'center',
        priceFontWeight VARCHAR(10) NOT NULL DEFAULT 'bold',
        barcodeWidth VARCHAR(10) NOT NULL DEFAULT '42mm',
        barcodeHeight VARCHAR(10) NOT NULL DEFAULT '7mm',
        barcodeFontSize VARCHAR(10) NOT NULL DEFAULT '28pt',
        barcodeTop VARCHAR(10) NOT NULL DEFAULT '12mm',
        barcodeAlign VARCHAR(10) NOT NULL DEFAULT 'center',
        barcodeNumberFontSize VARCHAR(10) NOT NULL DEFAULT '8pt',
        barcodeNumberLetterSpacing VARCHAR(10) NOT NULL DEFAULT '2px',
        barcodeNumberTop VARCHAR(10) NOT NULL DEFAULT '17mm',
        barcodeNumberAlign VARCHAR(10) NOT NULL DEFAULT 'center',
        footerFontSize VARCHAR(10) NOT NULL DEFAULT '5pt',
        footerTop VARCHAR(10) NOT NULL DEFAULT '20mm',
        footerTextAlign VARCHAR(10) NOT NULL DEFAULT 'center',
        showPrice BOOLEAN NOT NULL DEFAULT TRUE,
        showIva BOOLEAN NOT NULL DEFAULT TRUE,
        showBarcode BOOLEAN NOT NULL DEFAULT TRUE,
        showBarcodeNumber BOOLEAN NOT NULL DEFAULT TRUE,
        showFooter BOOLEAN NOT NULL DEFAULT TRUE,
        showDate BOOLEAN NOT NULL DEFAULT TRUE,
        footerText VARCHAR(100) NOT NULL DEFAULT 'American Outlet Los Chiles',
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_store (storeId)
      )
    `);
    // Add new column for existing tables
    try { await conn.execute(`ALTER TABLE labelConfig ADD COLUMN barcodeFontSize VARCHAR(10) NOT NULL DEFAULT '28pt'`); } catch { /* */ }
    try { await conn.execute(`ALTER TABLE labelConfig ADD COLUMN nameFontWeight VARCHAR(10) NOT NULL DEFAULT 'bold'`); } catch { /* */ }
    try { await conn.execute(`ALTER TABLE labelConfig ADD COLUMN priceFontWeight VARCHAR(10) NOT NULL DEFAULT 'bold'`); } catch { /* */ }
    // Remove old columns from existing tables
    try { await conn.execute(`ALTER TABLE labelConfig DROP COLUMN barcodeModuleWidth`); } catch { /* */ }
    try { await conn.execute(`ALTER TABLE labelConfig DROP COLUMN barcodeBarHeight`); } catch { /* */ }
  } finally { await conn.end(); }
}

export const labelConfigRouter = createRouter({
  get: publicQuery
    .input(z.object({ storeId: z.number().default(1) }))
    .query(async ({ input }) => {
      await ensureTable();
      const conn = await getRawDb();
      try {
        const [rows]: any = await conn.execute("SELECT * FROM labelConfig WHERE storeId = ?", [input.storeId]);
        if (rows.length === 0) return { id: 0, storeId: input.storeId, ...D };
        const r = rows[0];
        const result: any = { id: r.id, storeId: r.storeId };
        for (const f of ALL_FIELDS) result[f] = r[f] ?? D[f];
        result.footerText = r.footerText ?? "American Outlet Los Chiles";
        for (const f of ["showPrice","showIva","showBarcode","showBarcodeNumber","showFooter","showDate"]) result[f] = !!r[f];
        return result;
      } finally { await conn.end(); }
    }),

  upsert: publicQuery
    .input(z.object({
      storeId: z.number().default(1),
      ...Object.fromEntries(ALL_FIELDS.map(f => [f, typeof D[f] === "boolean" ? z.boolean().optional() : z.string().optional()])),
      footerText: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await ensureTable();
      const conn = await getRawDb();
      try {
        const { storeId, ...data } = input;
        const [existing]: any = await conn.execute("SELECT id FROM labelConfig WHERE storeId = ?", [storeId]);

        const cols = ["storeId", ...ALL_FIELDS, "footerText"];
        if (existing.length === 0) {
          const placeholders = cols.map(() => "?").join(", ");
          const values = [storeId, ...ALL_FIELDS.map(f => (data as any)[f] ?? D[f]), (data as any).footerText ?? D.footerText];
          await conn.execute(`INSERT INTO labelConfig (${cols.join(", ")}) VALUES (${placeholders})`, values);
        } else {
          const setFields: string[] = [];
          const values: any[] = [];
          for (const [key, value] of Object.entries(data)) {
            if (value !== undefined) { setFields.push(`${key} = ?`); values.push(value); }
          }
          if (setFields.length > 0) await conn.execute(`UPDATE labelConfig SET ${setFields.join(", ")} WHERE storeId = ?`, [...values, storeId]);
        }
        return { success: true };
      } finally { await conn.end(); }
    }),
});
