import {
  mysqlTable,
  mysqlEnum,
  serial,
  bigint,
  varchar,
  text,
  timestamp,
  int,
  json,
  boolean,
  decimal,
} from "drizzle-orm/mysql-core";

// ============================================
// USERS (from auth system)
// ============================================
export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ============================================
// EMPLOYEES (Local auth with username/password)
// ============================================
export const employees = mysqlTable("employees", {
  id: serial("id").primaryKey(),
  storeId: bigint("storeId", { mode: "number", unsigned: true }).notNull(),
  username: varchar("username", { length: 100 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  role: mysqlEnum("role", ["employee", "manager", "admin"]).default("employee").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Employee = typeof employees.$inferSelect;
export type InsertEmployee = typeof employees.$inferInsert;

// ============================================
// STORES (Multi-tenancy)
// ============================================
export const stores = mysqlTable("stores", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 50 }).notNull().unique(),
  description: text("description"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
});

export type Store = typeof stores.$inferSelect;
export type InsertStore = typeof stores.$inferInsert;

// ============================================
// USER STORE ASSIGNMENTS (which user can access which store)
// ============================================
export const userStores = mysqlTable("userStores", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  storeId: bigint("storeId", { mode: "number", unsigned: true }).notNull(),
  role: mysqlEnum("role", ["viewer", "editor", "manager"]).default("editor").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type UserStore = typeof userStores.$inferSelect;

// ============================================
// PALLETS (Containers)
// ============================================
export const pallets = mysqlTable("pallets", {
  id: serial("id").primaryKey(),
  storeId: bigint("storeId", { mode: "number", unsigned: true }).notNull(),
  palletId: varchar("palletId", { length: 20 }).notNull(),
  fecha: varchar("fecha", { length: 20 }),
  description: varchar("description", { length: 255 }).notNull(),
  costo: decimal("costo", { precision: 12, scale: 2 }).default("0"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
});

export type Pallet = typeof pallets.$inferSelect;
export type InsertPallet = typeof pallets.$inferInsert;

// ============================================
// PRODUCTS (Articles/Items in pallets)
// ============================================
export const products = mysqlTable("products", {
  id: serial("id").primaryKey(),
  storeId: bigint("storeId", { mode: "number", unsigned: true }).notNull(),
  palletId: bigint("palletId", { mode: "number", unsigned: true }).notNull(),
  codigo: varchar("codigo", { length: 50 }),
  nombre: varchar("nombre", { length: 255 }).notNull(),
  precio: decimal("precio", { precision: 12, scale: 2 }).notNull(),
  cantidad: int("cantidad").default(1).notNull(),
  codigoBarras: varchar("codigoBarras", { length: 50 }),
  esNuevo: boolean("esNuevo").default(false),
  ordenAgregacion: int("ordenAgregacion"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
});

export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;

// ============================================
// PRODUCT DATABASE (Shared product catalog)
// ============================================
export const productDatabase = mysqlTable("productDatabase", {
  id: serial("id").primaryKey(),
  storeId: bigint("storeId", { mode: "number", unsigned: true }).notNull(),
  nombre: varchar("nombre", { length: 255 }).notNull(),
  precio: decimal("precio", { precision: 12, scale: 2 }).default("0"),
  codigoBarras: varchar("codigoBarras", { length: 50 }),
  categoria: varchar("categoria", { length: 100 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ProductDB = typeof productDatabase.$inferSelect;

// ============================================
// ADJUSTMENTS (Ajustes)
// ============================================
export const adjustments = mysqlTable("adjustments", {
  id: serial("id").primaryKey(),
  storeId: bigint("storeId", { mode: "number", unsigned: true }).notNull(),
  palletId: bigint("palletId", { mode: "number", unsigned: true }).notNull(),
  adjustmentId: varchar("adjustmentId", { length: 50 }).notNull(),
  description: varchar("description", { length: 255 }),
  estado: mysqlEnum("estado", ["activo", "completado", "cancelado"]).default("activo").notNull(),
  fecha: varchar("fecha", { length: 20 }),
  fechaHora: varchar("fechaHora", { length: 50 }),
  completedAt: timestamp("completedAt"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Adjustment = typeof adjustments.$inferSelect;
export type InsertAdjustment = typeof adjustments.$inferInsert;

// ============================================
// ADJUSTMENT ITEMS
// ============================================
export const adjustmentItems = mysqlTable("adjustmentItems", {
  id: serial("id").primaryKey(),
  adjustmentId: bigint("adjustmentId", { mode: "number", unsigned: true }).notNull(),
  nombre: varchar("nombre", { length: 255 }).notNull(),
  precio: decimal("precio", { precision: 12, scale: 2 }).notNull(),
  cantidad: int("cantidad").default(1).notNull(),
  codigoBarras: varchar("codigoBarras", { length: 50 }),
  orden: int("orden").default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AdjustmentItem = typeof adjustmentItems.$inferSelect;

// ============================================
// CLOSINGS (Cierres de caja)
// ============================================
export const closings = mysqlTable("closings", {
  id: serial("id").primaryKey(),
  storeId: bigint("storeId", { mode: "number", unsigned: true }).notNull(),
  fecha: varchar("fecha", { length: 20 }).notNull(),
  dia: varchar("dia", { length: 20 }),
  hora: varchar("hora", { length: 10 }),
  efectivo: decimal("efectivo", { precision: 12, scale: 2 }).default("0"),
  sinpe: decimal("sinpe", { precision: 12, scale: 2 }).default("0"),
  tarjeta: decimal("tarjeta", { precision: 12, scale: 2 }).default("0"),
  sinFactura: decimal("sinFactura", { precision: 12, scale: 2 }).default("0"),
  total: decimal("total", { precision: 12, scale: 2 }).default("0"),
  inicial: decimal("inicial", { precision: 12, scale: 2 }).default("0"),
  diferencia: decimal("diferencia", { precision: 12, scale: 2 }).default("0"),
  observaciones: text("observaciones"),
  revisado: boolean("revisado").default(false).notNull(),
  createdBy: varchar("createdBy", { length: 255 }),
  registradoPor: varchar("registradoPor", { length: 255 }),
  cierreHora: timestamp("cierreHora").defaultNow().notNull(),
  semana: int("semana"),
  anio: int("anio"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Closing = typeof closings.$inferSelect;
export type InsertClosing = typeof closings.$inferInsert;

// ============================================
// STORE EMPLOYEES (nombres para cierre)
// ============================================
export const storeEmployees = mysqlTable("storeEmployees", {
  id: serial("id").primaryKey(),
  storeId: bigint("storeId", { mode: "number", unsigned: true }).notNull(),
  nombre: varchar("nombre", { length: 255 }).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type StoreEmployee = typeof storeEmployees.$inferSelect;
export type InsertStoreEmployee = typeof storeEmployees.$inferInsert;

// ============================================
// STORE CONFIG (Monto inicial por tienda)
// ============================================
export const storeConfig = mysqlTable("storeConfig", {
  id: serial("id").primaryKey(),
  storeId: bigint("storeId", { mode: "number", unsigned: true }).notNull().unique(),
  montoInicial: decimal("montoInicial", { precision: 12, scale: 2 }).default("50000"),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
});

export type StoreConfig = typeof storeConfig.$inferSelect;
export type InsertStoreConfig = typeof storeConfig.$inferInsert;

// ============================================
// ASSEMBLERS (Armadores)
// ============================================
export const assemblers = mysqlTable("assemblers", {
  id: serial("id").primaryKey(),
  storeId: bigint("storeId", { mode: "number", unsigned: true }).notNull(),
  nombre: varchar("nombre", { length: 255 }).notNull(),
  telefono: varchar("telefono", { length: 50 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Assembler = typeof assemblers.$inferSelect;

// ============================================
// ASSEMBLY ASSIGNMENTS
// ============================================
export const assemblyAssignments = mysqlTable("assemblyAssignments", {
  id: serial("id").primaryKey(),
  storeId: bigint("storeId", { mode: "number", unsigned: true }).notNull(),
  assemblerId: bigint("assemblerId", { mode: "number", unsigned: true }).notNull(),
  palletId: bigint("palletId", { mode: "number", unsigned: true }).notNull(),
  fecha: varchar("fecha", { length: 20 }),
  items: json("items"),
  estado: mysqlEnum("estado", ["pendiente", "en_progreso", "completado"]).default("pendiente"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});


export type AssemblyAssignment = typeof assemblyAssignments.$inferSelect;

// ============================================
// PRINTED LABELS (Etiquetas impresas)
// ============================================
export const printedLabels = mysqlTable("printedLabels", {
  id: serial("id").primaryKey(),
  storeId: bigint("storeId", { mode: "number", unsigned: true }).notNull(),
  palletId: bigint("palletId", { mode: "number", unsigned: true }).notNull(),
  productId: bigint("productId", { mode: "number", unsigned: true }).notNull(),
  printedAt: timestamp("printedAt").defaultNow().notNull(),
});

export type PrintedLabel = typeof printedLabels.$inferSelect;

// ============================================
// LABEL CONFIG (Configuracion de etiquetas)
// ============================================
export const labelConfig = mysqlTable("labelConfig", {
  id: serial("id").primaryKey(),
  storeId: bigint("storeId", { mode: "number", unsigned: true }).notNull().default(1),
  // Label dimensions
  labelWidth: varchar("labelWidth", { length: 20 }).notNull().default("50mm"),
  labelHeight: varchar("labelHeight", { length: 20 }).notNull().default("25mm"),
  // Product name (absolute position Y=top)
  nameFontSize: varchar("nameFontSize", { length: 10 }).notNull().default("5pt"),
  nameTop: varchar("nameTop", { length: 10 }).notNull().default("1mm"),
  nameTextAlign: varchar("nameTextAlign", { length: 10 }).notNull().default("center"),
  // Price (absolute position Y=top)
  priceFontSize: varchar("priceFontSize", { length: 10 }).notNull().default("20pt"),
  ivaFontSize: varchar("ivaFontSize", { length: 10 }).notNull().default("8pt"),
  priceTop: varchar("priceTop", { length: 10 }).notNull().default("6mm"),
  priceTextAlign: varchar("priceTextAlign", { length: 10 }).notNull().default("center"),
  // Barcode (absolute position Y=top)
  barcodeWidth: varchar("barcodeWidth", { length: 10 }).notNull().default("35mm"),
  barcodeHeight: varchar("barcodeHeight", { length: 10 }).notNull().default("7.5mm"),
  barcodeModuleWidth: varchar("barcodeModuleWidth", { length: 10 }).notNull().default("0.50"),
  barcodeBarHeight: varchar("barcodeBarHeight", { length: 10 }).notNull().default("9"),
  barcodeTop: varchar("barcodeTop", { length: 10 }).notNull().default("12mm"),
  barcodeAlign: varchar("barcodeAlign", { length: 10 }).notNull().default("center"),
  // Barcode number (absolute position Y=top)
  barcodeNumberFontSize: varchar("barcodeNumberFontSize", { length: 10 }).notNull().default("8pt"),
  barcodeNumberLetterSpacing: varchar("barcodeNumberLetterSpacing", { length: 10 }).notNull().default("2px"),
  barcodeNumberTop: varchar("barcodeNumberTop", { length: 10 }).notNull().default("17mm"),
  barcodeNumberAlign: varchar("barcodeNumberAlign", { length: 10 }).notNull().default("center"),
  // Footer (absolute position Y=top)
  footerFontSize: varchar("footerFontSize", { length: 10 }).notNull().default("5pt"),
  footerTop: varchar("footerTop", { length: 10 }).notNull().default("20mm"),
  footerTextAlign: varchar("footerTextAlign", { length: 10 }).notNull().default("center"),
  // Show/hide elements
  showPrice: boolean("showPrice").notNull().default(true),
  showIva: boolean("showIva").notNull().default(true),
  showBarcode: boolean("showBarcode").notNull().default(true),
  showBarcodeNumber: boolean("showBarcodeNumber").notNull().default(true),
  showFooter: boolean("showFooter").notNull().default(true),
  showDate: boolean("showDate").notNull().default(true),
  footerText: varchar("footerText", { length: 100 }).notNull().default("American Outlet Los Chiles"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type LabelConfig = typeof labelConfig.$inferSelect;

// ============================================
// TRANSFERS (Transferencias entre tiendas)
// ============================================
export const transfers = mysqlTable("transfers", {
  id: serial("id").primaryKey(),
  fromStoreId: bigint("fromStoreId", { mode: "number", unsigned: true }).notNull(),
  toStoreId: bigint("toStoreId", { mode: "number", unsigned: true }).notNull(),
  fecha: varchar("fecha", { length: 20 }).notNull(),
  estado: varchar("estado", { length: 20 }).notNull().default("activo"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Transfer = typeof transfers.$inferSelect;
export type InsertTransfer = typeof transfers.$inferInsert;

export const transferItems = mysqlTable("transferItems", {
  id: serial("id").primaryKey(),
  transferId: bigint("transferId", { mode: "number", unsigned: true }).notNull(),
  codigoBarras: varchar("codigoBarras", { length: 50 }),
  nombre: varchar("nombre", { length: 255 }).notNull(),
  precio: decimal("precio", { precision: 12, scale: 2 }).notNull(),
  cantidad: int("cantidad").default(1).notNull(),
  orden: int("orden").default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TransferItem = typeof transferItems.$inferInsert;

// ============================================
// PAYROLL (Planilla / Nómina)
// ============================================

export const payrollEmployees = mysqlTable("payrollEmployees", {
  id: serial("id").primaryKey(),
  storeId: bigint("storeId", { mode: "number", unsigned: true }).notNull(),
  cedula: varchar("cedula", { length: 50 }),
  nombre: varchar("nombre", { length: 255 }).notNull(),
  apellidos: varchar("apellidos", { length: 255 }).notNull(),
  puesto: varchar("puesto", { length: 100 }).notNull(),
  salarioBase: decimal("salarioBase", { precision: 12, scale: 2 }).notNull(),
  tipoSalario: mysqlEnum("tipoSalario", ["quincenal", "mensual", "hora"]).default("quincenal").notNull(),
  fechaIngreso: varchar("fechaIngreso", { length: 20 }).notNull(),
  telefono: varchar("telefono", { length: 50 }),
  correo: varchar("correo", { length: 255 }),
  cuentaBancaria: varchar("cuentaBancaria", { length: 100 }),
  banco: varchar("banco", { length: 50 }),
  estado: mysqlEnum("estado", ["activo", "inactivo", "suspendido"]).default("activo").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
});

export type PayrollEmployee = typeof payrollEmployees.$inferSelect;
export type InsertPayrollEmployee = typeof payrollEmployees.$inferInsert;

export const payrollPeriods = mysqlTable("payrollPeriods", {
  id: serial("id").primaryKey(),
  nombre: varchar("nombre", { length: 100 }).notNull(),
  tipo: mysqlEnum("tipo", ["quincenal", "mensual", "semanal"]).default("quincenal").notNull(),
  fechaInicio: varchar("fechaInicio", { length: 20 }).notNull(),
  fechaFin: varchar("fechaFin", { length: 20 }).notNull(),
  estado: mysqlEnum("estado", ["abierto", "cerrado", "procesando"]).default("abierto").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PayrollPeriod = typeof payrollPeriods.$inferSelect;
export type InsertPayrollPeriod = typeof payrollPeriods.$inferInsert;

export const payrollPayments = mysqlTable("payrollPayments", {
  id: serial("id").primaryKey(),
  employeeId: bigint("employeeId", { mode: "number", unsigned: true }).notNull(),
  periodId: bigint("periodId", { mode: "number", unsigned: true }).notNull(),
  salarioBase: decimal("salarioBase", { precision: 12, scale: 2 }).notNull(),
  horasExtra: decimal("horasExtra", { precision: 10, scale: 2 }).default("0"),
  montoHorasExtra: decimal("montoHorasExtra", { precision: 12, scale: 2 }).default("0"),
  comisiones: decimal("comisiones", { precision: 12, scale: 2 }).default("0"),
  aguinaldo: decimal("aguinaldo", { precision: 12, scale: 2 }).default("0"),
  vacaciones: decimal("vacaciones", { precision: 12, scale: 2 }).default("0"),
  totalIngresos: decimal("totalIngresos", { precision: 12, scale: 2 }).notNull(),
  ccss: decimal("ccss", { precision: 12, scale: 2 }).default("0"),
  renta: decimal("renta", { precision: 12, scale: 2 }).default("0"),
  adelantos: decimal("adelantos", { precision: 12, scale: 2 }).default("0"),
  ausencias: decimal("ausencias", { precision: 12, scale: 2 }).default("0"),
  otrasDeducciones: decimal("otrasDeducciones", { precision: 12, scale: 2 }).default("0"),
  totalDeducciones: decimal("totalDeducciones", { precision: 12, scale: 2 }).notNull(),
  netoPagar: decimal("netoPagar", { precision: 12, scale: 2 }).notNull(),
  formaPago: mysqlEnum("formaPago", ["transferencia", "cheque", "efectivo"]).default("transferencia").notNull(),
  estado: mysqlEnum("estado", ["pendiente", "pagado", "anulado"]).default("pendiente").notNull(),
  observaciones: text("observaciones"),
  fechaPago: varchar("fechaPago", { length: 20 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
});

export type PayrollPayment = typeof payrollPayments.$inferSelect;
export type InsertPayrollPayment = typeof payrollPayments.$inferInsert;
