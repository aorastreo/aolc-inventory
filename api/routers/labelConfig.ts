import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import mysql from "mysql2/promise";

const D = {
  labelWidth: "50mm", labelHeight: "25mm",
  nameFontSize: "5pt", nameMarginTop: "1.5mm", nameMarginBottom: "0.3mm", nameTextAlign: "center",
  priceFontSize: "20pt", ivaFontSize: "8pt", priceMarginTop: "0.2mm", priceMarginBottom: "0.2mm", priceTextAlign: "center",
  barcodeWidth: "35mm", barcodeHeight: "7.5mm", barcodeModuleWidth: "0.50", barcodeBarHeight: "9", barcodeMarginTop: "0.5mm", barcodeAlign: "center",
  barcodeNumberFontSize: "8pt", barcodeNumberLetterSpacing: "2px", barcodeNumberMarginTop: "0.3mm", barcodeNumberMarginBottom: "0.2mm", barcodeNumberAlign: "center",
  footerFontSize: "5pt", footerMarginTop: "2mm", footerMarginBottom: "0.3mm", footerTextAlign: "center",
  showPrice: true, showIva: true, showBarcode: true, showBarcodeNumber: true, showFooter: true, showDate: true,
  footerText: "American Outlet Los Chiles",
};

const ALL_FIELDS = [
  "labelWidth", "labelHeight", "nameFontSize", "nameMarginTop", "nameMarginBottom", "nameTextAlign",
  "priceFontSize", "ivaFontSize", "priceMarginTop", "priceMarginBottom", "priceTextAlign",
  "barcodeWidth", "barcodeHeight", "barcodeModuleWidth", "barcodeBarHeight", "barcodeMarginTop", "barcodeAlign",
  "barcodeNumberFontSize", "barcodeNumberLetterSpacing", "barcodeNumberMarginTop", "barcodeNumberMarginBottom", "barcodeNumberAlign",
  "footerFontSize", "footerMarginTop", "footerMarginBottom", "footerTextAlign",
  "showPrice", "showIva", "showBarcode", "showBarcodeNumber", "showFooter", "showDate", "footerText",
];

async function getRawDb() {
  return mysql.createConnection(process.env.DATABASE_URL!);
}

export const labelConfigRouter = createRouter({
  get: publicQuery
    .input(z.object({ storeId: z.number().default(1) }))
    .query(async ({ input }) => {
      const conn = await getRawDb();
      try {
        const [rows]: any = await conn.execute(
          "SELECT * FROM labelConfig WHERE storeId = ?",
          [input.storeId]
        );
        if (rows.length === 0) {
          return { id: 0, storeId: input.storeId, ...D };
        }
        const r = rows[0];
        const result: any = { id: r.id, storeId: r.storeId };
        for (const f of ALL_FIELDS) {
          result[f] = r[f] ?? (D as any)[f];
        }
        // Convert boolean fields
        for (const f of ["showPrice","showIva","showBarcode","showBarcodeNumber","showFooter","showDate"]) {
          result[f] = !!r[f];
        }
        return result;
      } finally {
        await conn.end();
      }
    }),

  upsert: publicQuery
    .input(z.object({
      storeId: z.number().default(1),
      ...Object.fromEntries(ALL_FIELDS.map(f => [f, f.startsWith("show") ? z.boolean().optional() : z.string().optional()])),
    }))
    .mutation(async ({ input }) => {
      const conn = await getRawDb();
      try {
        const { storeId, ...data } = input;
        const [existing]: any = await conn.execute("SELECT id FROM labelConfig WHERE storeId = ?", [storeId]);

        const cols = ["storeId", ...ALL_FIELDS];
        if (existing.length === 0) {
          const placeholders = cols.map(() => "?").join(", ");
          const values = [
            storeId,
            ...ALL_FIELDS.map(f => (data as any)[f] ?? (D as any)[f]),
          ];
          await conn.execute(`INSERT INTO labelConfig (${cols.join(", ")}) VALUES (${placeholders})`, values);
        } else {
          const setFields: string[] = [];
          const values: any[] = [];
          for (const [key, value] of Object.entries(data)) {
            if (value !== undefined) { setFields.push(`${key} = ?`); values.push(value); }
          }
          if (setFields.length > 0) {
            await conn.execute(`UPDATE labelConfig SET ${setFields.join(", ")} WHERE storeId = ?`, [...values, storeId]);
          }
        }
        return { success: true };
      } finally {
        await conn.end();
      }
    }),
});
