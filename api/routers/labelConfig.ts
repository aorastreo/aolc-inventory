import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import { db } from "../../db";
import { labelConfig } from "../../db/schema";
import { eq } from "drizzle-orm";

export const labelConfigRouter = createRouter({
  get: publicQuery
    .input(z.object({ storeId: z.number().default(1) }))
    .query(async ({ input }) => {
      const configs = await db
        .select()
        .from(labelConfig)
        .where(eq(labelConfig.storeId, input.storeId));

      if (configs.length === 0) {
        // Return default config
        return {
          id: 0,
          storeId: input.storeId,
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
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }

      return configs[0];
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
      const { storeId, ...data } = input;

      const configs = await db
        .select()
        .from(labelConfig)
        .where(eq(labelConfig.storeId, storeId));

      if (configs.length === 0) {
        await db.insert(labelConfig).values({
          storeId,
          ...data,
          updatedAt: new Date(),
        });
      } else {
        await db
          .update(labelConfig)
          .set({
            ...data,
            updatedAt: new Date(),
          })
          .where(eq(labelConfig.storeId, storeId));
      }

      return { success: true };
    }),
});
