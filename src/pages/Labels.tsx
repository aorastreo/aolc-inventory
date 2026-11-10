import { trpc } from "@/providers/trpc";
import { useActiveStore } from "@/hooks/useActiveStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tag, Printer, Search, CheckSquare, Square, List, Layers,
  AlertCircle, ChevronDown, Check, Link as LinkIcon,
} from "lucide-react";
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import {
  mergeLabelConfig,
  buildLabelHtml,
  buildPrintDocumentHtml,
  buildPrintParts,
  generateBarcodeSVG,
  getLocalDateString,
} from "@/lib/label-template";

const BRAND_RED = "#B22234";
const BRAND_BLUE = "#1B3A5C";

type ViewMode = "detallada" | "agrupada";
type PrintFilter = "todos" | "pendientes" | "impresos";

interface LabelItem {
  id: number;
  nombre: string;
  precio: string;
  codigoBarras: string | null;
  cantidad: number;
  printed: boolean;
}

const LABEL_SIZES: Record<string, { w: string; h: string; label: string }> = {
  "50x25": { w: "50mm", h: "25mm", label: "50 x 25 mm · 2 x 1 pulgadas — Zebra ZD411" },
  "38x25": { w: "38mm", h: "25mm", label: "38 x 25 mm · ~1.5 x 1 pulgadas — Zebra ZD411" },
  "57x32": { w: "57mm", h: "32mm", label: "57 x 32 mm · ~2.25 x 1.25 pulgadas — Generica" },
};

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
        type="button"
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
            type="button"
            className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-50 border-b"
            style={{ borderColor: "hsl(210 20% 94%)" }}
            onClick={() => { onChange(""); setOpen(false); }}
          >
            {placeholder}
          </button>
          {options.map((opt) => (
            <button
              type="button"
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

function expandItems(items: LabelItem[], quantities: Record<number, number>, names: Record<number, string>): LabelItem[] {
  const result: LabelItem[] = [];
  for (const item of items) {
    const qty = quantities[item.id] !== undefined ? quantities[item.id] : item.cantidad;
    const name = names[item.id] !== undefined ? names[item.id] : item.nombre;
    for (let i = 0; i < Math.max(0, qty); i++) {
      result.push({ ...item, nombre: name, cantidad: 1 });
    }
  }
  return result;
}

/** ZPL for Zebra ZD411 (203 dpi). Sizes in mm → dots. */
function buildZplBatch(
  items: LabelItem[],
  opts: { widthMm: number; heightMm: number; showPrice: boolean; footer: string; showDate: boolean; rotation?: number },
): string {
  const dpi = 203;
  const pw = Math.round((opts.widthMm / 25.4) * dpi);
  const ll = Math.round((opts.heightMm / 25.4) * dpi);
  const clean = (s: string) => s.replace(/[\^~\r\n]/g, " ").slice(0, 40);
  // ^PON normal, ^POI invert 180; for 90/270 use field orientation ^FWR / ^FWB
  const rot = Number(opts.rotation) || 0;
  const po = rot === 180 ? "^POI" : "^PON";
  const fw = rot === 90 ? "^FWR" : rot === 270 ? "^FWB" : "^FWN";
  const parts: string[] = [];
  for (const item of items) {
    const name = clean(item.nombre.toUpperCase());
    const price = String(Math.round(Number(item.precio) || 0));
    const code = (item.codigoBarras || "").replace(/[^\w-]/g, "");
    const footer = clean(
      `${opts.showDate ? getLocalDateString() + " - " : ""}${opts.footer}`,
    );
    parts.push(`^XA
${po}
${fw}
^PW${pw}
^LL${ll}
^LH0,0
^FO16,8^A0N,22,22^FD${name}^FS
${opts.showPrice ? `^FO16,36^A0N,56,56^FD${price}^FS^FO${Math.min(pw - 70, 200)},48^A0N,28,28^FDIVA^FS` : ""}
${code ? `^FO16,100^BY2^BCN,55,N,N,N^FD${code}^FS^FO16,160^A0N,20,20^FD${code}^FS` : ""}
^FO16,${ll - 28}^A0N,16,16^FD${footer}^FS
^XZ`);
  }
  return parts.join("\n");
}

async function tryZebraBrowserPrint(zpl: string): Promise<{ ok: boolean; message: string }> {
  // Official Zebra Browser Print local service (if installed on the PC)
  const endpoints = [
    "http://127.0.0.1:9100/write",
    "http://localhost:9100/write",
  ];
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: zpl,
      });
      if (res.ok || res.status === 200) {
        return { ok: true, message: "Enviado a Zebra Browser Print (ZD411)." };
      }
    } catch {
      // service not running
    }
  }

  // Legacy BrowserPrint JS global, if the SDK script is present
  const bp = (window as any).BrowserPrint;
  if (bp?.getDefaultDevice) {
    try {
      await new Promise<void>((resolve, reject) => {
        bp.getDefaultDevice("printer", (device: any) => {
          if (!device) return reject(new Error("No hay impresora Zebra por defecto"));
          device.send(zpl, resolve, (err: any) => reject(err || new Error("Error Zebra")));
        }, reject);
      });
      return { ok: true, message: "Enviado a la Zebra ZD411 via Browser Print." };
    } catch (e: any) {
      return { ok: false, message: e?.message || "Browser Print fallo" };
    }
  }

  return {
    ok: false,
    message:
      "No se detecto Zebra Browser Print en este PC. Se usara el dialogo de impresion: elige Zebra ZD411, papel 50x25, sin margenes.",
  };
}

