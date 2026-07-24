import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import mysql from "mysql2/promise";

const D: Record<string, string | boolean> = {
  labelWidth: "50mm", labelHeight: "25mm",
  nameFontSize: "8pt", nameTop: "0.3mm", nameTextAlign: "center", nameFontWeight: "bold", nameFontFamily: "Arial Narrow",
  priceFontSize: "26pt", ivaFontSize: "9pt", priceTop: "6mm", priceTextAlign: "center", priceFontWeight: "bold", priceFontFamily: "Arial Narrow",
  barcodeWidth: "46mm", barcodeHeight: "8mm", barcodeTop: "11mm", barcodeAlign: "center",
  barcodeNumberFontSize: "10pt", barcodeNumberLetterSpacing: "4px", barcodeNumberTop: "17.5mm", barcodeNumberAlign: "center", barcodeNumberFontWeight: "bold", barcodeNumberFontFamily: "Courier New",
  footerFontSize: "6pt", footerTop: "20.5mm", footerTextAlign: "center", footerFontFamily: "Arial Narrow",
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
        nameFontSize VARCHAR(10) NOT NULL DEFAULT '8pt',
        nameTop VARCHAR(10) NOT NULL DEFAULT '0.3mm',
        nameTextAlign VARCHAR(10) NOT NULL DEFAULT 'center',
        nameFontWeight VARCHAR(10) NOT NULL DEFAULT 'bold',
        nameFontFamily VARCHAR(30) NOT NULL DEFAULT 'Arial Narrow',
        priceFontSize VARCHAR(10) NOT NULL DEFAULT '26pt',
        ivaFontSize VARCHAR(10) NOT NULL DEFAULT '9pt',
        priceTop VARCHAR(10) NOT NULL DEFAULT '6mm',
        priceTextAlign VARCHAR(10) NOT NULL DEFAULT 'center',
        priceFontWeight VARCHAR(10) NOT NULL DEFAULT 'bold',
        priceFontFamily VARCHAR(30) NOT NULL DEFAULT 'Arial Narrow',
        barcodeWidth VARCHAR(10) NOT NULL DEFAULT '46mm',
        barcodeHeight VARCHAR(10) NOT NULL DEFAULT '8mm',
        barcodeTop VARCHAR(10) NOT NULL DEFAULT '11mm',
        barcodeAlign VARCHAR(10) NOT NULL DEFAULT 'center',
        barcodeNumberFontSize VARCHAR(10) NOT NULL DEFAULT '10pt',
        barcodeNumberLetterSpacing VARCHAR(10) NOT NULL DEFAULT '4px',
        barcodeNumberTop VARCHAR(10) NOT NULL DEFAULT '17.5mm',
        barcodeNumberAlign VARCHAR(10) NOT NULL DEFAULT 'center',
        barcodeNumberFontWeight VARCHAR(10) NOT NULL DEFAULT 'bold',
        barcodeNumberFontFamily VARCHAR(30) NOT NULL DEFAULT 'Courier New',
        footerFontSize VARCHAR(10) NOT NULL DEFAULT '6pt',
        footerTop VARCHAR(10) NOT NULL DEFAULT '20.5mm',
        footerTextAlign VARCHAR(10) NOT NULL DEFAULT 'center',
        footerFontFamily VARCHAR(30) NOT NULL DEFAULT 'Arial Narrow',
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
    // Add font family columns for existing tables
    try { await conn.execute(`ALTER TABLE labelConfig ADD COLUMN nameFontFamily VARCHAR(30) NOT NULL DEFAULT 'Arial Narrow'`); } catch { /* */ }
    try { await conn.execute(`ALTER TABLE labelConfig ADD COLUMN priceFontFamily VARCHAR(30) NOT NULL DEFAULT 'Arial Narrow'`); } catch { /* */ }
    try { await conn.execute(`ALTER TABLE labelConfig ADD COLUMN barcodeNumberFontFamily VARCHAR(30) NOT NULL DEFAULT 'Courier New'`); } catch { /* */ }
    try { await conn.execute(`ALTER TABLE labelConfig ADD COLUMN footerFontFamily VARCHAR(30) NOT NULL DEFAULT 'Arial Narrow'`); } catch { /* */ }
    // Remove old unused columns
    try { await conn.execute(`ALTER TABLE labelConfig DROP COLUMN barcodeFontSize`); } catch { /* */ }
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
