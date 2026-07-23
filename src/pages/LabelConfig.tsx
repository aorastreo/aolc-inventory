import { useState, useEffect } from "react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Save, RotateCcw, Tag, Printer, AlignLeft, AlignCenter, AlignRight, Minus, Plus } from "lucide-react";
import { toast } from "sonner";

const BRAND_RED = "#B22234";

// Extract number and unit from a value like "5.5pt" -> { num: 5.5, unit: "pt" }
function parseValue(val: string): { num: number; unit: string } {
  const match = val.match(/^([0-9.]+)(.*)$/);
  if (match) return { num: parseFloat(match[1]), unit: match[2] };
  return { num: 0, unit: "" };
}

// Stepper input with + and - buttons
function StepperInput({ value, onChange, label, step = 0.5, min = 0 }: { value: string; onChange: (v: string) => void; label: string; step?: number; min?: number }) {
  const { num, unit } = parseValue(value);
  const decrement = () => {
    const newVal = Math.max(min, parseFloat((num - step).toFixed(2)));
    onChange(newVal + unit);
  };
  const increment = () => {
    const newVal = parseFloat((num + step).toFixed(2));
    onChange(newVal + unit);
  };
  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    const n = parseFloat(v);
    if (!isNaN(n) && n >= min) {
      onChange(n + unit);
    } else {
      onChange(v);
    }
  };
  return (
    <div>
      <Label className="text-xs mb-1 block">{label}</Label>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" className="h-8 w-8 p-0 flex-shrink-0" onClick={decrement}><Minus className="w-3 h-3" /></Button>
        <Input value={value} onChange={handleInput} className="h-8 text-center text-sm px-1" />
        <Button variant="outline" size="sm" className="h-8 w-8 p-0 flex-shrink-0" onClick={increment}><Plus className="w-3 h-3" /></Button>
      </div>
    </div>
  );
}

const defaultConfig: Record<string, any> = {
  labelWidth: "50mm", labelHeight: "25mm",
  nameFontSize: "5.5pt", nameMarginTop: "1mm", nameMarginBottom: "0.5mm", nameTextAlign: "center",
  priceFontSize: "20pt", ivaFontSize: "8pt", priceMarginTop: "0.2mm", priceMarginBottom: "0.2mm", priceTextAlign: "center",
  barcodeWidth: "35mm", barcodeHeight: "7.5mm", barcodeModuleWidth: "0.50", barcodeBarHeight: "9", barcodeMarginTop: "0.5mm", barcodeAlign: "center",
  barcodeNumberFontSize: "8pt", barcodeNumberLetterSpacing: "2px", barcodeNumberMarginTop: "0.3mm", barcodeNumberMarginBottom: "0.2mm", barcodeNumberAlign: "center",
  footerFontSize: "5pt", footerMarginTop: "2mm", footerMarginBottom: "0.3mm", footerTextAlign: "center",
  showPrice: true, showIva: true, showBarcode: true, showBarcodeNumber: true, showFooter: true, showDate: true,
  footerText: "American Outlet Los Chiles",
};

function AlignButtons({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const opts = [
    { v: "left", Icon: AlignLeft },
    { v: "center", Icon: AlignCenter },
    { v: "right", Icon: AlignRight },
  ];
  return (
    <div className="flex gap-1">
      {opts.map(({ v, Icon }) => (
        <Button
          key={v}
          variant={value === v ? "default" : "outline"}
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => onChange(v)}
        >
          <Icon className="w-4 h-4" />
        </Button>
      ))}
    </div>
  );
}

