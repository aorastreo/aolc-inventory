import { z } from "zod";
import { createRouter, authedQuery, managerQuery, adminQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { financeEntries, financeFixedCosts, stores } from "@db/schema";
import { and, desc, eq, gte, lte, ne } from "drizzle-orm";
import { ensureEnterpriseSchema } from "../lib/enterprise-schema";

const BODEGA_STORE_ID = 1;

export const FINANCE_CATEGORIES = {
  ingreso: [
    { id: "ventas", label: "Ventas" },
    { id: "otros_ingresos", label: "Otros ingresos" },
  ],
  egreso: [
    { id: "compras_mercaderia", label: "Compras de mercaderia / contenedores" },
    { id: "planilla", label: "Planilla" },
    { id: "alquiler", label: "Alquiler" },
    { id: "servicios", label: "Servicios (luz, agua, internet)" },
    { id: "transporte", label: "Transporte / fletes" },
    { id: "mantenimiento", label: "Mantenimiento" },
    { id: "varios", label: "Varios / otros gastos" },
  ],
} as const;

const metodoEnum = z.enum(["efectivo", "sinpe", "tarjeta", "transferencia", "otro"]);
const tipoEnum = z.enum(["ingreso", "egreso"]);
const frecuenciaEnum = z.enum(["semanal", "quincenal", "mensual"]);

function shiftDate(yyyyMmDd: string, days: number): string {
  const d = new Date(`${yyyyMmDd}T12:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysBetween(a: string, b: string): number {
  const da = new Date(`${a}T12:00:00`).getTime();
  const db = new Date(`${b}T12:00:00`).getTime();
  return Math.max(1, Math.round((db - da) / 86400000) + 1);
}

function daysInMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate();
}

function padDay(yearMonth: string, day: number): string {
  const [ys, ms] = yearMonth.split("-");
  const maxDay = daysInMonth(Number(ys), Number(ms));
  const d = Math.min(Math.max(1, day), maxDay);
  return `${ys}-${ms}-${String(d).padStart(2, "0")}`;
}

/**
 * Dates to post inside a calendar month for a fixed cost.
 * - mensual: 1 payment on diaMes
 * - quincenal: 2 payments (diaMes and diaMes+14)
 * - semanal: every matching weekday (diaMes 1=Lun … 7=Dom)
 * monto is the amount PER payment period.
 */
function fechasForFixed(
  yearMonth: string,
  frecuencia: "semanal" | "quincenal" | "mensual" | string | null | undefined,
  diaMes: number,
): string[] {
  const freq = (frecuencia || "mensual") as string;
  const [ys, ms] = yearMonth.split("-");
  const year = Number(ys);
  const month = Number(ms);
  const last = daysInMonth(year, month);

  if (freq === "semanal") {
    const weekday = Math.min(7, Math.max(1, Number(diaMes) || 1)); // 1=Mon … 7=Sun
    const targetMonBased = weekday - 1;
    const out: string[] = [];
    for (let d = 1; d <= last; d++) {
      const dt = new Date(year, month - 1, d);
      const js = dt.getDay(); // 0=Sun
      const monBased = js === 0 ? 6 : js - 1;
      if (monBased === targetMonBased) out.push(padDay(yearMonth, d));
    }
    return out;
  }

  if (freq === "quincenal") {
    const d1 = Math.min(14, Math.max(1, Number(diaMes) || 1));
    const d2 = Math.min(last, d1 + 14);
    const dates = [padDay(yearMonth, d1)];
    if (d2 !== d1) dates.push(padDay(yearMonth, d2));
    return dates;
  }

  // mensual
  return [padDay(yearMonth, Number(diaMes) || 1)];
}

function sumBy(
  rows: { tipo: string; categoria: string; monto: string | number; storeId: number }[],
  pred: (r: (typeof rows)[0]) => boolean,
) {
  return rows.filter(pred).reduce((s, r) => s + Number(r.monto || 0), 0);
}

export const financeRouter = createRouter({
  categories: authedQuery.query(() => FINANCE_CATEGORIES),

  /** Retail stores only — Bodega is excluded from the cash book. */
  financeStores: authedQuery.query(async () => {
    const db = getDb();
    await ensureEnterpriseSchema();
    const rows = await db.select().from(stores).where(and(eq(stores.isActive, true), ne(stores.id, BODEGA_STORE_ID)));
    return rows.sort((a, b) => a.name.localeCompare(b.name, "es"));
  }),

  list: authedQuery
    .input(z.object({
      storeId: z.number().optional(),
      desde: z.string().optional(),
      hasta: z.string().optional(),
      tipo: tipoEnum.optional(),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      await ensureEnterpriseSchema();
      const conditions = [eq(financeEntries.isActive, true), ne(financeEntries.storeId, BODEGA_STORE_ID)];
      if (input.storeId != null) conditions.push(eq(financeEntries.storeId, input.storeId));
      if (input.desde) conditions.push(gte(financeEntries.fecha, input.desde));
      if (input.hasta) conditions.push(lte(financeEntries.fecha, input.hasta));
      if (input.tipo) conditions.push(eq(financeEntries.tipo, input.tipo));
      return db.select().from(financeEntries).where(and(...conditions)).orderBy(desc(financeEntries.fecha), desc(financeEntries.id));
    }),

  create: managerQuery
    .input(z.object({
      storeId: z.number(),
      tipo: tipoEnum,
      categoria: z.string().min(1),
      monto: z.number().positive(),
      fecha: z.string().min(8),
      metodoPago: metodoEnum.default("efectivo"),
      descripcion: z.string().max(500).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await ensureEnterpriseSchema();
      if (input.storeId === BODEGA_STORE_ID) {
        throw new Error("Finanzas solo aplica a tiendas (Los Chiles, Pavon, Santa Rosa), no a Bodega");
      }
      const allowed = input.tipo === "ingreso"
        ? FINANCE_CATEGORIES.ingreso.map((c) => c.id)
        : FINANCE_CATEGORIES.egreso.map((c) => c.id);
      if (!allowed.includes(input.categoria as any)) {
        throw new Error("Categoria no valida para este tipo");
      }
      const result = await db.insert(financeEntries).values({
        storeId: input.storeId,
        tipo: input.tipo,
        categoria: input.categoria,
        monto: String(input.monto),
        fecha: input.fecha,
        metodoPago: input.metodoPago,
        descripcion: input.descripcion || null,
        createdBy: ctx.user?.name || ctx.user?.unionId || null,
      });
      return { id: Number(result[0].insertId) };
    }),

  update: managerQuery
    .input(z.object({
      id: z.number(),
      storeId: z.number().optional(),
      tipo: tipoEnum.optional(),
      categoria: z.string().optional(),
      monto: z.number().positive().optional(),
      fecha: z.string().optional(),
      metodoPago: metodoEnum.optional(),
      descripcion: z.string().max(500).nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await ensureEnterpriseSchema();
      const { id, ...rest } = input;
      const patch: Record<string, unknown> = {};
      if (rest.storeId != null) {
        if (rest.storeId === BODEGA_STORE_ID) throw new Error("No se puede asignar a Bodega");
        patch.storeId = rest.storeId;
      }
      if (rest.tipo != null) patch.tipo = rest.tipo;
      if (rest.categoria != null) patch.categoria = rest.categoria;
      if (rest.monto != null) patch.monto = String(rest.monto);
      if (rest.fecha != null) patch.fecha = rest.fecha;
      if (rest.metodoPago != null) patch.metodoPago = rest.metodoPago;
      if (rest.descripcion !== undefined) patch.descripcion = rest.descripcion;
      if (Object.keys(patch).length === 0) return { success: true };
      await db.update(financeEntries).set(patch).where(and(eq(financeEntries.id, id), eq(financeEntries.isActive, true)));
      return { success: true };
    }),

  remove: managerQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await ensureEnterpriseSchema();
      await db.update(financeEntries).set({ isActive: false }).where(eq(financeEntries.id, input.id));
      return { success: true };
    }),

  // ---------- Gastos fijos (recurrentes mensuales) ----------
  listFixed: authedQuery
    .input(z.object({ storeId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      await ensureEnterpriseSchema();
      const conditions = [eq(financeFixedCosts.isActive, true), ne(financeFixedCosts.storeId, BODEGA_STORE_ID)];
      if (input?.storeId != null) conditions.push(eq(financeFixedCosts.storeId, input.storeId));
      return db.select().from(financeFixedCosts).where(and(...conditions)).orderBy(financeFixedCosts.storeId, financeFixedCosts.nombre);
    }),

  createFixed: managerQuery
    .input(z.object({
      storeId: z.number(),
      nombre: z.string().min(1).max(120),
      categoria: z.string().min(1),
      monto: z.number().positive(),
      frecuencia: frecuenciaEnum.default("mensual"),
      diaMes: z.number().int().min(1).max(28).default(1),
      metodoPago: metodoEnum.default("transferencia"),
      descripcion: z.string().max(500).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await ensureEnterpriseSchema();
      if (input.storeId === BODEGA_STORE_ID) throw new Error("Gastos fijos solo para tiendas, no Bodega");
      const allowed = FINANCE_CATEGORIES.egreso.map((c) => c.id) as string[];
      if (!allowed.includes(input.categoria)) throw new Error("Categoria no valida para gasto fijo");
      const diaMes = input.frecuencia === "semanal"
        ? Math.min(7, Math.max(1, input.diaMes))
        : Math.min(28, Math.max(1, input.diaMes));
      const result = await db.insert(financeFixedCosts).values({
        storeId: input.storeId,
        nombre: input.nombre.trim(),
        categoria: input.categoria,
        monto: String(input.monto),
        frecuencia: input.frecuencia,
        diaMes,
        metodoPago: input.metodoPago,
        descripcion: input.descripcion?.trim() || null,
      });
      return { id: Number(result[0].insertId) };
    }),

  updateFixed: managerQuery
    .input(z.object({
      id: z.number(),
      nombre: z.string().min(1).max(120).optional(),
      categoria: z.string().optional(),
      monto: z.number().positive().optional(),
      frecuencia: frecuenciaEnum.optional(),
      diaMes: z.number().int().min(1).max(28).optional(),
      metodoPago: metodoEnum.optional(),
      descripcion: z.string().max(500).nullable().optional(),
      storeId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await ensureEnterpriseSchema();
      const { id, ...rest } = input;
      const patch: Record<string, unknown> = {};
      if (rest.nombre != null) patch.nombre = rest.nombre.trim();
      if (rest.categoria != null) patch.categoria = rest.categoria;
      if (rest.monto != null) patch.monto = String(rest.monto);
      if (rest.frecuencia != null) patch.frecuencia = rest.frecuencia;
      if (rest.diaMes != null) patch.diaMes = rest.diaMes;
      if (rest.metodoPago != null) patch.metodoPago = rest.metodoPago;
      if (rest.descripcion !== undefined) patch.descripcion = rest.descripcion;
      if (rest.storeId != null) {
        if (rest.storeId === BODEGA_STORE_ID) throw new Error("No se puede asignar a Bodega");
        patch.storeId = rest.storeId;
      }
      if (Object.keys(patch).length === 0) return { success: true };
      await db.update(financeFixedCosts).set(patch).where(and(eq(financeFixedCosts.id, id), eq(financeFixedCosts.isActive, true)));
      return { success: true };
    }),

  removeFixed: managerQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await ensureEnterpriseSchema();
      await db.update(financeFixedCosts).set({ isActive: false }).where(eq(financeFixedCosts.id, input.id));
      return { success: true };
    }),

  /**
   * Apply all active fixed costs into the cash book for a given month (YYYY-MM).
   * Creates one entry per due date (1 mensual / 2 quincenal / ~4–5 semanal).
   * Skips dates already posted for that fixed cost (idempotent).
   */
  applyFixedToMonth: managerQuery
    .input(z.object({
      yearMonth: z.string().regex(/^\d{4}-\d{2}$/),
      storeId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await ensureEnterpriseSchema();
      const conditions = [eq(financeFixedCosts.isActive, true), ne(financeFixedCosts.storeId, BODEGA_STORE_ID)];
      if (input.storeId != null) conditions.push(eq(financeFixedCosts.storeId, input.storeId));
      const fixed = await db.select().from(financeFixedCosts).where(and(...conditions));

      let created = 0;
      let skipped = 0;
      for (const f of fixed) {
        const fechas = fechasForFixed(input.yearMonth, f.frecuencia, f.diaMes);
        const freqLabel = f.frecuencia === "semanal" ? "semanal" : f.frecuencia === "quincenal" ? "quincenal" : "mensual";
        for (const fecha of fechas) {
          const already = await db.select().from(financeEntries).where(and(
            eq(financeEntries.isActive, true),
            eq(financeEntries.fixedCostId, f.id),
            eq(financeEntries.fecha, fecha),
          )).limit(1);
          if (already.length > 0) {
            skipped += 1;
            continue;
          }
          const note = [
            `Gasto fijo (${freqLabel}): ${f.nombre}`,
            f.descripcion ? f.descripcion : null,
          ].filter(Boolean).join(" — ");
          await db.insert(financeEntries).values({
            storeId: f.storeId,
            tipo: "egreso",
            categoria: f.categoria,
            monto: String(f.monto),
            fecha,
            metodoPago: f.metodoPago,
            descripcion: note.slice(0, 500),
            fixedCostId: f.id,
            createdBy: ctx.user?.name || ctx.user?.unionId || null,
          });
          created += 1;
        }
      }
      return { created, skipped, total: fixed.length, yearMonth: input.yearMonth };
    }),

  /** Owner cockpit: totals + guidance alerts (manual book only). */
  summary: authedQuery
    .input(z.object({
      storeId: z.number().optional(),
      desde: z.string(),
      hasta: z.string(),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      await ensureEnterpriseSchema();
      const conditions = [
        eq(financeEntries.isActive, true),
        ne(financeEntries.storeId, BODEGA_STORE_ID),
        gte(financeEntries.fecha, input.desde),
        lte(financeEntries.fecha, input.hasta),
      ];
      if (input.storeId != null) conditions.push(eq(financeEntries.storeId, input.storeId));

      const rows = await db.select().from(financeEntries).where(and(...conditions));
      const ingresos = sumBy(rows, (r) => r.tipo === "ingreso");
      const egresos = sumBy(rows, (r) => r.tipo === "egreso");
      const ventas = sumBy(rows, (r) => r.tipo === "ingreso" && r.categoria === "ventas");
      const otrosIngresos = sumBy(rows, (r) => r.tipo === "ingreso" && r.categoria !== "ventas");
      const comprasMercaderia = sumBy(rows, (r) => r.tipo === "egreso" && r.categoria === "compras_mercaderia");
      const gastosOperativos = egresos - comprasMercaderia;
      const netoCaja = ingresos - egresos;
      const utilidadOperativa = ventas + otrosIngresos - gastosOperativos;

      const byCategory: Record<string, number> = {};
      for (const r of rows) {
        const key = `${r.tipo}:${r.categoria}`;
        byCategory[key] = (byCategory[key] || 0) + Number(r.monto || 0);
      }

      const retailStores = await db.select().from(stores).where(and(eq(stores.isActive, true), ne(stores.id, BODEGA_STORE_ID)));
      const storeName = (id: number) => retailStores.find((s) => s.id === id)?.name || `Tienda #${id}`;
      const storeIds = input.storeId != null
        ? [input.storeId]
        : retailStores.map((s) => s.id);

      const byStore = storeIds.map((id) => {
        const sIn = sumBy(rows, (r) => r.storeId === id && r.tipo === "ingreso");
        const sOut = sumBy(rows, (r) => r.storeId === id && r.tipo === "egreso");
        const sVentas = sumBy(rows, (r) => r.storeId === id && r.tipo === "ingreso" && r.categoria === "ventas");
        const sCompras = sumBy(rows, (r) => r.storeId === id && r.tipo === "egreso" && r.categoria === "compras_mercaderia");
        return {
          storeId: id,
          name: storeName(id),
          ingresos: sIn,
          egresos: sOut,
          neto: sIn - sOut,
          ventas: sVentas,
          comprasMercaderia: sCompras,
        };
      }).sort((a, b) => a.name.localeCompare(b.name, "es"));

      // Previous period of equal length (for sales trend)
      const span = daysBetween(input.desde, input.hasta);
      const prevHasta = shiftDate(input.desde, -1);
      const prevDesde = shiftDate(prevHasta, -(span - 1));
      const prevConditions = [
        eq(financeEntries.isActive, true),
        ne(financeEntries.storeId, BODEGA_STORE_ID),
        gte(financeEntries.fecha, prevDesde),
        lte(financeEntries.fecha, prevHasta),
      ];
      if (input.storeId != null) prevConditions.push(eq(financeEntries.storeId, input.storeId));
      const prevRows = await db.select().from(financeEntries).where(and(...prevConditions));
      const prevVentas = sumBy(prevRows, (r) => r.tipo === "ingreso" && r.categoria === "ventas");
      const ventasDeltaPct = prevVentas > 0 ? ((ventas - prevVentas) / prevVentas) * 100 : null;

      type Alert = { level: "critical" | "warning" | "ok"; code: string; title: string; detail: string };
      const alerts: Alert[] = [];

      if (rows.length === 0) {
        alerts.push({
          level: "warning",
          code: "sin_datos",
          title: "Sin movimientos en este periodo",
          detail: "Digitá ingresos y egresos para que el sistema pueda guiarte.",
        });
      } else {
        if (netoCaja < 0) {
          alerts.push({
            level: "critical",
            code: "caja_roja",
            title: "Estás gastando más de lo que entra",
            detail: `Egresos ₡${egresos.toLocaleString("es-CR")} vs ingresos ₡${ingresos.toLocaleString("es-CR")}. Caja neta: ₡${netoCaja.toLocaleString("es-CR")}.`,
          });
        } else if (netoCaja === 0 && egresos > 0) {
          alerts.push({
            level: "warning",
            code: "caja_cero",
            title: "Caja en cero",
            detail: "Entró exactamente lo mismo que salió. No estás acumulando reserva.",
          });
        } else {
          alerts.push({
            level: "ok",
            code: "caja_positiva",
            title: "Caja en positivo",
            detail: `Te quedaron ₡${netoCaja.toLocaleString("es-CR")} en el periodo.`,
          });
        }

        if (ventas === 0 && egresos > 0) {
          alerts.push({
            level: "critical",
            code: "sin_ventas",
            title: "Hay gastos pero no registraste ventas",
            detail: "Sin ventas digitadas no se puede medir el negocio. Registrá las ventas del periodo.",
          });
        } else if (ventasDeltaPct != null && ventasDeltaPct <= -20) {
          alerts.push({
            level: "warning",
            code: "ventas_bajan",
            title: "Las ventas van mal vs el periodo anterior",
            detail: `Ventas bajaron ${Math.abs(ventasDeltaPct).toFixed(0)}% (₡${ventas.toLocaleString("es-CR")} vs ₡${prevVentas.toLocaleString("es-CR")} antes).`,
          });
        } else if (ventasDeltaPct != null && ventasDeltaPct >= 10) {
          alerts.push({
            level: "ok",
            code: "ventas_suben",
            title: "Ventas mejorando",
            detail: `Subieron ${ventasDeltaPct.toFixed(0)}% vs el periodo anterior.`,
          });
        }

        if (ventas > 0 && gastosOperativos > ventas) {
          alerts.push({
            level: "critical",
            code: "opex_alto",
            title: "Gastos operativos superan las ventas",
            detail: `Planilla/alquiler/servicios/etc. ₡${gastosOperativos.toLocaleString("es-CR")} > ventas ₡${ventas.toLocaleString("es-CR")}.`,
          });
        }

        if (ventas > 0 && comprasMercaderia > ventas * 0.8) {
          alerts.push({
            level: "warning",
            code: "compras_altas",
            title: "Compras de mercadería muy altas vs ventas",
            detail: `Compraste ₡${comprasMercaderia.toLocaleString("es-CR")} en mercadería (más del 80% de ventas ₡${ventas.toLocaleString("es-CR")}). Revisá si estás sobre-inventariando.`,
          });
        }
      }

      return {
        desde: input.desde,
        hasta: input.hasta,
        prevDesde,
        prevHasta,
        ingresos,
        egresos,
        netoCaja,
        ventas,
        otrosIngresos,
        comprasMercaderia,
        gastosOperativos,
        utilidadOperativa,
        ventasDeltaPct,
        byCategory,
        byStore,
        alerts,
        movimientos: rows.length,
      };
    }),

  purgeAllAdmin: adminQuery.mutation(async () => {
    // Safety hatch only — soft-delete all finance rows
    const db = getDb();
    await ensureEnterpriseSchema();
    await db.update(financeEntries).set({ isActive: false });
    return { success: true };
  }),
});
