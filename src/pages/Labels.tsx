import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tag, Package, ClipboardList, Printer, Wifi, ScanBarcode,
  Search, CheckSquare, Square, List, Layers, WifiOff, Barcode,
  AlertCircle, ArrowDownAZ, ArrowUpAZ, ChevronDown, Check,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";

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

// Complete Code 128 barcode patterns (bar=1, space=0)
// Each pattern is 11 modules (3 bars + 3 spaces)
const CODE128: Record<number, string> = {
  0: "11011001100", 1: "11001101100", 2: "11001100110", 3: "10010011000", 4: "10010001100",
  5: "10001001100", 6: "10011001000", 7: "10011000100", 8: "10001100100", 9: "11001001000",
  10: "11001000100", 11: "11000100100", 12: "10110011100", 13: "10011011100", 14: "10011001110",
  15: "10111001100", 16: "10011101100", 17: "10011100110", 18: "11001110010", 19: "11001011100",
  20: "11001001110", 21: "11011100100", 22: "11001110100", 23: "11101101110", 24: "11101001100",
  25: "11100101100", 26: "11100100110", 27: "11101100100", 28: "11100110100", 29: "11100110010",
  30: "11011011000", 31: "11011000110", 32: "11000110110", 33: "10100011000", 34: "10001011000",
  35: "10001000110", 36: "10110001000", 37: "10001101000", 38: "10001100010", 39: "11010001000",
  40: "11000101000", 41: "11000100010", 42: "10110111000", 43: "10110001110", 44: "10001101110",
  45: "10111011000", 46: "10111000110", 47: "10001110110", 48: "11101110110", 49: "11010001110",
  50: "11000101110", 51: "11011101000", 52: "11011100010", 53: "11011101110", 54: "11101011000",
  55: "11101000110", 56: "11100010110", 57: "11101101000", 58: "11101100010", 59: "11100011010",
  60: "11101111010", 61: "11001000010", 62: "11110001010", 63: "10100110000",
  64: "10100001100", 65: "10010110000", 66: "10010000110", 67: "10000101100", 68: "10000100110",
  69: "10110010000", 70: "10110000100", 71: "10011010000", 72: "10011000010", 73: "10000110100",
  74: "10000110010", 75: "11000010010", 76: "11001010000", 77: "11110111010", 78: "11000010100",
  79: "10001111010", 80: "10100111100", 81: "10010111100", 82: "10010011110", 83: "10111100100",
  84: "10011110100", 85: "10011110010", 86: "11110100100", 87: "11110010100", 88: "11110010010",
  89: "11011011110", 90: "11011110110", 91: "11110110110", 92: "10101111000", 93: "10100011110",
  94: "10001011110", 95: "10111101000", 96: "10111100010", 97: "11110101000", 98: "11110100010",
  99: "10111011110", 100: "10111101110", 101: "11101011110", 102: "11110101110",
  103: "11010000100", 104: "11010010000", 105: "11010011100", 106: "11000111010",
};

