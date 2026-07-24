import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tag, Package, ClipboardList, Printer, Wifi, ScanBarcode,
  Search, CheckSquare, Square, List, Layers, WifiOff,
  AlertCircle, ArrowDownAZ, ArrowUpAZ, ChevronDown, Check,
} from "lucide-react";
import { useState, useRef, useEffect, useMemo } from "react";
import JsBarcode from "jsbarcode";

const BRAND_RED = "#B22234";
const BRAND_BLUE = "#1B3A5C";

type ViewMode = "detallada" | "agrupada" | "offline";

interface LabelItem {
  id: number;
  nombre: string;
  precio: string;
  codigoBarras: string | null;
  cantidad: number;
  printed: boolean;
}

// Get today's date in YYYY-MM-DD using local timezone
function getLocalDateString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Barcode using JsBarcode - generates REAL scannable SVG
function BarcodeCanvas({ code, barcodeHeight }: {
  code: string;
  barcodeWidth?: string;
  barcodeHeight?: string;
  barcodeFontSize?: string;
  barcodeModuleWidth?: string;
  barcodeBarHeight?: string;
}) {
  const h = barcodeHeight || "8mm";

  return (
    <span
      style={{
        fontFamily: '"Libre Barcode 128 Text", "Libre Barcode 128", cursive',
        fontSize: "34pt",
        lineHeight: 0.85,
        whiteSpace: "nowrap",
        display: "inline-block",
        overflow: "hidden",
        height: h,
        verticalAlign: "middle",
      }}
    >
      {"\u00CC" + code + "\u00CE"}
    </span>
  );
}

