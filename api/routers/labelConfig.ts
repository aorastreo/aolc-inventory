import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import mysql from "mysql2/promise";

const DEFAULT_CONFIG = {
  id: 0,
  storeId: 1,
  labelWidth: "50mm",
  labelHeight: "25mm",
  nameFontSize: "5pt",
  nameMarginTop: "1.5mm",
  nameMarginBottom: "0.3mm",
  priceFontSize: "20pt",
  ivaFontSize: "8pt",
  barcodeWidth: "35mm",
  barcodeHeight: "7.5mm",
  barcodeModuleWidth: "0.50",
  barcodeBarHeight: "9",
  barcodeNumberFontSize: "8pt",
  barcodeNumberLetterSpacing: "2px",
  barcodeNumberMarginTop: "0.3mm",
  footerFontSize: "5pt",
  footerMarginTop: "2mm",
  showPrice: true,
  showIva: true,
  showBarcode: true,
  showBarcodeNumber: true,
  showFooter: true,
  showDate: true,
  footerText: "American Outlet Los Chiles",
};

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
          return DEFAULT_CONFIG;
        }
        const r = rows[0];
        return {
          id: r.id,
          storeId: r.storeId,
          labelWidth: r.labelWidth,
          labelHeight: r.labelHeight,
          nameFontSize: r.nameFontSize,
          nameMarginTop: r.nameMarginTop,
          nameMarginBottom: r.nameMarginBottom,
          priceFontSize: r.priceFontSize,
          ivaFontSize: r.ivaFontSize,
          barcodeWidth: r.barcodeWidth,
          barcodeHeight: r.barcodeHeight,
          barcodeModuleWidth: r.barcodeModuleWidth,
          barcodeBarHeight: r.barcodeBarHeight,
          barcodeNumberFontSize: r.barcodeNumberFontSize,
          barcodeNumberLetterSpacing: r.barcodeNumberLetterSpacing,
          barcodeNumberMarginTop: r.barcodeNumberMarginTop,
          footerFontSize: r.footerFontSize,
          footerMarginTop: r.footerMarginTop,
          showPrice: !!r.showPrice,
          showIva: !!r.showIva,
          showBarcode: !!r.showBarcode,
          showBarcodeNumber: !!r.showBarcodeNumber,
          showFooter: !!r.showFooter,
          showDate: !!r.showDate,
          footerText: r.footerText,
        };
      } finally {
        await conn.end();
      }
    }),

  upsert: publicQuery
    .input(
      z.object({
        storeId: z.number().default(1),
        labelWidth: z.string().optional(),
        labelHeight: z.string().optional(),
        nameFontSize: z.string().optional(),
        nameMarginTop: z.string().optional(),
        nameMarginBottom: z.string().optional(),
        priceFontSize: z.string().optional(),
        ivaFontSize: z.string().optional(),
        barcodeWidth: z.string().optional(),
        barcodeHeight: z.string().optional(),
        barcodeModuleWidth: z.string().optional(),
        barcodeBarHeight: z.string().optional(),
        barcodeNumberFontSize: z.string().optional(),
        barcodeNumberLetterSpacing: z.string().optional(),
        barcodeNumberMarginTop: z.string().optional(),
        footerFontSize: z.string().optional(),
        footerMarginTop: z.string().optional(),
        showPrice: z.boolean().optional(),
        showIva: z.boolean().optional(),
        showBarcode: z.boolean().optional(),
        showBarcodeNumber: z.boolean().optional(),
        showFooter: z.boolean().optional(),
        showDate: z.boolean().optional(),
        footerText: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const conn = await getRawDb();
      try {
        const { storeId, ...data } = input;
        const [existing]: any = await conn.execute(
          "SELECT id FROM labelConfig WHERE storeId = ?",
          [storeId]
        );

        if (existing.length === 0) {
          await conn.execute(
            `INSERT INTO labelConfig (
              storeId, labelWidth, labelHeight, nameFontSize, nameMarginTop, nameMarginBottom,
              priceFontSize, ivaFontSize, barcodeWidth, barcodeHeight, barcodeModuleWidth, barcodeBarHeight,
              barcodeNumberFontSize, barcodeNumberLetterSpacing, barcodeNumberMarginTop,
              footerFontSize, footerMarginTop, showPrice, showIva, showBarcode, showBarcodeNumber,
              showFooter, showDate, footerText
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              storeId,
              data.labelWidth ?? DEFAULT_CONFIG.labelWidth,
              data.labelHeight ?? DEFAULT_CONFIG.labelHeight,
              data.nameFontSize ?? DEFAULT_CONFIG.nameFontSize,
              data.nameMarginTop ?? DEFAULT_CONFIG.nameMarginTop,
              data.nameMarginBottom ?? DEFAULT_CONFIG.nameMarginBottom,
              data.priceFontSize ?? DEFAULT_CONFIG.priceFontSize,
              data.ivaFontSize ?? DEFAULT_CONFIG.ivaFontSize,
              data.barcodeWidth ?? DEFAULT_CONFIG.barcodeWidth,
              data.barcodeHeight ?? DEFAULT_CONFIG.barcodeHeight,
              data.barcodeModuleWidth ?? DEFAULT_CONFIG.barcodeModuleWidth,
              data.barcodeBarHeight ?? DEFAULT_CONFIG.barcodeBarHeight,
              data.barcodeNumberFontSize ?? DEFAULT_CONFIG.barcodeNumberFontSize,
              data.barcodeNumberLetterSpacing ?? DEFAULT_CONFIG.barcodeNumberLetterSpacing,
              data.barcodeNumberMarginTop ?? DEFAULT_CONFIG.barcodeNumberMarginTop,
              data.footerFontSize ?? DEFAULT_CONFIG.footerFontSize,
              data.footerMarginTop ?? DEFAULT_CONFIG.footerMarginTop,
              data.showPrice ?? DEFAULT_CONFIG.showPrice,
              data.showIva ?? DEFAULT_CONFIG.showIva,
              data.showBarcode ?? DEFAULT_CONFIG.showBarcode,
              data.showBarcodeNumber ?? DEFAULT_CONFIG.showBarcodeNumber,
              data.showFooter ?? DEFAULT_CONFIG.showFooter,
              data.showDate ?? DEFAULT_CONFIG.showDate,
              data.footerText ?? DEFAULT_CONFIG.footerText,
            ]
          );
        } else {
          const fields: string[] = [];
          const values: any[] = [];
          for (const [key, value] of Object.entries(data)) {
            if (value !== undefined) {
              fields.push(`${key} = ?`);
              values.push(value);
            }
          }
          if (fields.length > 0) {
            await conn.execute(
              `UPDATE labelConfig SET ${fields.join(", ")} WHERE storeId = ?`,
              [...values, storeId]
            );
          }
        }

        return { success: true };
      } finally {
        await conn.end();
      }
    }),
});