export default function LabelConfigPage() {
  const utils = trpc.useUtils();
  const { data: savedConfig } = trpc.labelConfig.get.useQuery({ storeId: 1 });
  const upsertConfig = trpc.labelConfig.upsert.useMutation({
    onSuccess: () => {
      utils.labelConfig.get.invalidate();
      toast.success("Configuracion guardada");
    },
  });

  const [config, setConfig] = useState<Record<string, any>>({ ...defaultConfig });

  useEffect(() => {
    if (savedConfig) {
      const merged: Record<string, any> = {};
      for (const key of Object.keys(defaultConfig)) {
        merged[key] = (savedConfig as any)[key] ?? defaultConfig[key];
      }
      setConfig(merged);
    }
  }, [savedConfig]);

  const handleSave = () => {
    const payload: Record<string, any> = { storeId: 1 };
    for (const [key, val] of Object.entries(config)) {
      if (val !== undefined) payload[key] = val;
    }
    upsertConfig.mutate(payload);
  };

  const handleReset = () => {
    setConfig({ ...defaultConfig });
    toast.info("Valores reseteados a default");
  };

  const update = (key: string, value: any) => setConfig((prev) => ({ ...prev, [key]: value }));

  const previewItem = { nombre: "CAJA ORGANIZADORA", precio: "1990", codigoBarras: "77001116" };

  const s = (k: string) => config[k] ?? defaultConfig[k];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Tag className="w-6 h-6" style={{ color: BRAND_RED }} />
          <h1 className="text-2xl font-bold" style={{ color: "#1B3A5C" }}>Configuracion de Etiquetas</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleReset} className="gap-2"><RotateCcw className="w-4 h-4" /> Resetear</Button>
          <Button onClick={handleSave} className="gap-2" style={{ background: BRAND_RED }}><Save className="w-4 h-4" /> Guardar</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT: Controls */}
        <div className="space-y-4">
          {/* Dimensions */}
          <div className="bg-white rounded-lg border p-4">
            <h3 className="font-semibold mb-3" style={{ color: "#1B3A5C" }}>Dimensiones</h3>
            <div className="grid grid-cols-2 gap-3">
              <StepperInput label="Ancho" value={s("labelWidth")} onChange={(v) => update("labelWidth", v)} step={1} />
              <StepperInput label="Alto" value={s("labelHeight")} onChange={(v) => update("labelHeight", v)} step={1} />
            </div>
          </div>

          {/* Product Name */}
          <div className="bg-white rounded-lg border p-4">
            <h3 className="font-semibold mb-3" style={{ color: "#1B3A5C" }}>Nombre del Producto</h3>
            <div className="grid grid-cols-3 gap-3">
              <StepperInput label="Tamano" value={s("nameFontSize")} onChange={(v) => update("nameFontSize", v)} step={0.5} />
              <StepperInput label="Margin arriba" value={s("nameMarginTop")} onChange={(v) => update("nameMarginTop", v)} step={0.2} />
              <StepperInput label="Margin abajo" value={s("nameMarginBottom")} onChange={(v) => update("nameMarginBottom", v)} step={0.2} />
            </div>
            <div className="mt-2"><Label>Alineacion</Label><AlignButtons value={s("nameTextAlign")} onChange={(v) => update("nameTextAlign", v)} /></div>
          </div>

          {/* Price */}
          <div className="bg-white rounded-lg border p-4">
            <h3 className="font-semibold mb-3" style={{ color: "#1B3A5C" }}>Precio</h3>
            <div className="grid grid-cols-3 gap-3">
              <StepperInput label="Tamano precio" value={s("priceFontSize")} onChange={(v) => update("priceFontSize", v)} step={1} />
              <StepperInput label="Tamano IVA" value={s("ivaFontSize")} onChange={(v) => update("ivaFontSize", v)} step={1} />
              <StepperInput label="Margin arriba" value={s("priceMarginTop")} onChange={(v) => update("priceMarginTop", v)} step={0.1} />
              <StepperInput label="Margin abajo" value={s("priceMarginBottom")} onChange={(v) => update("priceMarginBottom", v)} step={0.1} />
            </div>
            <div className="mt-2"><Label>Alineacion</Label><AlignButtons value={s("priceTextAlign")} onChange={(v) => update("priceTextAlign", v)} /></div>
            <div className="flex gap-6 mt-3">
              <div className="flex items-center gap-2"><Switch checked={s("showPrice")} onCheckedChange={(v) => update("showPrice", v)} /><Label className="mb-0">Mostrar precio</Label></div>
              <div className="flex items-center gap-2"><Switch checked={s("showIva")} onCheckedChange={(v) => update("showIva", v)} /><Label className="mb-0">Mostrar IVA</Label></div>
            </div>
          </div>

          {/* Barcode */}
          <div className="bg-white rounded-lg border p-4">
            <h3 className="font-semibold mb-3" style={{ color: "#1B3A5C" }}>Codigo de Barras</h3>
            <div className="grid grid-cols-3 gap-3">
              <StepperInput label="Ancho SVG" value={s("barcodeWidth")} onChange={(v) => update("barcodeWidth", v)} step={1} />
              <StepperInput label="Alto SVG" value={s("barcodeHeight")} onChange={(v) => update("barcodeHeight", v)} step={0.5} />
              <StepperInput label="Ancho modulo" value={s("barcodeModuleWidth")} onChange={(v) => update("barcodeModuleWidth", v)} step={0.05} />
              <StepperInput label="Alto barras" value={s("barcodeBarHeight")} onChange={(v) => update("barcodeBarHeight", v)} step={1} />
              <StepperInput label="Margin arriba" value={s("barcodeMarginTop")} onChange={(v) => update("barcodeMarginTop", v)} step={0.1} />
            </div>
            <div className="mt-2"><Label>Alineacion</Label><AlignButtons value={s("barcodeAlign")} onChange={(v) => update("barcodeAlign", v)} /></div>
            <div className="flex gap-6 mt-3">
              <div className="flex items-center gap-2"><Switch checked={s("showBarcode")} onCheckedChange={(v) => update("showBarcode", v)} /><Label className="mb-0">Mostrar barras</Label></div>
            </div>
          </div>

          {/* Barcode Number */}
          <div className="bg-white rounded-lg border p-4">
            <h3 className="font-semibold mb-3" style={{ color: "#1B3A5C" }}>Numero del Codigo</h3>
            <div className="grid grid-cols-3 gap-3">
              <StepperInput label="Tamano" value={s("barcodeNumberFontSize")} onChange={(v) => update("barcodeNumberFontSize", v)} step={0.5} />
              <StepperInput label="Espaciado" value={s("barcodeNumberLetterSpacing")} onChange={(v) => update("barcodeNumberLetterSpacing", v)} step={0.5} />
              <StepperInput label="Margin arriba" value={s("barcodeNumberMarginTop")} onChange={(v) => update("barcodeNumberMarginTop", v)} step={0.1} />
              <StepperInput label="Margin abajo" value={s("barcodeNumberMarginBottom")} onChange={(v) => update("barcodeNumberMarginBottom", v)} step={0.1} />
            </div>
            <div className="mt-2"><Label>Alineacion</Label><AlignButtons value={s("barcodeNumberAlign")} onChange={(v) => update("barcodeNumberAlign", v)} /></div>
            <div className="flex gap-6 mt-3">
              <div className="flex items-center gap-2"><Switch checked={s("showBarcodeNumber")} onCheckedChange={(v) => update("showBarcodeNumber", v)} /><Label className="mb-0">Mostrar numero</Label></div>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-white rounded-lg border p-4">
            <h3 className="font-semibold mb-3" style={{ color: "#1B3A5C" }}>Pie de Etiqueta</h3>
            <div className="grid grid-cols-3 gap-3">
              <StepperInput label="Tamano" value={s("footerFontSize")} onChange={(v) => update("footerFontSize", v)} step={0.5} />
              <StepperInput label="Margin arriba" value={s("footerMarginTop")} onChange={(v) => update("footerMarginTop", v)} step={0.2} />
              <StepperInput label="Margin abajo" value={s("footerMarginBottom")} onChange={(v) => update("footerMarginBottom", v)} step={0.1} />
              <div className="col-span-3"><Label>Texto</Label><Input value={s("footerText")} onChange={(e) => update("footerText", e.target.value)} /></div>
            </div>
            <div className="mt-2"><Label>Alineacion</Label><AlignButtons value={s("footerTextAlign")} onChange={(v) => update("footerTextAlign", v)} /></div>
            <div className="flex gap-6 mt-3">
              <div className="flex items-center gap-2"><Switch checked={s("showFooter")} onCheckedChange={(v) => update("showFooter", v)} /><Label className="mb-0">Mostrar footer</Label></div>
              <div className="flex items-center gap-2"><Switch checked={s("showDate")} onCheckedChange={(v) => update("showDate", v)} /><Label className="mb-0">Mostrar fecha</Label></div>
            </div>
          </div>
        </div>

        {/* RIGHT: Preview */}
        <div className="bg-gray-100 rounded-lg border p-6 flex flex-col items-center">
          <h3 className="font-semibold mb-4" style={{ color: "#1B3A5C" }}><Printer className="w-4 h-4 inline mr-1" /> Vista Previa</h3>
          <div
            className="bg-white border border-gray-300"
            style={{
              width: s("labelWidth"), height: s("labelHeight"), padding: "0.5mm 1mm",
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", textAlign: "center",
              fontFamily: "Arial Narrow, Arial, Helvetica, sans-serif",
              boxSizing: "border-box",
            }}
          >
            <div style={{
              fontSize: s("nameFontSize"), fontWeight: "bold", color: "#000",
              textTransform: "uppercase", letterSpacing: "0.2px", lineHeight: 1.3,
              marginTop: s("nameMarginTop"), marginBottom: s("nameMarginBottom"),
              textAlign: s("nameTextAlign") as any, width: "100%",
            }}>{previewItem.nombre}</div>

            {s("showPrice") && (
              <div style={{
                display: "flex", alignItems: "baseline", justifyContent: s("priceTextAlign") === "left" ? "flex-start" : s("priceTextAlign") === "right" ? "flex-end" : "center",
                gap: "1.5mm", marginTop: s("priceMarginTop"), marginBottom: s("priceMarginBottom"), width: "100%",
              }}>
                <span style={{ fontSize: s("priceFontSize"), fontWeight: "bold", color: "#000", letterSpacing: "0.5px", lineHeight: 1 }}>{previewItem.precio}</span>
                {s("showIva") && <span style={{ fontSize: s("ivaFontSize"), fontWeight: "bold", color: "#000" }}>IVA</span>}
              </div>
            )}

            {s("showBarcode") && (
              <div style={{ marginTop: s("barcodeMarginTop"), textAlign: s("barcodeAlign") as any, width: "100%" }}>
                <svg viewBox="0 0 100 20" preserveAspectRatio="xMidYMid meet" style={{ width: s("barcodeWidth"), height: s("barcodeHeight"), display: "inline-block" }}>
                  <rect x="5" y="0" width="3" height="20" fill="#000" /><rect x="10" y="0" width="1" height="20" fill="#000" />
                  <rect x="13" y="0" width="4" height="20" fill="#000" /><rect x="19" y="0" width="2" height="20" fill="#000" />
                  <rect x="23" y="0" width="1" height="20" fill="#000" /><rect x="26" y="0" width="5" height="20" fill="#000" />
                  <rect x="33" y="0" width="2" height="20" fill="#000" /><rect x="37" y="0" width="3" height="20" fill="#000" />
                  <rect x="42" y="0" width="1" height="20" fill="#000" /><rect x="45" y="0" width="4" height="20" fill="#000" />
                  <rect x="51" y="0" width="2" height="20" fill="#000" /><rect x="55" y="0" width="3" height="20" fill="#000" />
                  <rect x="60" y="0" width="1" height="20" fill="#000" /><rect x="63" y="0" width="5" height="20" fill="#000" />
                  <rect x="70" y="0" width="2" height="20" fill="#000" /><rect x="74" y="0" width="3" height="20" fill="#000" />
                  <rect x="79" y="0" width="4" height="20" fill="#000" /><rect x="85" y="0" width="2" height="20" fill="#000" />
                  <rect x="90" y="0" width="5" height="20" fill="#000" />
                </svg>
              </div>
            )}

            {s("showBarcodeNumber") && (
              <div style={{
                fontSize: s("barcodeNumberFontSize"), color: "#000",
                letterSpacing: s("barcodeNumberLetterSpacing"), fontFamily: "Courier New, Courier, monospace",
                marginTop: s("barcodeNumberMarginTop"), marginBottom: s("barcodeNumberMarginBottom"),
                textAlign: s("barcodeNumberAlign") as any, width: "100%", whiteSpace: "nowrap",
              }}>{previewItem.codigoBarras}</div>
            )}

            {s("showFooter") && (
              <div style={{
                fontSize: s("footerFontSize"), color: "#000",
                marginTop: s("footerMarginTop"), marginBottom: s("footerMarginBottom"),
                letterSpacing: "0.2px", fontFamily: "Arial Narrow, Arial, sans-serif",
                textAlign: s("footerTextAlign") as any, width: "100%", whiteSpace: "nowrap",
              }}>
                {s("showDate") ? "2026-07-23 - " : ""}{s("footerText")}
              </div>
            )}
          </div>
          <div className="mt-4 text-sm text-gray-500 text-center">
            Ajusta los valores y ve los cambios en tiempo real.<br />Cuando quede a tu gusto, guarda.
          </div>
        </div>
      </div>
    </div>
  );
}