// Custom Dropdown Component
function CustomDropdown({ label, value, onChange, options, placeholder }: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selected = options.find(o => o.value === value);

  return (
    <div ref={ref} className="relative">
      <Label className="text-sm font-medium mb-1.5 block">{label}</Label>
      <button
        onClick={() => setOpen(!open)}
        className="w-full h-10 border rounded-md px-3 text-sm bg-white flex items-center justify-between text-left"
        style={{ borderColor: "hsl(210 20% 88%)" }}
      >
        <span className={selected ? "text-gray-900" : "text-gray-400"}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-lg max-h-64 overflow-y-auto" style={{ borderColor: "hsl(210 20% 88%)" }}>
          <button
            className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-50 border-b"
            style={{ borderColor: "hsl(210 20% 94%)" }}
            onClick={() => { onChange(""); setOpen(false); }}
          >
            {placeholder}
          </button>
          {options.map((opt) => (
            <button
              key={opt.value}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between ${value === opt.value ? "bg-red-50" : ""}`}
              onClick={() => { onChange(opt.value); setOpen(false); }}
            >
              <span className={value === opt.value ? "font-medium" : ""}>{opt.label}</span>
              {value === opt.value && <Check className="w-4 h-4" style={{ color: BRAND_RED }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Expand items based on quantity
function expandItems(items: LabelItem[], quantities: Record<number, number>, names: Record<number, string>): LabelItem[] {
  const result: LabelItem[] = [];
  for (const item of items) {
    const qty = quantities[item.id] !== undefined ? quantities[item.id] : item.cantidad;
    const name = names[item.id] !== undefined ? names[item.id] : item.nombre;
    for (let i = 0; i < qty; i++) {
      result.push({ ...item, nombre: name });
    }
  }
  return result;
}

export default function LabelsPage() {
  const { data: pallets } = trpc.inventory.pallets.useQuery({ storeId: 1 });
  const { data: adjustments } = trpc.inventory.adjustmentsWithStats.useQuery({ storeId: 1 });
  const { data: palletsWithStats } = trpc.inventory.palletsWithStats.useQuery({ storeId: 1 });
  const utils = trpc.useUtils();

  const [selectedPallet, setSelectedPallet] = useState<string>("");
  const [selectedAdjustment, setSelectedAdjustment] = useState<string>("");
  const [viewMode, setViewMode] = useState<ViewMode>("detallada");
  const [search, setSearch] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<Set<number>>(new Set());
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [labelSize, setLabelSize] = useState("50x25");
  const [showPrice, setShowPrice] = useState("si");
  const [sortAsc, setSortAsc] = useState(true);
  // Editable quantities and names per product
  const [labelQuantities, setLabelQuantities] = useState<Record<number, number>>({});
  const [labelNames, setLabelNames] = useState<Record<number, string>>({});

  const palletIdNum = selectedPallet ? Number(selectedPallet) : null;
  const adjustmentIdNum = selectedAdjustment ? Number(selectedAdjustment) : null;

  const { data: palletProducts, isLoading: loadingPallet } = trpc.inventory.productsForLabels.useQuery(
    { storeId: 1, palletId: palletIdNum! },
    { enabled: !!palletIdNum }
  );
  const { data: adjustmentProducts, isLoading: loadingAdj } = trpc.inventory.adjustmentItemsForLabels.useQuery(
    { storeId: 1, adjustmentId: adjustmentIdNum! },
    { enabled: !!adjustmentIdNum }
  );

  const products = adjustmentIdNum ? adjustmentProducts : palletProducts;
  const isLoading = adjustmentIdNum ? loadingAdj : loadingPallet;

  const markPrinted = trpc.inventory.markLabelsPrinted.useMutation({
    onSuccess: () => utils.inventory.productsForLabels.invalidate(),
  });

  // Load label configuration from DB
  const { data: labelCfg } = trpc.labelConfig.get.useQuery({ storeId: 1 });

  const toggleProduct = (id: number) => {
    setSelectedProducts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectRange = () => {
    const start = Number(rangeStart);
    const end = Number(rangeEnd);
    if (!start || !end || !filtered) return;
    const toSelect = filtered.slice(start - 1, end).map(p => p.id);
    setSelectedProducts(prev => {
      const next = new Set(prev);
      toSelect.forEach(id => next.add(id));
      return next;
    });
  };

  const handleDeselectRange = () => {
    const start = Number(rangeStart);
    const end = Number(rangeEnd);
    if (!start || !end || !filtered) return;
    const toDeselect = filtered.slice(start - 1, end).map(p => p.id);
    setSelectedProducts(prev => {
      const next = new Set(prev);
      toDeselect.forEach(id => next.delete(id));
      return next;
    });
  };

  const handlePrint = () => {
    if (selectedProducts.size === 0) return;
    const targetId = adjustmentIdNum || palletIdNum;
    if (!targetId) return;
    markPrinted.mutate({ storeId: 1, palletId: targetId, productIds: Array.from(selectedProducts) });
    window.print();
  };

  const filtered = products?.filter(p =>
    p.nombre.toLowerCase().includes(search.toLowerCase()) ||
    (p.codigoBarras && p.codigoBarras.includes(search))
  ) || [];

  const sorted = [...filtered].sort((a, b) =>
    sortAsc ? a.nombre.localeCompare(b.nombre) : b.nombre.localeCompare(a.nombre)
  );

  // Selected items expanded by quantity
  const selectedItemsList = sorted.filter(p => selectedProducts.has(p.id));
  const expandedItems = expandItems(selectedItemsList, labelQuantities, labelNames);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" style={{ color: "hsl(207 55% 15%)" }}>
          <Tag className="w-6 h-6" style={{ color: BRAND_RED }} />
          Imprimir Etiquetas
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* LEFT PANEL */}
        <div className="lg:col-span-2 space-y-4">
          {/* Seleccionar Origen */}
          <Card className="border shadow-sm">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: "hsl(207 55% 15%)" }}>
                <Tag className="w-4 h-4" style={{ color: BRAND_RED }} />
                Seleccionar Origen
              </h3>

              {/* Contenedor */}
              <div className="mb-4">
                <CustomDropdown
                  label="Contenedor"
                  value={selectedPallet}
                  onChange={(val) => { setSelectedPallet(val); setSelectedAdjustment(""); setSelectedProducts(new Set()); setLabelQuantities({}); setLabelNames({}); }}
                  placeholder="Seleccione un contenedor"
                  options={(palletsWithStats || []).map(p => ({
                    value: String(p.id),
                    label: `${p.palletId} - ${p.description} (${p.articulos} art, ${p.unidades} un)`,
                  }))}
                />
              </div>

              {/* O Ajuste */}
              <div>
                <CustomDropdown
                  label="O Ajuste"
                  value={selectedAdjustment}
                  onChange={(val) => { setSelectedAdjustment(val); setSelectedPallet(""); setSelectedProducts(new Set()); setLabelQuantities({}); setLabelNames({}); }}
                  placeholder="Seleccione un ajuste (opcional)"
                  options={(adjustments || []).map(a => ({
                    value: String(a.id),
                    label: `${a.adjustmentId} (${a.productCount} prod, ${a.unitCount} un) - ${a.estado === "activo" ? "Activo" : a.estado === "completado" ? "Completado" : "Cancelado"}`,
                  }))}
                />
              </div>
            </CardContent>
          </Card>

          {/* Configuracion de Etiqueta */}
          <Card className="border shadow-sm">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: "hsl(207 55% 15%)" }}>
                <Tag className="w-4 h-4" style={{ color: "#DC2626" }} />
                Configuracion de Etiqueta
              </h3>

              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium mb-1.5 block">Tamano de Etiqueta</Label>
                  <select className="w-full h-10 border rounded-md px-3 text-sm bg-white" style={{ borderColor: "hsl(210 20% 88%)" }} value={labelSize} onChange={(e) => setLabelSize(e.target.value)}>
                    <option value="50x25">50 x 25 mm (2x1) - Zebra ZD411</option>
                    <option value="38x25">38 x 25 mm - Zebra ZD410</option>
                    <option value="57x32">57 x 32 mm - Generica</option>
                  </select>
                </div>

                <div>
                  <Label className="text-sm font-medium mb-1.5 block">Mostrar Precio</Label>
                  <select className="w-full h-10 border rounded-md px-3 text-sm bg-white" style={{ borderColor: "hsl(210 20% 88%)" }} value={showPrice} onChange={(e) => setShowPrice(e.target.value)}>
                    <option value="si">Si</option>
                    <option value="no">No</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT PANEL */}
        <div className="lg:col-span-3">
          <Card className="border shadow-sm">
            <CardContent className="p-5">
              {/* Header with tabs */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: "hsl(207 55% 15%)" }}>
                  <List className="w-4 h-4" style={{ color: BRAND_RED }} />
                  Articulos a Imprimir
                </h3>
                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                  <button className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === "detallada" ? "bg-white shadow-sm" : "text-gray-500 hover:text-gray-700"}`} onClick={() => setViewMode("detallada")}><List className="w-3.5 h-3.5 inline mr-1" />Detallada</button>
                  <button className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === "agrupada" ? "bg-white shadow-sm" : "text-gray-500 hover:text-gray-700"}`} onClick={() => setViewMode("agrupada")}><Layers className="w-3.5 h-3.5 inline mr-1" />Agrupada</button>
                  <button className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === "offline" ? "bg-white shadow-sm" : "text-gray-500 hover:text-gray-700"}`} onClick={() => setViewMode("offline")}><WifiOff className="w-3.5 h-3.5 inline mr-1" />Sin conexion</button>
                </div>
              </div>

              {/* Search */}
              <div className="flex items-center gap-2 mb-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "hsl(207 20% 60%)" }} />
                  <Input placeholder="Buscar articulo por nombre..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 h-10" />
                </div>
                <Button variant="outline" size="sm" className="h-10" onClick={() => setSortAsc(!sortAsc)}>
                  {sortAsc ? <ArrowDownAZ className="w-4 h-4" /> : <ArrowUpAZ className="w-4 h-4" />}
                </Button>
              </div>

              {/* Range selector */}
              <div className="flex items-center gap-2 mb-3 p-3 rounded-lg border" style={{ background: "hsl(0 0% 98%)", borderColor: "hsl(210 20% 92%)" }}>
                <span className="text-xs font-medium" style={{ color: "hsl(207 20% 45%)" }}><List className="w-3.5 h-3.5 inline mr-1" />Seleccionar Rango</span>
                <Input placeholder="Desd" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} className="h-8 w-16 text-center text-sm" />
                <span className="text-xs" style={{ color: "hsl(207 20% 55%)" }}>a</span>
                <Input placeholder="Hast" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} className="h-8 w-16 text-center text-sm" />
                <Button size="sm" className="h-8 text-xs font-medium" style={{ background: BRAND_RED }} onClick={handleSelectRange}><CheckSquare className="w-3.5 h-3.5 mr-1" />Seleccionar</Button>
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleDeselectRange}><Square className="w-3.5 h-3.5 mr-1" />Deseleccionar</Button>
              </div>

              {/* Info del ajuste/contenedor seleccionado */}
              {(selectedPallet || selectedAdjustment) && (
                <div className="mb-3 p-3 rounded-lg border flex items-center gap-3" style={{ background: "rgba(178,34,52,0.04)", borderColor: "rgba(178,34,52,0.12)" }}>
                  <Tag className="w-4 h-4" style={{ color: BRAND_RED }} />
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "hsl(207 55% 15%)" }}>
                      {selectedAdjustment && adjustments?.find(a => String(a.id) === selectedAdjustment)
                        ? `${adjustments.find(a => String(a.id) === selectedAdjustment)!.adjustmentId} - ${adjustments.find(a => String(a.id) === selectedAdjustment)!.fecha}`
                        : selectedPallet && palletsWithStats?.find(p => String(p.id) === selectedPallet)
                        ? `${palletsWithStats.find(p => String(p.id) === selectedPallet)!.palletId} - ${palletsWithStats.find(p => String(p.id) === selectedPallet)!.description}`
                        : "..."}
                    </p>
                    <p className="text-xs" style={{ color: "hsl(207 20% 55%)" }}>{sorted.length} articulo{sorted.length !== 1 ? "s" : ""}</p>
                  </div>
                </div>
              )}

              {/* Products TABLE */}
              <div className="min-h-[300px] max-h-[500px] overflow-y-auto border rounded-lg" style={{ borderColor: "hsl(210 20% 92%)" }}>
                {!selectedPallet && !selectedAdjustment ? (
                  <div className="flex flex-col items-center justify-center h-64">
                    <Wifi className="w-12 h-12 mb-3 opacity-20" />
                    <p className="text-sm" style={{ color: "hsl(207 20% 55%)" }}>Seleccione un contenedor o ajuste para ver sus articulos</p>
                  </div>
                ) : isLoading ? (
                  <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: BRAND_RED }} />
                  </div>
                ) : sorted.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64">
                    <Tag className="w-10 h-10 mb-3 opacity-30" />
                    <p className="text-sm" style={{ color: "hsl(207 20% 55%)" }}>No hay articulos</p>
                  </div>
                ) : (
                  <table className="w-full">
                    <thead style={{ background: "hsl(0 0% 98%)" }}>
                      <tr className="border-b" style={{ borderColor: "hsl(210 20% 94%)" }}>
                        <th className="px-3 py-2 w-8"></th>
                        <th className="px-2 py-2 text-[10px] font-semibold uppercase text-left" style={{ color: BRAND_BLUE }}>N°</th>
                        <th className="px-2 py-2 text-[10px] font-semibold uppercase text-left" style={{ color: BRAND_BLUE }}>Cod. Barra</th>
                        <th className="px-2 py-2 text-[10px] font-semibold uppercase text-left" style={{ color: BRAND_BLUE }}>Nombre para Etiqueta</th>
                        <th className="px-2 py-2 text-[10px] font-semibold uppercase text-center w-20" style={{ color: BRAND_BLUE }}>Cant. Etiq.</th>
                        <th className="px-2 py-2 text-[10px] font-semibold uppercase text-right" style={{ color: BRAND_BLUE }}>Precio</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: "hsl(210 20% 94%)" }}>
                      {sorted.map((product, idx) => (
                        <tr key={product.id} className={`transition-colors hover:bg-gray-50 ${selectedProducts.has(product.id) ? "bg-red-50" : ""}`}>
                          {/* Checkbox */}
                          <td className="px-3 py-2">
                            <button onClick={() => toggleProduct(product.id)} className={`w-5 h-5 rounded border-2 flex items-center justify-center ${selectedProducts.has(product.id) ? "border-transparent" : "border-gray-300"}`} style={selectedProducts.has(product.id) ? { background: BRAND_RED } : {}}>
                              {selectedProducts.has(product.id) && <CheckSquare className="w-3.5 h-3.5 text-white" />}
                            </button>
                          </td>
                          {/* N° */}
                          <td className="px-2 py-2 text-xs font-mono" style={{ color: "hsl(207 20% 55%)" }}>{idx + 1}</td>
                          {/* Cod. Barra */}
                          <td className="px-2 py-2 text-xs font-mono" style={{ color: "hsl(207 20% 55%)" }}>{product.codigoBarras || "-"}</td>
                          {/* Nombre editable */}
                          <td className="px-2 py-2">
                            <input type="text" className="w-full text-sm border rounded px-2 py-1 focus:outline-none focus:ring-1" style={{ borderColor: "hsl(210 20% 88%)", color: "hsl(207 55% 15%)" }} value={labelNames[product.id] !== undefined ? labelNames[product.id] : product.nombre} onChange={(e) => setLabelNames(prev => ({ ...prev, [product.id]: e.target.value }))} />
                          </td>
                          {/* Cant. Etiq. editable */}
                          <td className="px-2 py-2">
                            <input type="number" min={0} className="w-full text-sm text-center border rounded px-1 py-1 focus:outline-none focus:ring-1 font-semibold" style={{ borderColor: "hsl(210 20% 88%)", color: BRAND_RED }} value={labelQuantities[product.id] !== undefined ? labelQuantities[product.id] : product.cantidad} onChange={(e) => { const val = Number(e.target.value); setLabelQuantities(prev => ({ ...prev, [product.id]: val })); if (val > 0) { setSelectedProducts(prev => { const n = new Set(prev); n.add(product.id); return n; }); } }} />
                          </td>
                          {/* Precio */}
                          <td className="px-2 py-2 text-sm font-bold text-right" style={{ color: BRAND_RED }}>
                            ₡{Number(product.precio).toLocaleString("es-CR")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Selected count */}
              {selectedProducts.size > 0 && (
                <p className="text-xs mt-2 font-medium" style={{ color: "hsl(207 20% 55%)" }}>
                  {selectedProducts.size} articulo{selectedProducts.size !== 1 ? "s" : ""} seleccionado{selectedProducts.size !== 1 ? "s" : ""}
                  {(() => { let t = 0; selectedProducts.forEach(id => { const p = sorted.find(x => x.id === id); if (p) t += labelQuantities[id] !== undefined ? labelQuantities[id] : p.cantidad; }); return ` — ${t} etiqueta${t !== 1 ? "s" : ""} en total`; })()}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-3">
              <Button className="flex-1 h-11 font-medium transition-all hover:shadow-lg" style={{ background: "#16A34A" }} onClick={handlePrint} disabled={selectedProducts.size === 0}>
                <Printer className="w-4 h-4 mr-2" />Imprimir Etiquetas
              </Button>
              <Button className="flex-1 h-11 font-medium transition-all hover:shadow-lg" style={{ background: "#7C3AED" }} disabled={selectedProducts.size === 0}>
                <Wifi className="w-4 h-4 mr-2" />Conectar Zebra ZD411
              </Button>
              <Button className="flex-1 h-11 font-medium transition-all hover:shadow-lg" style={{ background: "#16A34A" }} disabled={selectedProducts.size === 0}>
                <ScanBarcode className="w-4 h-4 mr-2" />QUPOS
              </Button>
            </div>

            <div className="p-4 rounded-lg border text-xs space-y-2" style={{ background: "hsl(0 0% 98%)", borderColor: "hsl(210 20% 92%)" }}>
              <p style={{ color: "hsl(207 20% 45%)" }}><AlertCircle className="w-3.5 h-3.5 inline mr-1" style={{ color: "#B45309" }} /><strong style={{ color: "#B45309" }}>Imprimir Etiquetas:</strong> Abre la ventana de impresion del sistema. Selecciona tu Zebra ZD411 y listo! Funciona siempre.</p>
              <p style={{ color: "hsl(207 20% 45%)" }}><strong>Conectar Zebra ZD411:</strong> Solo para Chrome/Edge. Si da error "Access denied", usa "Imprimir Etiquetas".</p>
              <p style={{ color: "hsl(207 20% 45%)" }}>Para exportar a QUPOS, ve a la seccion Contenedores y usa el boton verde en cada contenedor.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden print area - each label is a direct child of .print-only */}
      <div className="print-only">
        {expandedItems.map((item, idx) => (
          <div
            key={idx}
            style={{
              width: labelCfg?.labelWidth || "50mm",
              height: labelCfg?.labelHeight || "25mm",
              padding: 0,
              position: "relative",
              pageBreakInside: "avoid",
              background: "white",
              boxSizing: "border-box",
              fontFamily: "Arial Narrow, Arial, Helvetica, sans-serif",
            }}
          >
              {/* Name - absolute position */}
              <div style={{
                position: "absolute",
                top: labelCfg?.nameTop ?? "0.3mm",
                left: "1mm", right: "1mm",
                fontSize: labelCfg?.nameFontSize ?? "8pt",
                fontWeight: labelCfg?.nameFontWeight ?? "bold",
                fontFamily: labelCfg?.nameFontFamily ?? "Arial Narrow",
                color: "#000",
                textTransform: "uppercase",
                letterSpacing: "0.2px", lineHeight: 1.3,
                textAlign: (labelCfg?.nameTextAlign || "center") as any,
                whiteSpace: "nowrap", overflow: "hidden",
              }}>{item.nombre.toUpperCase()}</div>

              {/* Price - absolute position */}
              {(labelCfg?.showPrice ?? true) && (
                <div style={{
                  position: "absolute",
                  top: labelCfg?.priceTop || "6mm",
                  left: "1mm", right: "1mm",
                  display: "flex", alignItems: "baseline",
                  justifyContent: (labelCfg?.priceTextAlign || "center") === "left" ? "flex-start" : (labelCfg?.priceTextAlign || "center") === "right" ? "flex-end" : "center",
                  gap: "1.5mm",
                }}>
                  <span style={{ fontSize: labelCfg?.priceFontSize || "26pt", fontWeight: labelCfg?.priceFontWeight || "bold", fontFamily: labelCfg?.priceFontFamily || "Arial Narrow", color: "#000", letterSpacing: "0.5px", lineHeight: 1 }}>
                    {Math.round(Number(item.precio))}
                  </span>
                  {(labelCfg?.showIva ?? true) && (
                    <span style={{ fontSize: labelCfg?.ivaFontSize || "9pt", fontWeight: "bold", color: "#000" }}>IVA</span>
                  )}
                </div>
              )}

              {/* Barcode - absolute position */}
              {(labelCfg?.showBarcode ?? true) && item.codigoBarras && (
                <div style={{
                  position: "absolute",
                  top: labelCfg?.barcodeTop || "11mm",
                  left: "1mm", right: "1mm",
                  textAlign: (labelCfg?.barcodeAlign || "center") as any,
                }}>
                  <BarcodeCanvas
                    code={item.codigoBarras}
                    barcodeWidth={labelCfg?.barcodeWidth}
                    barcodeHeight={labelCfg?.barcodeHeight}
                  />
                </div>
              )}

              {/* Barcode Number - absolute position */}
              {(labelCfg?.showBarcodeNumber ?? true) && item.codigoBarras && (
                <div style={{
                  position: "absolute",
                  top: labelCfg?.barcodeNumberTop || "17.5mm",
                  left: "1mm", right: "1mm",
                  fontSize: labelCfg?.barcodeNumberFontSize || "10pt",
                  fontWeight: labelCfg?.barcodeNumberFontWeight || "bold",
                  color: "#000",
                  letterSpacing: labelCfg?.barcodeNumberLetterSpacing || "4px",
                  fontFamily: labelCfg?.barcodeNumberFontFamily || "Courier New",
                  textAlign: (labelCfg?.barcodeNumberAlign || "center") as any,
                  whiteSpace: "nowrap",
                }}>{item.codigoBarras}</div>
              )}

              {/* Footer - absolute position */}
              {(labelCfg?.showFooter ?? true) && (
                <div style={{
                  position: "absolute",
                  top: labelCfg?.footerTop || "20.5mm",
                  left: "1mm", right: "1mm",
                  fontSize: labelCfg?.footerFontSize || "6pt",
                  color: "#000",
                  letterSpacing: "0.2px",
                  fontFamily: labelCfg?.footerFontFamily || "Arial Narrow",
                  textAlign: (labelCfg?.footerTextAlign || "center") as any,
                  whiteSpace: "nowrap",
                }}>
                  {(labelCfg?.showDate ?? true) ? `${getLocalDateString()} - ` : ""}
                  {labelCfg?.footerText || "American Outlet Los Chiles"}
                </div>
              )}
            </div>
          ))}
      </div>

      <style>{`
        @font-face {
          font-family: 'Libre Barcode 128 Text';
          src: url('/fonts/LibreBarcode128Text.ttf') format('truetype');
          font-weight: normal;
          font-style: normal;
        }
        @media screen { .print-only { display: none !important; } }
        @media print {
          @page { size: 50mm 25mm; margin: 0; }
          @font-face {
            font-family: 'Libre Barcode 128 Text';
            src: url('/fonts/LibreBarcode128Text.ttf') format('truetype');
            font-weight: normal;
            font-style: normal;
          }
          html, body { margin: 0; padding: 0; background: white; }
          .print-only {
            display: block !important;
            width: 50mm !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .print-only > div {
            width: 50mm !important;
            height: 25mm !important;
            page-break-after: always !important;
            break-after: page !important;
            position: relative !important;
            overflow: hidden !important;
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
            box-sizing: border-box !important;
          }
          .print-only > div:last-child {
            page-break-after: auto !important;
          }
        }
      `}</style>
    </div>
  );
}
