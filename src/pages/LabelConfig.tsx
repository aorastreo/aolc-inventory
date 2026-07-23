import { useState, useEffect } from "react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Save, RotateCcw, Tag, Printer, AlignLeft, AlignCenter, AlignRight, Minus, Plus } from "lucide-react";
import { toast } from "sonner";

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
        <Button variant="outline" size="sm" className="h-8 w-8 p-0 flex-shrink-0" onClick={dec}><Minus className="w-3 h-3" /></Button>
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-8 text-center text-sm px-1" />
        <Button variant="outline" size="sm" className="h-8 w-8 p-0 flex-shrink-0" onClick={inc}><Plus className="w-3 h-3" /></Button>
      </div>
    </div>
  );
}

function AlignButtons({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const opts = [{ v: "left", Icon: AlignLeft }, { v: "center", Icon: AlignCenter }, { v: "right", Icon: AlignRight }];
  return (
    <div className="flex gap-1">
      {opts.map(({ v, Icon }) => (
        <Button key={v} variant={value === v ? "default" : "outline"} size="sm" className="h-8 w-8 p-0" onClick={() => onChange(v)}><Icon className="w-4 h-4" /></Button>
      ))}
    </div>
  );
}

const defaultConfig: Record<string, any> = {
  labelWidth: "50mm", labelHeight: "25mm",
  nameFontSize: "5pt", nameTop: "1mm", nameTextAlign: "center",
  priceFontSize: "20pt", ivaFontSize: "8pt", priceTop: "6mm", priceTextAlign: "center",
  barcodeWidth: "35mm", barcodeHeight: "7.5mm", barcodeModuleWidth: "0.50", barcodeBarHeight: "9", barcodeTop: "12mm", barcodeAlign: "center",
  barcodeNumberFontSize: "8pt", barcodeNumberLetterSpacing: "2px", barcodeNumberTop: "17mm", barcodeNumberAlign: "center",
  footerFontSize: "5pt", footerTop: "20mm", footerTextAlign: "center",
  showPrice: true, showIva: true, showBarcode: true, showBarcodeNumber: true, showFooter: true, showDate: true,
  footerText: "American Outlet Los Chiles",
};

export default function LabelConfigPage() {
  const utils = trpc.useUtils();
  const { data: savedConfig } = trpc.labelConfig.get.useQuery({ storeId: 1 });
  const upsertConfig = trpc.labelConfig.upsert.useMutation({ onSuccess: () => { utils.labelConfig.get.invalidate(); toast.success("Configuracion guardada"); } });
  const [config, setConfig] = useState<Record<string, any>>({ ...defaultConfig });

  useEffect(() => {
    if (savedConfig) {
      const merged: Record<string, any> = {};
      for (const key of Object.keys(defaultConfig)) merged[key] = (savedConfig as any)[key] ?? defaultConfig[key];
      setConfig(merged);
    }
  }, [savedConfig]);

  const update = (key: string, value: any) => setConfig(p => ({ ...p, [key]: value }));
  const s = (k: string) => config[k] ?? defaultConfig[k];
  const previewItem = { nombre: "CAJA ORGANIZADORA", precio: "1990", codigoBarras: "77001116" };

  const alignStyle = (align: string) => align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Tag className="w-6 h-6" style={{ color: BRAND_RED }} />
          <h1 className="text-2xl font-bold" style={{ color: "#1B3A5C" }}>Configuracion de Etiquetas</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setConfig({ ...defaultConfig }); toast.info("Reseteado"); }} className="gap-2"><RotateCcw className="w-4 h-4" /> Resetear</Button>
          <Button onClick={() => upsertConfig.mutate({ storeId: 1, ...config })} className="gap-2" style={{ background: BRAND_RED }}><Save className="w-4 h-4" /> Guardar</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT: Controls */}
        <div className="space-y-4">
          <div className="bg-white rounded-lg border p-4">
            <h3 className="font-semibold mb-3" style={{ color: "#1B3A5C" }}>Dimensiones</h3>
            <div className="grid grid-cols-2 gap-3">
              <StepperInput label="Ancho" value={s("labelWidth")} onChange={v => update("labelWidth", v)} step={1} />
              <StepperInput label="Alto" value={s("labelHeight")} onChange={v => update("labelHeight", v)} step={1} />
            </div>
          </div>

          <div className="bg-white rounded-lg border p-4">
            <h3 className="font-semibold mb-3" style={{ color: "#1B3A5C" }}>Nombre del Producto</h3>
            <div className="grid grid-cols-3 gap-3">
              <StepperInput label="Tamano fuente" value={s("nameFontSize")} onChange={v => update("nameFontSize", v)} step={0.5} />
              <StepperInput label="Posicion Y (arriba)" value={s("nameTop")} onChange={v => update("nameTop", v)} step={0.5} />
            </div>
            <div className="mt-2"><Label>Alineacion</Label><AlignButtons value={s("nameTextAlign")} onChange={v => update("nameTextAlign", v)} /></div>
          </div>

          <div className="bg-white rounded-lg border p-4">
            <h3 className="font-semibold mb-3" style={{ color: "#1B3A5C" }}>Precio</h3>
            <div className="grid grid-cols-3 gap-3">
              <StepperInput label="Tamano precio" value={s("priceFontSize")} onChange={v => update("priceFontSize", v)} step={1} />
              <StepperInput label="Tamano IVA" value={s("ivaFontSize")} onChange={v => update("ivaFontSize", v)} step={1} />
              <StepperInput label="Posicion Y" value={s("priceTop")} onChange={v => update("priceTop", v)} step={0.5} />
            </div>
            <div className="mt-2"><Label>Alineacion</Label><AlignButtons value={s("priceTextAlign")} onChange={v => update("priceTextAlign", v)} /></div>
            <div className="flex gap-6 mt-3">
              <div className="flex items-center gap-2"><Switch checked={s("showPrice")} onCheckedChange={v => update("showPrice", v)} /><Label className="mb-0">Mostrar precio</Label></div>
              <div className="flex items-center gap-2"><Switch checked={s("showIva")} onCheckedChange={v => update("showIva", v)} /><Label className="mb-0">Mostrar IVA</Label></div>
            </div>
          </div>

          <div className="bg-white rounded-lg border p-4">
            <h3 className="font-semibold mb-3" style={{ color: "#1B3A5C" }}>Codigo de Barras</h3>
            <div className="grid grid-cols-3 gap-3">
              <StepperInput label="Ancho SVG" value={s("barcodeWidth")} onChange={v => update("barcodeWidth", v)} step={1} />
              <StepperInput label="Alto SVG" value={s("barcodeHeight")} onChange={v => update("barcodeHeight", v)} step={0.5} />
              <StepperInput label="Ancho modulo" value={s("barcodeModuleWidth")} onChange={v => update("barcodeModuleWidth", v)} step={0.05} />
              <StepperInput label="Alto barras" value={s("barcodeBarHeight")} onChange={v => update("barcodeBarHeight", v)} step={1} />
              <StepperInput label="Posicion Y" value={s("barcodeTop")} onChange={v => update("barcodeTop", v)} step={0.5} />
            </div>
            <div className="mt-2"><Label>Alineacion</Label><AlignButtons value={s("barcodeAlign")} onChange={v => update("barcodeAlign", v)} /></div>
            <div className="flex gap-6 mt-3">
              <div className="flex items-center gap-2"><Switch checked={s("showBarcode")} onCheckedChange={v => update("showBarcode", v)} /><Label className="mb-0">Mostrar barras</Label></div>
            </div>
          </div>

          <div className="bg-white rounded-lg border p-4">
            <h3 className="font-semibold mb-3" style={{ color: "#1B3A5C" }}>Numero del Codigo</h3>
            <div className="grid grid-cols-3 gap-3">
              <StepperInput label="Tamano" value={s("barcodeNumberFontSize")} onChange={v => update("barcodeNumberFontSize", v)} step={0.5} />
              <StepperInput label="Espaciado" value={s("barcodeNumberLetterSpacing")} onChange={v => update("barcodeNumberLetterSpacing", v)} step={0.5} />
              <StepperInput label="Posicion Y" value={s("barcodeNumberTop")} onChange={v => update("barcodeNumberTop", v)} step={0.5} />
            </div>
            <div className="mt-2"><Label>Alineacion</Label><AlignButtons value={s("barcodeNumberAlign")} onChange={v => update("barcodeNumberAlign", v)} /></div>
            <div className="flex gap-6 mt-3">
              <div className="flex items-center gap-2"><Switch checked={s("showBarcodeNumber")} onCheckedChange={v => update("showBarcodeNumber", v)} /><Label className="mb-0">Mostrar numero</Label></div>
            </div>
          </div>

          <div className="bg-white rounded-lg border p-4">
            <h3 className="font-semibold mb-3" style={{ color: "#1B3A5C" }}>Pie de Etiqueta</h3>
            <div className="grid grid-cols-3 gap-3">
              <StepperInput label="Tamano" value={s("footerFontSize")} onChange={v => update("footerFontSize", v)} step={0.5} />
              <StepperInput label="Posicion Y" value={s("footerTop")} onChange={v => update("footerTop", v)} step={0.5} />
              <div className="col-span-2"><Label>Texto</Label><Input value={s("footerText")} onChange={e => update("footerText", e.target.value)} /></div>
            </div>
            <div className="mt-2"><Label>Alineacion</Label><AlignButtons value={s("footerTextAlign")} onChange={v => update("footerTextAlign", v)} /></div>
            <div className="flex gap-6 mt-3">
              <div className="flex items-center gap-2"><Switch checked={s("showFooter")} onCheckedChange={v => update("showFooter", v)} /><Label className="mb-0">Mostrar footer</Label></div>
              <div className="flex items-center gap-2"><Switch checked={s("showDate")} onCheckedChange={v => update("showDate", v)} /><Label className="mb-0">Mostrar fecha</Label></div>
            </div>
          </div>
        </div>

        {/* RIGHT: Sticky Preview */}
        <div className="hidden lg:block">
          <div className="sticky top-4 bg-gray-100 rounded-lg border p-6 flex flex-col items-center">
            <h3 className="font-semibold mb-4" style={{ color: "#1B3A5C" }}><Printer className="w-4 h-4 inline mr-1" /> Vista Previa</h3>
            <div
              style={{
                width: s("labelWidth"), height: s("labelHeight"), padding: 0,
                position: "relative", background: "white", border: "1px solid #ccc",
                boxSizing: "border-box", fontFamily: "Arial Narrow, Arial, Helvetica, sans-serif",
                overflow: "hidden",
              }}
            >
              {/* Name */}
              <div style={{
                position: "absolute", top: s("nameTop"), left: "1mm", right: "1mm",
                fontSize: s("nameFontSize"), fontWeight: "bold", color: "#000",
                textTransform: "uppercase", letterSpacing: "0.2px", lineHeight: 1.3,
                textAlign: s("nameTextAlign") as any, whiteSpace: "nowrap", overflow: "hidden",
              }}>{previewItem.nombre}</div>

              {/* Price */}
              {s("showPrice") && (
                <div style={{
                  position: "absolute", top: s("priceTop"), left: "1mm", right: "1mm",
                  display: "flex", alignItems: "baseline", justifyContent: alignStyle(s("priceTextAlign")), gap: "1.5mm",
                }}>
                  <span style={{ fontSize: s("priceFontSize"), fontWeight: "bold", color: "#000", letterSpacing: "0.5px", lineHeight: 1 }}>{previewItem.precio}</span>
                  {s("showIva") && <span style={{ fontSize: s("ivaFontSize"), fontWeight: "bold", color: "#000" }}>IVA</span>}
                </div>
              )}

              {/* Barcode */}
              {s("showBarcode") && (
                <div style={{ position: "absolute", top: s("barcodeTop"), left: "1mm", right: "1mm", textAlign: s("barcodeAlign") as any }}>
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

              {/* Barcode Number */}
              {s("showBarcodeNumber") && (
                <div style={{
                  position: "absolute", top: s("barcodeNumberTop"), left: "1mm", right: "1mm",
                  fontSize: s("barcodeNumberFontSize"), color: "#000",
                  letterSpacing: s("barcodeNumberLetterSpacing"), fontFamily: "Courier New, Courier, monospace",
                  textAlign: s("barcodeNumberAlign") as any, whiteSpace: "nowrap",
                }}>{previewItem.codigoBarras}</div>
              )}

              {/* Footer */}
              {s("showFooter") && (
                <div style={{
                  position: "absolute", top: s("footerTop"), left: "1mm", right: "1mm",
                  fontSize: s("footerFontSize"), color: "#000",
                  letterSpacing: "0.2px", fontFamily: "Arial Narrow, Arial, sans-serif",
                  textAlign: s("footerTextAlign") as any, whiteSpace: "nowrap",
                }}>
                  {s("showDate") ? "2026-07-23 - " : ""}{s("footerText")}
                </div>
              )}
            </div>
            <div className="mt-4 text-sm text-gray-500 text-center">
              Cada elemento tiene su <strong>Posicion Y</strong> independiente.<br />
              Mover uno no afecta los demas.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
