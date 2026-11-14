import { z } from "zod";
import { createRouter, authedQuery, managerQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { hrEmployees, hrStoreSchedules, hrAttendanceEvents, hrLiquidaciones, stores } from "@db/schema";
import { and, desc, eq, gte, lte, ne } from "drizzle-orm";
import { ensureEnterpriseSchema } from "../lib/enterprise-schema";
import { calcularLiquidacion } from "../lib/liquidacion-cr";

const BODEGA_STORE_ID = 1;

const tipoSalarioEnum = z.enum(["semanal", "quincenal", "mensual"]);
const eventoTipoEnum = z.enum(["ausencia", "tardanza", "salida_tarde"]);
const tipoSalidaEnum = z.enum(["renuncia", "despido_con_responsabilidad", "despido_sin_responsabilidad"]);

const liquidacionInputShape = z.object({
  employeeId: z.number(),
  tipoSalida: tipoSalidaEnum,
  fechaSalida: z.string().min(1),
  promedioMensual: z.string().optional(),
  pagaPreaviso: z.boolean().optional(),
  diasVacaciones: z.number().optional(),
  sumaSalariosAguinaldo: z.string().optional(),
  salariosPendientes: z.string().optional(),
  marcarInactivo: z.boolean().optional(),
  nota: z.string().optional(),
});

const DIA_LABELS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

function weekdayMon1(fecha: string): number {
  const d = new Date(`${fecha}T12:00:00`);
  const js = d.getDay();
  return js === 0 ? 7 : js;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map((x) => Number(x));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

function minutesToHHMM(total: number): string {
  const h = Math.floor(Math.max(0, total) / 60);
  const m = Math.max(0, total) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

async function assertRetailStore(db: ReturnType<typeof getDb>, storeId: number) {
  if (storeId === BODEGA_STORE_ID) throw new Error("Bodega no aplica para personal de tienda");
  const [row] = await db.select().from(stores).where(and(eq(stores.id, storeId), eq(stores.isActive, true))).limit(1);
  if (!row) throw new Error("Tienda no encontrada");
  return row;
}

/** Horarios oficiales por tienda (Lun–Sáb). Dom = no laborable. */
function hoursForStore(store: { name?: string | null; slug?: string | null }): { entrada: string; salida: string } {
  const key = `${store.slug || ""} ${store.name || ""}`.toLowerCase();
  if (key.includes("los-chiles") || key.includes("los chiles")) {
    return { entrada: "09:00", salida: "19:00" }; // 9 a 7
  }
  // Pavón y Santa Rosa (y demás tiendas retail por defecto)
  return { entrada: "08:00", salida: "18:00" }; // 8 a 6
}

async function ensureDefaultSchedule(db: ReturnType<typeof getDb>, storeId: number) {
  const existing = await db.select().from(hrStoreSchedules).where(and(eq(hrStoreSchedules.storeId, storeId), eq(hrStoreSchedules.isActive, true)));
  if (existing.length > 0) return existing;

  const store = await assertRetailStore(db, storeId);
  const { entrada, salida } = hoursForStore(store);

  const defaults = [
    { dia: 1, laborable: true, entrada, salida },
    { dia: 2, laborable: true, entrada, salida },
    { dia: 3, laborable: true, entrada, salida },
    { dia: 4, laborable: true, entrada, salida },
    { dia: 5, laborable: true, entrada, salida },
    { dia: 6, laborable: true, entrada, salida },
    { dia: 7, laborable: false, entrada, salida },
  ];

  for (const d of defaults) {
    try {
      await db.insert(hrStoreSchedules).values({
        storeId,
        diaSemana: d.dia,
        laborable: d.laborable,
        horaEntrada: d.entrada,
        horaSalida: d.salida,
      });
    } catch {
      // unique race — ignore
    }
  }

  return db.select().from(hrStoreSchedules).where(and(eq(hrStoreSchedules.storeId, storeId), eq(hrStoreSchedules.isActive, true)));
}

let officialHoursApplied = false;

/** Aplica horarios oficiales de las 3 tiendas una vez por arranque del servidor. */
async function applyOfficialStoreHours(db: ReturnType<typeof getDb>) {
  if (officialHoursApplied) return;
  const retail = await db.select().from(stores).where(and(eq(stores.isActive, true), ne(stores.id, BODEGA_STORE_ID)));
  for (const store of retail) {
    const { entrada, salida } = hoursForStore(store);
    const existing = await db.select().from(hrStoreSchedules).where(eq(hrStoreSchedules.storeId, store.id));
    if (existing.length === 0) {
      await ensureDefaultSchedule(db, store.id);
      continue;
    }
    for (const row of existing) {
      await db.update(hrStoreSchedules).set({
        horaEntrada: entrada,
        horaSalida: salida,
        laborable: row.diaSemana !== 7,
        isActive: true,
      }).where(eq(hrStoreSchedules.id, row.id));
    }
  }
  officialHoursApplied = true;
}

export const hrRouter = createRouter({
  stores: authedQuery.query(async () => {
    const db = getDb();
    await ensureEnterpriseSchema();
    const rows = await db.select().from(stores).where(and(eq(stores.isActive, true), ne(stores.id, BODEGA_STORE_ID)));
    return rows.sort((a, b) => a.name.localeCompare(b.name, "es"));
  }),

  // ---------- Employees ----------
  employees: authedQuery
    .input(z.object({ storeId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      await ensureEnterpriseSchema();
      const conditions = [eq(hrEmployees.isActive, true)];
      if (input?.storeId != null) conditions.push(eq(hrEmployees.storeId, input.storeId));
      return db.select().from(hrEmployees).where(and(...conditions)).orderBy(desc(hrEmployees.id));
    }),

  createEmployee: managerQuery
    .input(z.object({
      storeId: z.number(),
      cedula: z.string().optional(),
      nombre: z.string().min(1),
      apellidos: z.string().min(1),
      puesto: z.string().min(1),
      salarioBase: z.string().min(1),
      tipoSalario: tipoSalarioEnum.default("quincenal"),
      fechaIngreso: z.string().min(1),
      telefono: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await ensureEnterpriseSchema();
      await assertRetailStore(db, input.storeId);
      const salario = Number(input.salarioBase);
      if (!Number.isFinite(salario) || salario <= 0) throw new Error("Salario inválido");
      const result = await db.insert(hrEmployees).values({
        storeId: input.storeId,
        cedula: input.cedula?.trim() || null,
        nombre: input.nombre.trim(),
        apellidos: input.apellidos.trim(),
        puesto: input.puesto.trim(),
        salarioBase: String(salario),
        tipoSalario: input.tipoSalario,
        fechaIngreso: input.fechaIngreso,
        telefono: input.telefono?.trim() || null,
        estado: "activo",
      });
      return { id: Number(result[0].insertId) };
    }),

  updateEmployee: managerQuery
    .input(z.object({
      id: z.number(),
      storeId: z.number().optional(),
      cedula: z.string().optional(),
      nombre: z.string().min(1).optional(),
      apellidos: z.string().min(1).optional(),
      puesto: z.string().min(1).optional(),
      salarioBase: z.string().optional(),
      tipoSalario: tipoSalarioEnum.optional(),
      fechaIngreso: z.string().optional(),
      telefono: z.string().optional(),
      estado: z.enum(["activo", "inactivo"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await ensureEnterpriseSchema();
      const [emp] = await db.select().from(hrEmployees).where(eq(hrEmployees.id, input.id)).limit(1);
      if (!emp || !emp.isActive) throw new Error("Empleado no encontrado");
      const { id, ...raw } = input;
      const setData: Record<string, unknown> = {};
      if (raw.storeId !== undefined) {
        await assertRetailStore(db, raw.storeId);
        setData.storeId = raw.storeId;
      }
      if (raw.cedula !== undefined) setData.cedula = raw.cedula.trim() || null;
      if (raw.nombre !== undefined) setData.nombre = raw.nombre.trim();
      if (raw.apellidos !== undefined) setData.apellidos = raw.apellidos.trim();
      if (raw.puesto !== undefined) setData.puesto = raw.puesto.trim();
      if (raw.salarioBase !== undefined) {
        const salario = Number(raw.salarioBase);
        if (!Number.isFinite(salario) || salario <= 0) throw new Error("Salario inválido");
        setData.salarioBase = String(salario);
      }
      if (raw.tipoSalario !== undefined) setData.tipoSalario = raw.tipoSalario;
      if (raw.fechaIngreso !== undefined) setData.fechaIngreso = raw.fechaIngreso;
      if (raw.telefono !== undefined) setData.telefono = raw.telefono.trim() || null;
      if (raw.estado !== undefined) setData.estado = raw.estado;
      if (Object.keys(setData).length === 0) throw new Error("No hay cambios");
      await db.update(hrEmployees).set(setData).where(eq(hrEmployees.id, id));
      return { success: true };
    }),

  deleteEmployee: managerQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await ensureEnterpriseSchema();
      await db.update(hrEmployees).set({ isActive: false, estado: "inactivo" }).where(eq(hrEmployees.id, input.id));
      return { success: true };
    }),

  // ---------- Schedules ----------
  schedule: authedQuery
    .input(z.object({ storeId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      await ensureEnterpriseSchema();
      await assertRetailStore(db, input.storeId);
      // Una vez: deja Los Chiles 9–7 y Pavón/Santa Rosa 8–6
      await applyOfficialStoreHours(db);
      const rows = await ensureDefaultSchedule(db, input.storeId);
      return rows
        .sort((a, b) => a.diaSemana - b.diaSemana)
        .map((r) => ({ ...r, diaLabel: DIA_LABELS[r.diaSemana] || String(r.diaSemana) }));
    }),

  saveSchedule: managerQuery
    .input(z.object({
      storeId: z.number(),
      days: z.array(z.object({
        diaSemana: z.number().int().min(1).max(7),
        laborable: z.boolean(),
        horaEntrada: z.string().regex(/^\d{2}:\d{2}$/),
        horaSalida: z.string().regex(/^\d{2}:\d{2}$/),
      })).min(1),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await ensureEnterpriseSchema();
      await assertRetailStore(db, input.storeId);
      await ensureDefaultSchedule(db, input.storeId);

      for (const day of input.days) {
        if (day.laborable && timeToMinutes(day.horaSalida) <= timeToMinutes(day.horaEntrada)) {
          throw new Error(`Horario inválido el ${DIA_LABELS[day.diaSemana]}: la salida debe ser después de la entrada`);
        }
        const [existing] = await db.select().from(hrStoreSchedules)
          .where(and(eq(hrStoreSchedules.storeId, input.storeId), eq(hrStoreSchedules.diaSemana, day.diaSemana)))
          .limit(1);
        if (existing) {
          await db.update(hrStoreSchedules).set({
            laborable: day.laborable,
            horaEntrada: day.horaEntrada,
            horaSalida: day.horaSalida,
            isActive: true,
          }).where(eq(hrStoreSchedules.id, existing.id));
        } else {
          await db.insert(hrStoreSchedules).values({
            storeId: input.storeId,
            diaSemana: day.diaSemana,
            laborable: day.laborable,
            horaEntrada: day.horaEntrada,
            horaSalida: day.horaSalida,
          });
        }
      }
      return { success: true };
    }),

  // ---------- Attendance exceptions ----------
  events: authedQuery
    .input(z.object({
      storeId: z.number().optional(),
      employeeId: z.number().optional(),
      desde: z.string().optional(),
      hasta: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      await ensureEnterpriseSchema();
      const conditions = [eq(hrAttendanceEvents.isActive, true)];
      if (input?.storeId != null) conditions.push(eq(hrAttendanceEvents.storeId, input.storeId));
      if (input?.employeeId != null) conditions.push(eq(hrAttendanceEvents.employeeId, input.employeeId));
      if (input?.desde) conditions.push(gte(hrAttendanceEvents.fecha, input.desde));
      if (input?.hasta) conditions.push(lte(hrAttendanceEvents.fecha, input.hasta));

      const rows = await db.select().from(hrAttendanceEvents).where(and(...conditions)).orderBy(desc(hrAttendanceEvents.fecha), desc(hrAttendanceEvents.id));
      const empIds = [...new Set(rows.map((r) => r.employeeId))];
      const emps = empIds.length
        ? await db.select().from(hrEmployees).where(eq(hrEmployees.isActive, true))
        : [];
      const empMap = new Map(emps.map((e) => [e.id, e]));

      return rows.map((r) => {
        const emp = empMap.get(r.employeeId);
        return {
          ...r,
          empleadoNombre: emp ? `${emp.nombre} ${emp.apellidos}` : `Empleado #${r.employeeId}`,
          minutosLabel: r.tipo === "ausencia" ? "—" : `${r.minutos} min (${minutesToHHMM(r.minutos)})`,
        };
      });
    }),

  createEvent: managerQuery
    .input(z.object({
      storeId: z.number(),
      employeeId: z.number(),
      fecha: z.string().min(1),
      tipo: eventoTipoEnum,
      horaReal: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      justificada: z.boolean().optional(),
      nota: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await ensureEnterpriseSchema();
      await assertRetailStore(db, input.storeId);

      const [emp] = await db.select().from(hrEmployees).where(and(
        eq(hrEmployees.id, input.employeeId),
        eq(hrEmployees.isActive, true),
      )).limit(1);
      if (!emp) throw new Error("Empleado no encontrado");
      if (emp.storeId !== input.storeId) throw new Error("El empleado no pertenece a esa tienda");

      const scheduleRows = await ensureDefaultSchedule(db, input.storeId);
      const wd = weekdayMon1(input.fecha);
      const day = scheduleRows.find((s) => s.diaSemana === wd);

      let horaProgramada: string | null = null;
      let minutos = 0;

      if (input.tipo === "ausencia") {
        if (day && !day.laborable) throw new Error("Ese día no es laborable en el horario de la tienda");
      } else {
        if (!input.horaReal) throw new Error("Indicá la hora real");
        if (!day || !day.laborable) throw new Error("Ese día no es laborable en el horario de la tienda");
        if (input.tipo === "tardanza") {
          horaProgramada = day.horaEntrada;
          minutos = Math.max(0, timeToMinutes(input.horaReal) - timeToMinutes(day.horaEntrada));
          if (minutos <= 0) throw new Error("La hora indicada no es después de la entrada programada");
        } else {
          horaProgramada = day.horaSalida;
          minutos = Math.max(0, timeToMinutes(input.horaReal) - timeToMinutes(day.horaSalida));
          if (minutos <= 0) throw new Error("La hora indicada no es después de la salida programada");
        }
      }

      const actor = ctx.user?.name || ctx.user?.unionId || null;
      const result = await db.insert(hrAttendanceEvents).values({
        storeId: input.storeId,
        employeeId: input.employeeId,
        fecha: input.fecha,
        tipo: input.tipo,
        horaProgramada,
        horaReal: input.tipo === "ausencia" ? null : (input.horaReal || null),
        minutos,
        justificada: !!input.justificada,
        nota: input.nota?.trim() || null,
        createdBy: actor,
      });
      return { id: Number(result[0].insertId), minutos };
    }),

  deleteEvent: managerQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await ensureEnterpriseSchema();
      await db.update(hrAttendanceEvents).set({ isActive: false }).where(eq(hrAttendanceEvents.id, input.id));
      return { success: true };
    }),

  summaryByEmployee: authedQuery
    .input(z.object({
      storeId: z.number().optional(),
      desde: z.string(),
      hasta: z.string(),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      await ensureEnterpriseSchema();
      const empConditions = [eq(hrEmployees.isActive, true), eq(hrEmployees.estado, "activo")];
      if (input.storeId != null) empConditions.push(eq(hrEmployees.storeId, input.storeId));
      const emps = await db.select().from(hrEmployees).where(and(...empConditions));

      const eventConditions = [
        eq(hrAttendanceEvents.isActive, true),
        gte(hrAttendanceEvents.fecha, input.desde),
        lte(hrAttendanceEvents.fecha, input.hasta),
      ];
      if (input.storeId != null) eventConditions.push(eq(hrAttendanceEvents.storeId, input.storeId));
      const events = await db.select().from(hrAttendanceEvents).where(and(...eventConditions));

      return emps.map((e) => {
        const mine = events.filter((ev) => ev.employeeId === e.id);
        const ausencias = mine.filter((ev) => ev.tipo === "ausencia");
        const tardanzas = mine.filter((ev) => ev.tipo === "tardanza");
        const salidas = mine.filter((ev) => ev.tipo === "salida_tarde");
        return {
          employeeId: e.id,
          storeId: e.storeId,
          nombre: `${e.nombre} ${e.apellidos}`,
          puesto: e.puesto,
          ausencias: ausencias.length,
          ausenciasInjustificadas: ausencias.filter((a) => !a.justificada).length,
          tardanzas: tardanzas.length,
          minutosTarde: tardanzas.reduce((s, t) => s + (t.minutos || 0), 0),
          salidasTarde: salidas.length,
          minutosExtra: salidas.reduce((s, t) => s + (t.minutos || 0), 0),
        };
      }).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    }),

  /**
   * Estimado a pagar en un periodo (ej. quincena), aplicando excepciones:
   * - Ausencia → descuenta 1 día (aunque esté marcada justificada)
   * - Tardanza → descuenta minutos proporcionales (aunque esté justificada)
   * - Salida tarde → suma horas extra a 1.5×
   */
  quincenaPay: authedQuery
    .input(z.object({
      storeId: z.number().optional(),
      desde: z.string(),
      hasta: z.string(),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      await ensureEnterpriseSchema();

      const empConditions = [eq(hrEmployees.isActive, true), eq(hrEmployees.estado, "activo")];
      if (input.storeId != null) empConditions.push(eq(hrEmployees.storeId, input.storeId));
      const emps = await db.select().from(hrEmployees).where(and(...empConditions));

      const eventConditions = [
        eq(hrAttendanceEvents.isActive, true),
        gte(hrAttendanceEvents.fecha, input.desde),
        lte(hrAttendanceEvents.fecha, input.hasta),
      ];
      if (input.storeId != null) eventConditions.push(eq(hrAttendanceEvents.storeId, input.storeId));
      const events = await db.select().from(hrAttendanceEvents).where(and(...eventConditions));

      const scheduleByStore = new Map<number, Awaited<ReturnType<typeof ensureDefaultSchedule>>>();
      const round2 = (n: number) => Math.round(n * 100) / 100;

      function periodPay(salarioBase: number, tipo: string): { bruto: number; diario: number } {
        if (tipo === "mensual") {
          return { bruto: salarioBase / 2, diario: salarioBase / 30 };
        }
        if (tipo === "semanal") {
          // Quincena ≈ 2 semanas
          return { bruto: salarioBase * 2, diario: salarioBase / 6 };
        }
        // quincenal: el salarioBase es lo de la quincena
        return { bruto: salarioBase, diario: salarioBase / 15 };
      }

      function jornadaMinutos(storeId: number, fecha: string): number {
        const rows = scheduleByStore.get(storeId) || [];
        const wd = weekdayMon1(fecha);
        const day = rows.find((s) => s.diaSemana === wd);
        if (!day || !day.laborable) return 8 * 60;
        const mins = timeToMinutes(day.horaSalida) - timeToMinutes(day.horaEntrada);
        return mins > 0 ? mins : 8 * 60;
      }

      const rows = [];
      for (const e of emps) {
        if (!scheduleByStore.has(e.storeId)) {
          try {
            scheduleByStore.set(e.storeId, await ensureDefaultSchedule(db, e.storeId));
          } catch {
            scheduleByStore.set(e.storeId, []);
          }
        }

        const base = Number(e.salarioBase) || 0;
        const { bruto, diario } = periodPay(base, e.tipoSalario);

        const mine = events.filter((ev) => ev.employeeId === e.id);
        // Rebaja siempre, justificada o no
        const ausencias = mine.filter((ev) => ev.tipo === "ausencia");
        const tardanzas = mine.filter((ev) => ev.tipo === "tardanza");
        const extras = mine.filter((ev) => ev.tipo === "salida_tarde");

        const descAusencias = round2(ausencias.length * diario);
        let descTardanzas = 0;
        for (const t of tardanzas) {
          const jornada = jornadaMinutos(e.storeId, t.fecha);
          const vMin = diario / jornada;
          descTardanzas += (t.minutos || 0) * vMin;
        }
        descTardanzas = round2(descTardanzas);

        let montoExtras = 0;
        for (const x of extras) {
          const jornada = jornadaMinutos(e.storeId, x.fecha);
          const vMin = diario / jornada;
          // Hora extra ordinaria CR: 50% adicional → 1.5×
          montoExtras += (x.minutos || 0) * vMin * 1.5;
        }
        montoExtras = round2(montoExtras);

        const minutosTarde = tardanzas.reduce((s, t) => s + (t.minutos || 0), 0);
        const descuentos = round2(descAusencias + descTardanzas);
        const neto = round2(Math.max(0, bruto - descuentos + montoExtras));

        rows.push({
          employeeId: e.id,
          storeId: e.storeId,
          nombre: `${e.nombre} ${e.apellidos}`,
          puesto: e.puesto,
          tipoSalario: e.tipoSalario,
          salarioBase: base,
          brutoPeriodo: round2(bruto),
          diario: round2(diario),
          ausencias: ausencias.length,
          minutosTarde,
          minutosExtra: extras.reduce((s, t) => s + (t.minutos || 0), 0),
          descAusencias,
          descTardanzas,
          descuentos,
          montoExtras,
          netoPagar: neto,
          detalleEventos: mine.map((ev) => ({
            id: ev.id,
            fecha: ev.fecha,
            tipo: ev.tipo,
            minutos: ev.minutos,
            justificada: ev.justificada,
            horaReal: ev.horaReal,
            descuentoEstimado: ev.tipo === "ausencia"
              ? round2(diario)
              : ev.tipo === "tardanza"
                ? round2((ev.minutos || 0) * (diario / jornadaMinutos(e.storeId, ev.fecha)))
                : 0,
          })),
        });
      }

      const totalNeto = round2(rows.reduce((s, r) => s + r.netoPagar, 0));
      return {
        desde: input.desde,
        hasta: input.hasta,
        totalNeto,
        empleados: rows.sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
      };
    }),

  // ---------- Liquidación (Costa Rica) ----------
  previewLiquidacion: managerQuery
    .input(liquidacionInputShape)
    .mutation(async ({ input }) => {
      const db = getDb();
      await ensureEnterpriseSchema();
      const [emp] = await db.select().from(hrEmployees).where(and(
        eq(hrEmployees.id, input.employeeId),
        eq(hrEmployees.isActive, true),
      )).limit(1);
      if (!emp) throw new Error("Empleado no encontrado");

      const promedio = Number(input.promedioMensual || emp.salarioBase);
      if (!Number.isFinite(promedio) || promedio <= 0) throw new Error("Promedio salarial inválido");

      const result = calcularLiquidacion({
        tipoSalida: input.tipoSalida,
        fechaIngreso: emp.fechaIngreso,
        fechaSalida: input.fechaSalida,
        promedioMensual: promedio,
        tipoSalario: emp.tipoSalario as "semanal" | "quincenal" | "mensual",
        pagaPreaviso: input.pagaPreaviso !== false,
        diasVacaciones: input.diasVacaciones,
        sumaSalariosAguinaldo: input.sumaSalariosAguinaldo != null ? Number(input.sumaSalariosAguinaldo) : null,
        salariosPendientes: input.salariosPendientes != null ? Number(input.salariosPendientes) : 0,
      });

      return {
        employee: {
          id: emp.id,
          storeId: emp.storeId,
          nombre: `${emp.nombre} ${emp.apellidos}`,
          puesto: emp.puesto,
          fechaIngreso: emp.fechaIngreso,
          salarioBase: emp.salarioBase,
          tipoSalario: emp.tipoSalario,
        },
        ...result,
      };
    }),

  saveLiquidacion: managerQuery
    .input(liquidacionInputShape)
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await ensureEnterpriseSchema();
      const [emp] = await db.select().from(hrEmployees).where(and(
        eq(hrEmployees.id, input.employeeId),
        eq(hrEmployees.isActive, true),
      )).limit(1);
      if (!emp) throw new Error("Empleado no encontrado");

      const promedio = Number(input.promedioMensual || emp.salarioBase);
      if (!Number.isFinite(promedio) || promedio <= 0) throw new Error("Promedio salarial inválido");

      const result = calcularLiquidacion({
        tipoSalida: input.tipoSalida,
        fechaIngreso: emp.fechaIngreso,
        fechaSalida: input.fechaSalida,
        promedioMensual: promedio,
        tipoSalario: emp.tipoSalario as "semanal" | "quincenal" | "mensual",
        pagaPreaviso: input.pagaPreaviso !== false,
        diasVacaciones: input.diasVacaciones,
        sumaSalariosAguinaldo: input.sumaSalariosAguinaldo != null ? Number(input.sumaSalariosAguinaldo) : null,
        salariosPendientes: input.salariosPendientes != null ? Number(input.salariosPendientes) : 0,
      });

      const insertResult = await db.insert(hrLiquidaciones).values({
        storeId: emp.storeId,
        employeeId: emp.id,
        tipoSalida: input.tipoSalida,
        fechaIngreso: emp.fechaIngreso,
        fechaSalida: input.fechaSalida,
        promedioMensual: String(promedio),
        tipoSalario: emp.tipoSalario,
        pagaPreaviso: input.pagaPreaviso !== false,
        preavisoMonto: String(result.preavisoMonto),
        cesantiaMonto: String(result.cesantiaMonto),
        vacacionesMonto: String(result.vacacionesMonto),
        aguinaldoMonto: String(result.aguinaldoMonto),
        salariosPendientes: String(result.salariosPendientes),
        total: String(result.total),
        detalleJson: JSON.stringify(result),
        nota: input.nota?.trim() || null,
        createdBy: ctx.user?.name || ctx.user?.unionId || null,
      });

      if (input.marcarInactivo) {
        await db.update(hrEmployees).set({ estado: "inactivo" }).where(eq(hrEmployees.id, emp.id));
      }

      return { id: Number(insertResult[0].insertId), total: result.total, result };
    }),

  liquidaciones: authedQuery
    .input(z.object({ storeId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      await ensureEnterpriseSchema();
      const conditions = [eq(hrLiquidaciones.isActive, true)];
      if (input?.storeId != null) conditions.push(eq(hrLiquidaciones.storeId, input.storeId));
      const rows = await db.select().from(hrLiquidaciones).where(and(...conditions)).orderBy(desc(hrLiquidaciones.id));
      const emps = await db.select().from(hrEmployees);
      const empMap = new Map(emps.map((e) => [e.id, e]));
      const TIPO: Record<string, string> = {
        renuncia: "Renuncia",
        despido_con_responsabilidad: "Despido con responsabilidad",
        despido_sin_responsabilidad: "Despido sin responsabilidad",
      };
      return rows.map((r) => {
        const emp = empMap.get(r.employeeId);
        return {
          ...r,
          tipoSalidaLabel: TIPO[r.tipoSalida] || r.tipoSalida,
          empleadoNombre: emp ? `${emp.nombre} ${emp.apellidos}` : `Empleado #${r.employeeId}`,
        };
      });
    }),

  deleteLiquidacion: managerQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await ensureEnterpriseSchema();
      await db.update(hrLiquidaciones).set({ isActive: false }).where(eq(hrLiquidaciones.id, input.id));
      return { success: true };
    }),
});