// Generate Code 128 barcode SVG
function BarcodeSVG({ code }: { code: string }) {
  // Clean code: keep only digits for Code C encoding
  const digits = code.replace(/\D/g, "");
  if (digits.length < 2) return <div className="label-barcode-number">{code}</div>;

  // Pad with leading zero if odd number of digits
  const padded = digits.length % 2 === 1 ? "0" + digits : digits;

  // Build Code 128C encoded data
  const values: number[] = [];

  // Start C = 105
  values.push(105);

  // Encode digits in pairs using Code C
  for (let i = 0; i < padded.length; i += 2) {
    const pair = parseInt(padded.substring(i, i + 2), 10);
    values.push(pair);
  }

  // Calculate checksum (mod 103)
  let sum = values[0]; // Start code value
  for (let i = 1; i < values.length; i++) {
    sum += values[i] * i;
  }
  const checksum = sum % 103;
  values.push(checksum);

  // Stop pattern = 106
  values.push(106);

  // Render as SVG
  const bars: JSX.Element[] = [];
  let x = 0;
  const narrowWidth = 0.33; // mm per narrow module
  const height = 5; // mm

  // Quiet zone (10 modules white space at start)
  x += 10 * narrowWidth;

  for (let i = 0; i < values.length; i++) {
    const pattern = CODE128[values[i]] || "";
    let isBar = true; // Code 128 patterns start with bar
    for (let j = 0; j < pattern.length; j++) {
      const width = pattern[j] === "1" ? narrowWidth : narrowWidth;
      if (isBar && pattern[j] === "1") {
        bars.push(<rect key={`${i}-${j}`} x={x} y={0} width={narrowWidth * 1.5} height={height} fill="#000" />);
      }
      x += narrowWidth;
      isBar = !isBar;
    }
  }

  // Quiet zone at end
  x += 10 * narrowWidth;

  return (
    <svg className="label-barcode" viewBox={`0 0 ${x} ${height}`} preserveAspectRatio="xMidYMid meet" style={{ width: "40mm", height: "4.5mm" }}>
      {bars}
    </svg>
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

      {/* Hidden print area */}
      <div className="print-only">
        <div className="label-sheet">
          {expandedItems.map((item, idx) => (
            <div key={idx} className="aolc-label">
              <div className="label-product-name">{item.nombre.toUpperCase()}</div>
              <div className="label-price-row">
                <span className="label-price">{Number(item.precio).toLocaleString("es-CR")}</span>
                <span className="label-iva">IVA</span>
              </div>
              {item.codigoBarras && (
                <>
                  <BarcodeSVG code={item.codigoBarras} />
                  <div className="label-barcode-number">{item.codigoBarras}</div>
                </>
              )}
              <div className="label-footer">{getLocalDateString()} - American Outlet Los Chiles</div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @media screen { .print-only { display: none !important; } }
        @media print {
          @page { size: auto; margin: 0; }
          body * { visibility: hidden; }
          .print-only, .print-only * { visibility: visible; }
          .print-only { display: block !important; position: absolute; left: 0; top: 0; width: 100%; }
          .label-sheet { display: flex; flex-direction: column; gap: 0; }
          .aolc-label {
            width: 50mm;
            height: 25mm;
            padding: 1.5mm 2mm;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: flex-start;
            text-align: center;
            page-break-inside: avoid;
            background: white;
            box-sizing: border-box;
            font-family: "Arial Narrow", Arial, Helvetica, sans-serif;
            overflow: hidden;
            border: none;
          }
          .label-product-name {
            font-size: 5.5pt;
            font-weight: bold;
            color: #000;
            text-transform: uppercase;
            letter-spacing: 0.2px;
            line-height: 1.1;
            max-height: 5mm;
            overflow: hidden;
            width: 100%;
            margin-bottom: 0.5mm;
          }
          .label-price-row {
            display: flex;
            align-items: baseline;
            justify-content: center;
            gap: 1.5mm;
            margin: 0.5mm 0;
          }
          .label-price {
            font-size: 18pt;
            font-weight: bold;
            color: #000;
            letter-spacing: 0.5px;
            line-height: 1;
          }
          .label-iva {
            font-size: 7pt;
            font-weight: bold;
            color: #000;
          }
          .label-barcode {
            margin-top: 0.8mm;
            display: flex;
            justify-content: center;
            align-items: center;
          }
          .label-barcode-number {
            font-size: 6.5pt;
            color: #000;
            letter-spacing: 2px;
            font-family: "Courier New", Courier, monospace;
            margin-top: 0.2mm;
          }
          .label-footer {
            font-size: 4.5pt;
            color: #000;
            margin-top: 0.8mm;
            letter-spacing: 0.1px;
            font-family: "Arial Narrow", Arial, sans-serif;
          }
        }
      `}</style>
    </div>
  );
}
