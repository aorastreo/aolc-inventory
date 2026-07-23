import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import mysql from "mysql2/promise";

const D: Record<string, string | boolean> = {
  labelWidth: "50mm", labelHeight: "25mm",
  nameFontSize: "5pt", nameTop: "1mm", nameTextAlign: "center",
  priceFontSize: "20pt", ivaFontSize: "8pt", priceTop: "6mm", priceTextAlign: "center",
  barcodeWidth: "35mm", barcodeHeight: "7.5mm", barcodeModuleWidth: "0.50", barcodeBarHeight: "9", barcodeTop: "12mm", barcodeAlign: "center",
  barcodeNumberFontSize: "8pt", barcodeNumberLetterSpacing: "2px", barcodeNumberTop: "17mm", barcodeNumberAlign: "center",
  footerFontSize: "5pt", footerTop: "20mm", footerTextAlign: "center",
  showPrice: true, showIva: true, showBarcode: true, showBarcodeNumber: true, showFooter: true, showDate: true,
  footerText: "American Outlet Los Chiles",
};

const ALL_FIELDS = Object.keys(D).filter(k => k !== "footerText");

async function getRawDb() {
  return mysql.createConnection(process.env.DATABASE_URL!);
}

export const labelConfigRouter = createRouter({
  get: publicQuery
    .input(z.object({ storeId: z.number().default(1) }))
    .query(async ({ input }) => {
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