export default function LabelsPage() {
  const { storeId } = useActiveStore();
  const { data: adjustments } = trpc.inventory.adjustmentsWithStats.useQuery({ storeId });
  const { data: palletsWithStats } = trpc.inventory.palletsWithStats.useQuery({ storeId });
  const utils = trpc.useUtils();

  const [selectedPallet, setSelectedPallet] = useState<string>("");
  const [selectedAdjustment, setSelectedAdjustment] = useState<string>("");
  const [viewMode, setViewMode] = useState<ViewMode>("detallada");
  const [printFilter, setPrintFilter] = useState<PrintFilter>("todos");
  const [search, setSearch] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<Set<number>>(new Set());
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [labelSize, setLabelSize] = useState("50x25");
  const [showPrice, setShowPrice] = useState("si");
  const [labelQuantities, setLabelQuantities] = useState<Record<number, number>>({});
  const [labelNames, setLabelNames] = useState<Record<number, string>>({});
  const [printNote, setPrintNote] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  /** Full-screen print desk — window.print() from a real button click (Chrome-safe). */
  const [printSession, setPrintSession] = useState<{
    bodyHtml: string;
    css: string;
    pageW: string;
    pageH: string;
    fullDoc: string;
    zpl: string;
    productIds: number[];
    copies: number;
  } | null>(null);

  const palletIdNum = selectedPallet ? Number(selectedPallet) : null;
  const adjustmentIdNum = selectedAdjustment ? Number(selectedAdjustment) : null;
  const sourceType = adjustmentIdNum ? "adjustment" as const : "pallet" as const;
  const refId = adjustmentIdNum || palletIdNum;

  const { data: palletProducts, isLoading: loadingPallet } = trpc.inventory.productsForLabels.useQuery(
    { storeId, palletId: palletIdNum! },
    { enabled: !!palletIdNum },
  );
  const { data: adjustmentProducts, isLoading: loadingAdj } = trpc.inventory.adjustmentItemsForLabels.useQuery(
    { storeId, adjustmentId: adjustmentIdNum! },
    { enabled: !!adjustmentIdNum },
  );

  const products = adjustmentIdNum ? adjustmentProducts : palletProducts;
  const isLoading = adjustmentIdNum ? loadingAdj : loadingPallet;

  const markPrinted = trpc.inventory.markLabelsPrinted.useMutation({
    onSuccess: () => {
      utils.inventory.productsForLabels.invalidate();
      utils.inventory.adjustmentItemsForLabels.invalidate();
    },
    onError: (err) => alert("No se pudo marcar como impresas: " + err.message),
  });

  const unmarkPrinted = trpc.inventory.unmarkLabelPrinted.useMutation({
    onSuccess: () => {
      utils.inventory.productsForLabels.invalidate();
      utils.inventory.adjustmentItemsForLabels.invalidate();
    },
  });

  const { data: labelCfg, refetch: refetchLabelCfg } = trpc.labelConfig.get.useQuery(
    { storeId },
    { refetchOnMount: "always", refetchOnWindowFocus: true, staleTime: 0 },
  );

  // Sync local toggles from saved config (config page is source of truth for layout)
  useEffect(() => {
    if (labelCfg && typeof labelCfg.showPrice === "boolean") {
      setShowPrice(labelCfg.showPrice ? "si" : "no");
    }
    if (labelCfg?.labelWidth && labelCfg?.labelHeight) {
      const key = `${parseInt(String(labelCfg.labelWidth), 10)}x${parseInt(String(labelCfg.labelHeight), 10)}`;
      if (LABEL_SIZES[key]) setLabelSize(key);
    }
  }, [labelCfg]);

  // After print dialog: ask before marking (cancel in dialog must not auto-mark)
  useEffect(() => {
    const onMsg = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || data.type !== "aolc-labels-printed") return;
      const ids: number[] = Array.isArray(data.productIds) ? data.productIds : [];
      const rId = Number(data.refId);
      const src = data.sourceType === "adjustment" ? "adjustment" : "pallet";
      setPrinting(false);
      if (!ids.length || !rId) return;
      const ok = window.confirm(
        `¿Se imprimieron bien las etiquetas en la Zebra ZD411?\n\nOK = marcar ${ids.length} articulo(s) como impresos.`,
      );
      if (!ok) {
        setPrintNote("No se marco como impresa. Puedes reimprimir cuando quieras.");
        return;
      }
      markPrinted.mutate({
        storeId,
        refId: rId,
        sourceType: src,
        productIds: ids,
        copies: Number(data.copies) || 1,
      });
      setPrintNote("Etiquetas marcadas como impresas.");
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [storeId]);

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
    if (!start || !end || !displayRows.length) return;
    const toSelect = displayRows.slice(start - 1, end).flatMap(p => p.memberIds);
    setSelectedProducts(prev => {
      const next = new Set(prev);
      toSelect.forEach(id => next.add(id));
      return next;
    });
  };

  const handleDeselectRange = () => {
    const start = Number(rangeStart);
    const end = Number(rangeEnd);
    if (!start || !end || !displayRows.length) return;
    const toDeselect = displayRows.slice(start - 1, end).flatMap(p => p.memberIds);
    setSelectedProducts(prev => {
      const next = new Set(prev);
      toDeselect.forEach(id => next.delete(id));
      return next;
    });
  };

  const effectiveShowPrice = showPrice === "si";

  /** Always prefer saved Label Config; size dropdown only overrides when user picks another preset. */
  const buildPrintCfg = (rawCfg: Record<string, unknown> | null | undefined) => {
    const merged = mergeLabelConfig(rawCfg);
    const cfgKey = `${parseInt(String(merged.labelWidth), 10)}x${parseInt(String(merged.labelHeight), 10)}`;
    if (labelSize && labelSize !== cfgKey && LABEL_SIZES[labelSize]) {
      merged.labelWidth = LABEL_SIZES[labelSize].w;
      merged.labelHeight = LABEL_SIZES[labelSize].h;
    }
    merged.showPrice = effectiveShowPrice;
    return merged;
  };

  const printCfg = useMemo(
    () => buildPrintCfg(labelCfg as Record<string, unknown> | null),
    [labelCfg, labelSize, effectiveShowPrice],
  );

  const labelWidth = String(printCfg.labelWidth || "50mm");
  const labelHeight = String(printCfg.labelHeight || "25mm");

  const buildExpandedLabels = (items: LabelItem[], cfg: ReturnType<typeof buildPrintCfg>) => {
    const barcodeH = Math.max(12, Math.round((parseFloat(String(cfg.barcodeHeight)) / 25.4) * 96)) || 30;
    return items.map((item) =>
      buildLabelHtml(
        { nombre: item.nombre, precio: item.precio, codigoBarras: item.codigoBarras },
        cfg,
        {
          barcodeSvg: item.codigoBarras ? generateBarcodeSVG(item.codigoBarras, barcodeH) : "",
          forceShowPrice: effectiveShowPrice,
        },
      ),
    ).join("");
  };

  const openPrintDesk = (
    items: LabelItem[],
    productIds: number[],
    cfg: ReturnType<typeof buildPrintCfg>,
    zpl: string,
  ) => {
    const labelsHtml = buildExpandedLabels(items, cfg);
    const parts = buildPrintParts(labelsHtml, cfg);
    const fullDoc = buildPrintDocumentHtml(labelsHtml, cfg);
    setPrintSession({
      bodyHtml: parts.bodyHtml,
      css: parts.css,
      pageW: parts.pageW,
      pageH: parts.pageH,
      fullDoc,
      zpl,
      productIds,
      copies: items.length,
    });
    setPrintNote("Pantalla de impresion lista. Pulsa el boton verde grande «IMPRIMIR AHORA».");
    setPrinting(false);
  };

  const runMainWindowPrint = useCallback(() => {
    if (!printSession || !refId) return;
    // Main-window print from a real click — Chrome never blocks this
    const onAfter = () => {
      window.removeEventListener("afterprint", onAfter);
      window.postMessage(
        {
          type: "aolc-labels-printed",
          productIds: printSession.productIds,
          refId,
          sourceType,
          copies: printSession.copies,
        },
        window.location.origin,
      );
    };
    window.addEventListener("afterprint", onAfter);
    try {
      window.print();
    } catch {
      window.removeEventListener("afterprint", onAfter);
      setPrintNote("No se pudo abrir el dialogo. Usa «Descargar HTML» y abre el archivo, o «Descargar ZPL».");
    }
  }, [printSession, refId, sourceType]);

  const downloadBlob = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };

  const handlePrint = (preferZebraDirect: boolean) => {
    if (selectedProducts.size === 0 || !refId) {
      setPrintNote("Selecciona al menos un articulo (checkbox) antes de imprimir.");
      return;
    }
    setPrinting(true);
    setPrintNote(null);

    void refetchLabelCfg();
    const cfg = buildPrintCfg(labelCfg as Record<string, unknown> | null);

    const selectedItemsList = sorted.filter(p => selectedProducts.has(p.id));
    const expanded = expandItems(selectedItemsList, labelQuantities, labelNames);
    if (expanded.length === 0) {
      setPrintNote("Cantidad de etiquetas en 0. Sube la cantidad (columna Cant.) antes de imprimir.");
      setPrinting(false);
      return;
    }

    const productIds = Array.from(selectedProducts);
    const widthMm = parseInt(String(cfg.labelWidth), 10) || 50;
    const heightMm = parseInt(String(cfg.labelHeight), 10) || 25;
    const zpl = buildZplBatch(expanded, {
      widthMm,
      heightMm,
      showPrice: effectiveShowPrice,
      footer: String(cfg.footerText || "American Outlet Los Chiles"),
      showDate: !!cfg.showDate,
      rotation: Number(cfg.rotation) || 0,
    });

    if (preferZebraDirect) {
      void (async () => {
        const result = await tryZebraBrowserPrint(zpl);
        if (result.ok) {
          markPrinted.mutate({
            storeId,
            refId,
            sourceType,
            productIds,
            copies: expanded.length,
          });
          setPrintNote(result.message);
          setPrinting(false);
          return;
        }
        setPrintNote(result.message + " Abriendo pantalla de impresion…");
        openPrintDesk(expanded, productIds, cfg, zpl);
      })();
      return;
    }

    // Always open the print desk — user presses IMPRIMIR AHORA (guaranteed gesture)
    openPrintDesk(expanded, productIds, cfg, zpl);
  };

  const filtered = useMemo(() => {
    const list = products || [];
    return list.filter(p => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q
        || p.nombre.toLowerCase().includes(q)
        || (!!p.codigoBarras && p.codigoBarras.includes(search));
      if (!matchesSearch) return false;
      if (printFilter === "pendientes") return !p.printed;
      if (printFilter === "impresos") return !!p.printed;
      return true;
    });
  }, [products, search, printFilter]);

  const sorted = filtered;

  type DisplayRow = LabelItem & { memberIds: number[] };

  // Agrupada: merge same barcode (or name+price); selecting a group selects all members
  const displayRows: DisplayRow[] = useMemo(() => {
    if (viewMode !== "agrupada") {
      return sorted.map((p) => ({ ...p, memberIds: [p.id] }));
    }
    const map = new Map<string, DisplayRow>();
    for (const p of sorted) {
      const key = p.codigoBarras || `${p.nombre}|${p.precio}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { ...p, memberIds: [p.id] });
      } else {
        map.set(key, {
          ...existing,
          cantidad: existing.cantidad + p.cantidad,
          printed: existing.printed && p.printed,
          memberIds: [...existing.memberIds, p.id],
        });
      }
    }
    return Array.from(map.values());
  }, [sorted, viewMode]);

  const toggleGroup = (row: DisplayRow) => {
    setSelectedProducts((prev) => {
      const next = new Set(prev);
      const allSelected = row.memberIds.every((id) => next.has(id));
      if (allSelected) row.memberIds.forEach((id) => next.delete(id));
      else row.memberIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const selectedItemsList = sorted.filter(p => selectedProducts.has(p.id));
  const totalLabels = selectedItemsList.reduce((t, p) => {
    const q = labelQuantities[p.id] !== undefined ? labelQuantities[p.id] : p.cantidad;
    return t + Math.max(0, q);
  }, 0);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" style={{ color: "hsl(207 55% 15%)" }}>
            <Tag className="w-6 h-6" style={{ color: BRAND_RED }} />
            Imprimir Etiquetas
          </h1>
          <p className="text-sm mt-1" style={{ color: "hsl(207 20% 45%)" }}>
            Zebra ZD411 · etiqueta estandar 50×25 mm (2×1 pulgadas) · sin margenes
          </p>
        </div>
        <Link to="/label-config" className="text-sm font-medium underline" style={{ color: BRAND_BLUE }}>
          Configurar diseno de etiqueta
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card className="border shadow-sm">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: "hsl(207 55% 15%)" }}>
                <Tag className="w-4 h-4" style={{ color: BRAND_RED }} />
                Seleccionar Origen
              </h3>
              <div className="mb-4">
                <CustomDropdown
                  label="Contenedor"
                  value={selectedPallet}
                  onChange={(val) => {
                    setSelectedPallet(val);
                    setSelectedAdjustment("");
                    setSelectedProducts(new Set());
                    setLabelQuantities({});
                    setLabelNames({});
                  }}
                  placeholder="Seleccione un contenedor"
                  options={(palletsWithStats || []).map(p => ({
                    value: String(p.id),
                    label: `${p.palletId} - ${p.description} (${p.articulos} art, ${p.unidades} un)`,
                  }))}
                />
              </div>
              <div>
                <CustomDropdown
                  label="O Ajuste"
                  value={selectedAdjustment}
                  onChange={(val) => {
                    setSelectedAdjustment(val);
                    setSelectedPallet("");
                    setSelectedProducts(new Set());
                    setLabelQuantities({});
                    setLabelNames({});
                  }}
                  placeholder="Seleccione un ajuste (opcional)"
                  options={(adjustments || []).map(a => ({
                    value: String(a.id),
                    label: `${a.adjustmentId} (${a.productCount} prod, ${a.unitCount} un) - ${a.estado === "activo" ? "Activo" : a.estado === "completado" ? "Completado" : "Cancelado"}`,
                  }))}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border shadow-sm">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold mb-4" style={{ color: "hsl(207 55% 15%)" }}>
                Configuracion de Etiqueta
              </h3>
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium mb-1.5 block">Tamano (ZD411)</Label>
                  <select
                    className="w-full h-10 border rounded-md px-3 text-sm bg-white"
                    style={{ borderColor: "hsl(210 20% 88%)" }}
                    value={labelSize}
                    onChange={(e) => setLabelSize(e.target.value)}
                  >
                    {Object.entries(LABEL_SIZES).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-sm font-medium mb-1.5 block">Mostrar Precio</Label>
                  <select
                    className="w-full h-10 border rounded-md px-3 text-sm bg-white"
                    style={{ borderColor: "hsl(210 20% 88%)" }}
                    value={showPrice}
                    onChange={(e) => setShowPrice(e.target.value)}
                  >
                    <option value="si">Si</option>
                    <option value="no">No</option>
                  </select>
                </div>
                <p className="text-[11px]" style={{ color: "hsl(207 20% 55%)" }}>
                  Tipografia y posiciones finas:{" "}
                  <Link to="/label-config" className="underline" style={{ color: BRAND_BLUE }}>Configuracion de etiquetas</Link>
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-3">
          <Card className="border shadow-sm">
            <CardContent className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: "hsl(207 55% 15%)" }}>
                  <List className="w-4 h-4" style={{ color: BRAND_RED }} />
                  Articulos a Imprimir
                </h3>
                <div className="flex flex-wrap items-center gap-1">
                  <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                    <button type="button" className={`px-3 py-1.5 rounded-md text-xs font-medium ${viewMode === "detallada" ? "bg-white shadow-sm" : "text-gray-500"}`} onClick={() => setViewMode("detallada")}>
                      <List className="w-3.5 h-3.5 inline mr-1" />Detallada
                    </button>
                    <button type="button" className={`px-3 py-1.5 rounded-md text-xs font-medium ${viewMode === "agrupada" ? "bg-white shadow-sm" : "text-gray-500"}`} onClick={() => setViewMode("agrupada")}>
                      <Layers className="w-3.5 h-3.5 inline mr-1" />Agrupada
                    </button>
                  </div>
                  <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                    {([
                      ["todos", "Todos"],
                      ["pendientes", "Pendientes"],
                      ["impresos", "Impresos"],
                    ] as const).map(([k, lab]) => (
                      <button
                        key={k}
                        type="button"
                        className={`px-2.5 py-1.5 rounded-md text-xs font-medium ${printFilter === k ? "bg-white shadow-sm" : "text-gray-500"}`}
                        onClick={() => setPrintFilter(k)}
                      >
                        {lab}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 mb-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "hsl(207 20% 60%)" }} />
                  <Input placeholder="Buscar por nombre o codigo..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 h-10" />
                </div>
              </div>

              <div className="flex items-center gap-2 mb-3 p-3 rounded-lg border" style={{ background: "hsl(0 0% 98%)", borderColor: "hsl(210 20% 92%)" }}>
                <span className="text-xs font-medium" style={{ color: "hsl(207 20% 45%)" }}>Seleccionar rango</span>
                <Input placeholder="Desd" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} className="h-8 w-16 text-center text-sm" />
                <span className="text-xs" style={{ color: "hsl(207 20% 55%)" }}>a</span>
                <Input placeholder="Hast" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} className="h-8 w-16 text-center text-sm" />
                <Button size="sm" className="h-8 text-xs font-medium" style={{ background: BRAND_RED }} onClick={handleSelectRange}>
                  <CheckSquare className="w-3.5 h-3.5 mr-1" />Seleccionar
                </Button>
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleDeselectRange}>
                  <Square className="w-3.5 h-3.5 mr-1" />Deseleccionar
                </Button>
              </div>

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
                    <p className="text-xs" style={{ color: "hsl(207 20% 55%)" }}>
                      {displayRows.length} fila{displayRows.length !== 1 ? "s" : ""}
                      {viewMode === "agrupada" ? " (agrupadas)" : ""}
                    </p>
                  </div>
                </div>
              )}

              <div className="min-h-[300px] max-h-[500px] overflow-y-auto border rounded-lg" style={{ borderColor: "hsl(210 20% 92%)" }}>
                {!selectedPallet && !selectedAdjustment ? (
                  <div className="flex flex-col items-center justify-center h-64">
                    <Tag className="w-12 h-12 mb-3 opacity-20" />
                    <p className="text-sm" style={{ color: "hsl(207 20% 55%)" }}>Seleccione un contenedor o ajuste</p>
                  </div>
                ) : isLoading ? (
                  <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: BRAND_RED }} />
                  </div>
                ) : displayRows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64">
                    <Tag className="w-10 h-10 mb-3 opacity-30" />
                    <p className="text-sm" style={{ color: "hsl(207 20% 55%)" }}>No hay articulos con este filtro</p>
                  </div>
                ) : (
                  <table className="w-full">
                    <thead style={{ background: "hsl(0 0% 98%)" }}>
                      <tr className="border-b" style={{ borderColor: "hsl(210 20% 94%)" }}>
                        <th className="px-3 py-2 w-8"></th>
                        <th className="px-2 py-2 text-[10px] font-semibold uppercase text-left" style={{ color: BRAND_BLUE }}>N°</th>
                        <th className="px-2 py-2 text-[10px] font-semibold uppercase text-left" style={{ color: BRAND_BLUE }}>Estado</th>
                        <th className="px-2 py-2 text-[10px] font-semibold uppercase text-left" style={{ color: BRAND_BLUE }}>Cod. Barra</th>
                        <th className="px-2 py-2 text-[10px] font-semibold uppercase text-left" style={{ color: BRAND_BLUE }}>Nombre</th>
                        <th className="px-2 py-2 text-[10px] font-semibold uppercase text-center w-20" style={{ color: BRAND_BLUE }}>Cant.</th>
                        <th className="px-2 py-2 text-[10px] font-semibold uppercase text-right" style={{ color: BRAND_BLUE }}>Precio</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: "hsl(210 20% 94%)" }}>
                      {displayRows.map((product, idx) => {
                        const rowSelected = product.memberIds.every((id) => selectedProducts.has(id));
                        return (
                        <tr key={`${product.id}-${product.memberIds.join("-")}`} className={`transition-colors hover:bg-gray-50 ${rowSelected ? "bg-red-50" : ""}`}>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => (viewMode === "agrupada" ? toggleGroup(product) : toggleProduct(product.id))}
                              className={`w-5 h-5 rounded border-2 flex items-center justify-center ${rowSelected ? "border-transparent" : "border-gray-300"}`}
                              style={rowSelected ? { background: BRAND_RED } : {}}
                            >
                              {rowSelected && <CheckSquare className="w-3.5 h-3.5 text-white" />}
                            </button>
                          </td>
                          <td className="px-2 py-2 text-xs font-mono" style={{ color: "hsl(207 20% 55%)" }}>{idx + 1}</td>
                          <td className="px-2 py-2">
                            {product.printed ? (
                              <button
                                type="button"
                                title="Clic para marcar como pendiente"
                                className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded"
                                style={{ background: "rgba(22,163,74,0.12)", color: "#15803D" }}
                                onClick={() => {
                                  if (!refId) return;
                                  if (confirm("Marcar esta etiqueta como pendiente (no impresa)?")) {
                                    unmarkPrinted.mutate({
                                      storeId,
                                      refId,
                                      sourceType,
                                      productId: product.id,
                                    });
                                  }
                                }}
                              >
                                Impresa
                              </button>
                            ) : (
                              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: "rgba(217,119,6,0.12)", color: "#B45309" }}>
                                Pendiente
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-xs font-mono" style={{ color: "hsl(207 20% 55%)" }}>{product.codigoBarras || "-"}</td>
                          <td className="px-2 py-2">
                            <input
                              type="text"
                              className="w-full text-sm border rounded px-2 py-1 focus:outline-none focus:ring-1"
                              style={{ borderColor: "hsl(210 20% 88%)", color: "hsl(207 55% 15%)" }}
                              value={labelNames[product.id] !== undefined ? labelNames[product.id] : product.nombre}
                              onChange={(e) => setLabelNames(prev => ({ ...prev, [product.id]: e.target.value }))}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="number"
                              min={0}
                              className="w-full text-sm text-center border rounded px-1 py-1 focus:outline-none focus:ring-1 font-semibold"
                              style={{ borderColor: "hsl(210 20% 88%)", color: BRAND_RED }}
                              value={labelQuantities[product.id] !== undefined ? labelQuantities[product.id] : product.cantidad}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setLabelQuantities(prev => ({ ...prev, [product.id]: val }));
                                if (val > 0) {
                                  setSelectedProducts(prev => {
                                    const n = new Set(prev);
                                    n.add(product.id);
                                    return n;
                                  });
                                }
                              }}
                            />
                          </td>
                          <td className="px-2 py-2 text-sm font-bold text-right" style={{ color: BRAND_RED }}>
                            ₡{Number(product.precio).toLocaleString("es-CR")}
                          </td>
                        </tr>
                      );})}
                    </tbody>
                  </table>
                )}
              </div>

              {selectedProducts.size > 0 && (
                <p className="text-xs mt-2 font-medium" style={{ color: "hsl(207 20% 55%)" }}>
                  {selectedProducts.size} articulo{selectedProducts.size !== 1 ? "s" : ""} · {totalLabels} etiqueta{totalLabels !== 1 ? "s" : ""} · {labelWidth}×{labelHeight}
                </p>
              )}
            </CardContent>
          </Card>

          <div className="mt-4 space-y-3">
            <div className="flex flex-col sm:flex-row items-stretch gap-3">
              <Button
                className="flex-1 h-12 font-bold text-base"
                style={{ background: BRAND_RED }}
                onClick={() => handlePrint(false)}
                disabled={printing}
              >
                <Printer className="w-5 h-5 mr-2" />
                {printing ? "Preparando..." : "Imprimir etiquetas"}
              </Button>
              <Button
                className="flex-1 h-11 font-medium"
                style={{ background: "#1B3A5C" }}
                onClick={() => handlePrint(true)}
                disabled={printing}
              >
                <Printer className="w-4 h-4 mr-2" />
                Enviar a Zebra ZD411
              </Button>
            </div>

            {printNote && (
              <div className="p-3 rounded-lg border text-sm font-medium" style={{ background: "#FEF3C7", borderColor: "#F59E0B", color: "#92400E" }}>
                {printNote}
              </div>
            )}

            <div className="p-4 rounded-lg border text-xs space-y-2" style={{ background: "hsl(0 0% 98%)", borderColor: "hsl(210 20% 92%)" }}>
              <p style={{ color: "hsl(207 20% 45%)" }}>
                <AlertCircle className="w-3.5 h-3.5 inline mr-1" style={{ color: "#B45309" }} />
                <strong>Como imprimir:</strong> 1) Marca articulos 2) Pulsa <strong>Imprimir etiquetas</strong> 3) En la pantalla verde pulsa <strong>IMPRIMIR AHORA</strong> 4) Elige <strong>Zebra ZD411</strong>, margenes <strong>0</strong>, sin “ajustar a la pagina”.
              </p>
              <p style={{ color: "hsl(207 20% 45%)" }}>
                El layout sale de <Link to="/label-config" className="underline" style={{ color: BRAND_BLUE }}>Configuracion de Etiquetas</Link> (hay que <strong>Guardar</strong> alla).
              </p>
              <p style={{ color: "hsl(207 20% 45%)" }}>
                <LinkIcon className="w-3.5 h-3.5 inline mr-1" />
                Export CSV QUPOS: desde el ajuste o contenedor (no desde esta pantalla).
              </p>
            </div>
          </div>
        </div>
      </div>

      {printSession && createPortal(
        <div
          id="aolc-print-overlay"
          style={{ position: "fixed", inset: 0, zIndex: 2147483646, background: "#fff", display: "flex", flexDirection: "column" }}
        >
          <style>{`
            ${printSession.css}
            @media print {
              html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
              body > *:not(#aolc-print-overlay) { display: none !important; }
              #aolc-print-overlay {
                position: static !important;
                inset: auto !important;
                display: block !important;
                background: #fff !important;
                height: auto !important;
              }
              .aolc-no-print { display: none !important; }
              .aolc-print-root {
                display: block !important;
                overflow: visible !important;
                padding: 0 !important;
                background: #fff !important;
                flex: none !important;
              }
            }
          `}</style>
          <div
            className="aolc-no-print"
            style={{
              background: "#15803D",
              color: "#fff",
              padding: "16px 20px",
              display: "flex",
              flexWrap: "wrap",
              gap: "12px",
              alignItems: "center",
              justifyContent: "space-between",
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            }}
          >
            <div style={{ fontFamily: "Arial,sans-serif", fontSize: 14, lineHeight: 1.4, maxWidth: 480 }}>
              <strong style={{ fontSize: 16 }}>Listo para imprimir {printSession.copies} etiqueta(s)</strong>
              <div style={{ opacity: 0.95, marginTop: 4 }}>
                Pulsa el boton verde → elige <strong>Zebra ZD411</strong> → papel {printSession.pageW}×{printSession.pageH} → margenes 0 → sin ajustar.
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <button
                type="button"
                onClick={runMainWindowPrint}
                style={{
                  background: "#22C55E",
                  color: "#052e16",
                  border: "0",
                  borderRadius: 10,
                  padding: "14px 28px",
                  fontSize: 18,
                  fontWeight: 800,
                  cursor: "pointer",
                  fontFamily: "Arial,sans-serif",
                  boxShadow: "0 2px 0 #15803D",
                }}
              >
                IMPRIMIR AHORA
              </button>
              <button
                type="button"
                onClick={() => {
                  const html = printSession.fullDoc.replace(
                    "</body>",
                    `<div id="print-toolbar" style="position:sticky;top:0;z-index:9;background:#15803D;color:#fff;padding:16px;font-family:Arial,sans-serif;display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
                      <strong>Abre este archivo en Chrome →</strong>
                      <button type="button" id="btn-file-print" style="background:#22C55E;color:#052e16;border:0;border-radius:8px;padding:14px 22px;font-size:16px;font-weight:800;cursor:pointer;">IMPRIMIR AHORA</button>
                      <span style="font-size:13px;opacity:.95">Elige Zebra ZD411 · margenes 0</span>
                    </div>
                    <script>
                      document.getElementById("btn-file-print").onclick = function () { window.print(); };
                    </script></body>`,
                  );
                  downloadBlob(html, "etiquetas-aolc.html", "text/html;charset=utf-8");
                }}
                style={{ background: "#fff", color: "#15803D", border: "2px solid #fff", borderRadius: 8, padding: "12px 14px", fontWeight: 700, cursor: "pointer", fontFamily: "Arial,sans-serif" }}
              >
                Descargar HTML
              </button>
              <button
                type="button"
                onClick={() => downloadBlob(printSession.zpl, "etiquetas-zd411.zpl", "text/plain;charset=utf-8")}
                style={{ background: "transparent", color: "#fff", border: "2px solid rgba(255,255,255,0.7)", borderRadius: 8, padding: "12px 14px", fontWeight: 700, cursor: "pointer", fontFamily: "Arial,sans-serif" }}
              >
                Descargar ZPL
              </button>
              <button
                type="button"
                onClick={() => { setPrintSession(null); setPrintNote(null); }}
                style={{ background: "transparent", color: "#fff", border: "0", padding: "12px 10px", fontWeight: 600, cursor: "pointer", fontFamily: "Arial,sans-serif", textDecoration: "underline" }}
              >
                Cerrar
              </button>
            </div>
          </div>
          <div
            className="aolc-print-root"
            style={{ flex: 1, overflow: "auto", padding: 16, background: "#f3f4f6" }}
            dangerouslySetInnerHTML={{ __html: printSession.bodyHtml }}
          />
        </div>,
        document.body,
      )}
    </div>
  );
}
