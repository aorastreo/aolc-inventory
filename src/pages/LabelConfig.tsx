import { useState, useEffect, useMemo, useRef } from "react";
import { trpc } from "@/providers/trpc";
import { useActiveStore } from "@/hooks/useActiveStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Save, RotateCcw, Tag, Printer, AlignLeft, AlignCenter, AlignRight, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  LABEL_DEFAULTS,
  mergeLabelConfig,
  buildLabelHtml,
  buildPrintDocumentHtml,
  generateBarcodeSVG,
  type LabelConfigValues,
} from "@/lib/label-template";

const BRAND_RED = "#B22234";

function parseValue(val: string): { num: number; unit: string } {
  const match = val.match(/^([0-9.]+)(.*)$/);
  if (match) return { num: parseFloat(match[1]), unit: match[2] };
  return { num: 0, unit: "" };
}

function StepperInput({ value, onChange, label, step = 0.5, min = 0 }: { value: string; onChange: (v: string) => void; label: string; step?: number; min?: number }) {
  const { num, unit } = parseValue(value);
  const dec = () => onChange(Math.max(min, parseFloat((num - step).toFixed(2))) + unit);
  const inc = () => onChange(parseFloat((num + step).toFixed(2)) + unit);
  return (
    <div>
      <Label className="text-xs mb-1 block">{label}</Label>
      <div className="flex items-center gap-1">
        <Button type="button" variant="outline" size="sm" className="h-8 w-8 p-0 flex-shrink-0" onClick={dec}><Minus className="w-3 h-3" /></Button>
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-8 text-center text-sm px-1" />
        <Button type="button" variant="outline" size="sm" className="h-8 w-8 p-0 flex-shrink-0" onClick={inc}><Plus className="w-3 h-3" /></Button>
      </div>
    </div>
  );
}

function FontSelector({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <div>
      {label && <Label className="text-xs mb-1 block">{label}</Label>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-8 border rounded px-2 text-sm bg-white"
        style={{ fontFamily: value }}
      >
        {FONT_OPTIONS.map((f) => (
          <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
        ))}
      </select>
    </div>
  );
}

function AlignButtons({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const opts = [{ v: "left", Icon: AlignLeft }, { v: "center", Icon: AlignCenter }, { v: "right", Icon: AlignRight }];
  return (
    <div className="flex gap-1">
      {opts.map(({ v, Icon }) => (
        <Button key={v} type="button" variant={value === v ? "default" : "outline"} size="sm" className="h-8 w-8 p-0" onClick={() => onChange(v)}><Icon className="w-4 h-4" /></Button>
      ))}
    </div>
  );
}

const FONT_OPTIONS = [
  "Arial", "Arial Narrow", "Arial Black",
  "Courier New", "Georgia",
  "Helvetica", "Impact",
  "Tahoma", "Times New Roman",
  "Trebuchet MS", "Verdana",
  "Lucida Console",
];

const PREVIEW_ITEM = {
  nombre: "CAJA ORGANIZADORA GRANDE CON TAPA",
  precio: "1990",
  codigoBarras: "77001116",
};

export default function LabelConfigPage() {
  const utils = trpc.useUtils();
  const { storeId } = useActiveStore();
  const { data: savedConfig, error: queryError } = trpc.labelConfig.get.useQuery({ storeId });
  const upsertConfig = trpc.labelConfig.upsert.useMutation({
    onSuccess: () => { utils.labelConfig.get.invalidate(); toast.success("Configuracion guardada"); },
    onError: (err) => { toast.error("Error: " + err.message); console.error(err); },
  });
  const [config, setConfig] = useState<LabelConfigValues>(mergeLabelConfig());
  const previewHostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (savedConfig) setConfig(mergeLabelConfig(savedConfig as Record<string, unknown>));
  }, [savedConfig]);

  const update = (key: string, value: string | boolean | number) =>
    setConfig((p) => ({ ...p, [key]: value }));
  const s = (k: keyof typeof LABEL_DEFAULTS | string) =>
    (config[k] ?? (LABEL_DEFAULTS as any)[k]) as any;

  const barcodeSvg = useMemo(
    () => generateBarcodeSVG(PREVIEW_ITEM.codigoBarras),
    [],
  );

  const previewHtml = useMemo(
    () => buildLabelHtml(PREVIEW_ITEM, config, { barcodeSvg }),
    [config, barcodeSvg],
  );

  useEffect(() => {
    if (previewHostRef.current) previewHostRef.current.innerHTML = previewHtml;
  }, [previewHtml]);

  const handleTestPrint = () => {
    const html = buildPrintDocumentHtml(
      buildLabelHtml(PREVIEW_ITEM, config, { barcodeSvg: generateBarcodeSVG(PREVIEW_ITEM.codigoBarras) }),
      config,
    );
    const popup = window.open("", "_blank", "width=420,height=560");
    if (!popup) {
      toast.error("Permite popups para probar la impresion");
      return;
    }
    popup.document.write(html.replace(
      "</body>",
      `<script>
        setTimeout(function(){ window.print(); setTimeout(function(){ window.close(); }, 500); }, 400);
      </script></body>`,
    ));
    popup.document.close();
    toast.info("Prueba: elige Zebra ZD411 · 50×25 mm (2×1 in) · sin margenes");
  };

  if (queryError) {
    return (
      <div className="max-w-6xl mx-auto p-8 text-center">
        <h1 className="text-xl font-bold text-red-600 mb-4">Error al cargar configuracion</h1>
        <p className="text-gray-600 mb-4">{queryError.message}</p>
        <Button onClick={() => window.location.reload()} variant="outline">Reintentar</Button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <Tag className="w-6 h-6" style={{ color: BRAND_RED }} />
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "#1B3A5C" }}>Configuracion de Etiquetas</h1>
            <p className="text-sm" style={{ color: "hsl(207 20% 45%)" }}>
              Perfil Zebra ZD411 · 50×25 mm (2×1 pulgadas)
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => { setConfig(mergeLabelConfig()); toast.info("Reseteado al perfil ZD411"); }}
            className="gap-2"
          >
            <RotateCcw className="w-4 h-4" /> Resetear
          </Button>
          <Button type="button" variant="outline" onClick={handleTestPrint} className="gap-2">
            <Printer className="w-4 h-4" /> Probar 1 etiqueta
          </Button>
          <Button
            type="button"
            onClick={() => {
              const payload: Record<string, unknown> = { storeId };
              for (const [k, v] of Object.entries(config)) {
                if (v !== undefined && v !== null) payload[k] = v;
              }
              upsertConfig.mutate(payload as any);
            }}
            className="gap-2"
            style={{ background: BRAND_RED }}
          >
            <Save className="w-4 h-4" /> Guardar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="bg-white rounded-lg border p-4">
            <h3 className="font-semibold mb-3" style={{ color: "#1B3A5C" }}>Dimensiones y rotacion</h3>
            <div className="grid grid-cols-2 gap-3">
              <StepperInput label="Ancho" value={String(s("labelWidth"))} onChange={v => update("labelWidth", v)} step={1} />
              <StepperInput label="Alto" value={String(s("labelHeight"))} onChange={v => update("labelHeight", v)} step={1} />
            </div>
            <p className="text-[11px] mt-2" style={{ color: "hsl(207 20% 55%)" }}>
              Estandar ZD411: 50mm × 25mm = 2 × 1 pulgadas
            </p>
            <div className="mt-3">
              <Label className="text-xs mb-1 block">Rotacion (si el rollo sale al reves)</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={Number(s("rotation")) === 0 ? "default" : "outline"}
                  onClick={() => update("rotation", 0)}
                >
                  0°
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={Number(s("rotation")) === 180 ? "default" : "outline"}
                  onClick={() => update("rotation", 180)}
                >
                  180°
                </Button>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border p-4">
            <h3 className="font-semibold mb-3" style={{ color: "#1B3A5C" }}>Nombre del Producto</h3>
            <div className="grid grid-cols-2 gap-3">
              <StepperInput label="Tamano fuente" value={String(s("nameFontSize"))} onChange={v => update("nameFontSize", v)} step={0.5} />
              <StepperInput label="Posicion Y" value={String(s("nameTop"))} onChange={v => update("nameTop", v)} step={0.5} />
              <div>
                <Label className="text-xs mb-1 block">Grosor</Label>
                <select value={String(s("nameFontWeight"))} onChange={e => update("nameFontWeight", e.target.value)} className="w-full h-8 border rounded px-2 text-sm">
                  <option value="normal">Normal</option>
                  <option value="bold">Negrita</option>
                </select>
              </div>
              <FontSelector label="Tipo de letra" value={String(s("nameFontFamily"))} onChange={v => update("nameFontFamily", v)} />
              <div>
                <Label className="text-xs mb-1 block">Max. chars / linea (2 lineas)</Label>
                <Input
                  type="number"
                  min={12}
                  max={40}
                  className="h-8"
                  value={Number(s("nameMaxCharsPerLine")) || 28}
                  onChange={(e) => update("nameMaxCharsPerLine", Math.max(12, Number(e.target.value) || 28))}
                />
              </div>
            </div>
            <div className="mt-2"><Label>Alineacion</Label><AlignButtons value={String(s("nameTextAlign"))} onChange={v => update("nameTextAlign", v)} /></div>
          </div>

          <div className="bg-white rounded-lg border p-4">
            <h3 className="font-semibold mb-3" style={{ color: "#1B3A5C" }}>Precio</h3>
            <div className="grid grid-cols-2 gap-3">
              <StepperInput label="Tamano precio" value={String(s("priceFontSize"))} onChange={v => update("priceFontSize", v)} step={1} />
              <StepperInput label="Tamano IVA" value={String(s("ivaFontSize"))} onChange={v => update("ivaFontSize", v)} step={1} />
              <StepperInput label="Posicion Y" value={String(s("priceTop"))} onChange={v => update("priceTop", v)} step={0.5} />
              <div>
                <Label className="text-xs mb-1 block">Grosor</Label>
                <select value={String(s("priceFontWeight"))} onChange={e => update("priceFontWeight", e.target.value)} className="w-full h-8 border rounded px-2 text-sm">
                  <option value="normal">Normal</option>
                  <option value="bold">Negrita</option>
                </select>
              </div>
              <FontSelector label="Tipo de letra" value={String(s("priceFontFamily"))} onChange={v => update("priceFontFamily", v)} />
            </div>
            <div className="mt-2"><Label>Alineacion</Label><AlignButtons value={String(s("priceTextAlign"))} onChange={v => update("priceTextAlign", v)} /></div>
            <div className="flex gap-6 mt-3">
              <div className="flex items-center gap-2"><Switch checked={!!s("showPrice")} onCheckedChange={v => update("showPrice", v)} /><Label className="mb-0">Mostrar precio</Label></div>
              <div className="flex items-center gap-2"><Switch checked={!!s("showIva")} onCheckedChange={v => update("showIva", v)} /><Label className="mb-0">Mostrar IVA</Label></div>
            </div>
          </div>

          <div className="bg-white rounded-lg border p-4">
            <h3 className="font-semibold mb-3" style={{ color: "#1B3A5C" }}>Codigo de Barras (CODE128 real)</h3>
            <div className="grid grid-cols-2 gap-3">
              <StepperInput label="Ancho SVG" value={String(s("barcodeWidth"))} onChange={v => update("barcodeWidth", v)} step={1} />
              <StepperInput label="Alto SVG" value={String(s("barcodeHeight"))} onChange={v => update("barcodeHeight", v)} step={0.5} />
              <StepperInput label="Posicion Y" value={String(s("barcodeTop"))} onChange={v => update("barcodeTop", v)} step={0.5} />
            </div>
            <div className="mt-2"><Label>Alineacion</Label><AlignButtons value={String(s("barcodeAlign"))} onChange={v => update("barcodeAlign", v)} /></div>
            <div className="flex gap-6 mt-3">
              <div className="flex items-center gap-2"><Switch checked={!!s("showBarcode")} onCheckedChange={v => update("showBarcode", v)} /><Label className="mb-0">Mostrar barras</Label></div>
            </div>
          </div>

          <div className="bg-white rounded-lg border p-4">
            <h3 className="font-semibold mb-3" style={{ color: "#1B3A5C" }}>Numero del Codigo</h3>
            <div className="grid grid-cols-2 gap-3">
              <StepperInput label="Tamano" value={String(s("barcodeNumberFontSize"))} onChange={v => update("barcodeNumberFontSize", v)} step={0.5} />
              <StepperInput label="Posicion Y" value={String(s("barcodeNumberTop"))} onChange={v => update("barcodeNumberTop", v)} step={0.5} />
              <div>
                <Label className="text-xs mb-1 block">Grosor</Label>
                <select value={String(s("barcodeNumberFontWeight"))} onChange={e => update("barcodeNumberFontWeight", e.target.value)} className="w-full h-8 border rounded px-2 text-sm">
                  <option value="normal">Normal</option>
                  <option value="bold">Negrita</option>
                </select>
              </div>
              <FontSelector label="Tipo de letra" value={String(s("barcodeNumberFontFamily"))} onChange={v => update("barcodeNumberFontFamily", v)} />
            </div>
            <div className="mt-2"><Label>Alineacion</Label><AlignButtons value={String(s("barcodeNumberAlign"))} onChange={v => update("barcodeNumberAlign", v)} /></div>
            <div className="flex gap-6 mt-3">
              <div className="flex items-center gap-2"><Switch checked={!!s("showBarcodeNumber")} onCheckedChange={v => update("showBarcodeNumber", v)} /><Label className="mb-0">Mostrar numero</Label></div>
            </div>
          </div>

          <div className="bg-white rounded-lg border p-4">
            <h3 className="font-semibold mb-3" style={{ color: "#1B3A5C" }}>Pie de Etiqueta</h3>
            <div className="grid grid-cols-2 gap-3">
              <StepperInput label="Tamano" value={String(s("footerFontSize"))} onChange={v => update("footerFontSize", v)} step={0.5} />
              <StepperInput label="Posicion Y" value={String(s("footerTop"))} onChange={v => update("footerTop", v)} step={0.5} />
              <div className="col-span-2"><Label>Texto</Label><Input value={String(s("footerText"))} onChange={e => update("footerText", e.target.value)} /></div>
              <FontSelector label="Tipo de letra" value={String(s("footerFontFamily"))} onChange={v => update("footerFontFamily", v)} />
            </div>
            <div className="mt-2"><Label>Alineacion</Label><AlignButtons value={String(s("footerTextAlign"))} onChange={v => update("footerTextAlign", v)} /></div>
            <div className="flex gap-6 mt-3">
              <div className="flex items-center gap-2"><Switch checked={!!s("showFooter")} onCheckedChange={v => update("showFooter", v)} /><Label className="mb-0">Mostrar footer</Label></div>
              <div className="flex items-center gap-2"><Switch checked={!!s("showDate")} onCheckedChange={v => update("showDate", v)} /><Label className="mb-0">Mostrar fecha</Label></div>
            </div>
          </div>
        </div>

        <div className="hidden lg:block">
          <div className="sticky top-4 bg-gray-100 rounded-lg border p-6 flex flex-col items-center">
            <h3 className="font-semibold mb-2" style={{ color: "#1B3A5C" }}>
              <Printer className="w-4 h-4 inline mr-1" /> Vista previa real (mismo motor que imprime)
            </h3>
            <p className="text-[11px] mb-4 text-center" style={{ color: "hsl(207 20% 45%)" }}>
              CODE128 escaneable · nombre hasta 2 lineas · rotacion {Number(s("rotation")) || 0}°
            </p>
            <div
              className="bg-white border shadow-sm"
              style={{
                width: String(s("labelWidth")),
                height: String(s("labelHeight")),
                overflow: "hidden",
              }}
            >
              <div ref={previewHostRef} />
            </div>
            <Button type="button" className="mt-4 gap-2" style={{ background: BRAND_RED }} onClick={handleTestPrint}>
              <Printer className="w-4 h-4" /> Probar en Zebra ZD411
            </Button>
            <div className="mt-4 text-sm text-gray-500 text-center">
              Guarda para que la pantalla <strong>Imprimir Etiquetas</strong> use este diseno.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
