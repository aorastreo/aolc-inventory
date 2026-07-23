import { useState, useEffect } from "react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Save, RotateCcw, Tag, Printer } from "lucide-react";
import { toast } from "sonner";

const BRAND_RED = "#B22234";

// Default config
const defaultConfig = {
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
};

export default function LabelConfigPage() {
  const utils = trpc.useUtils();
  const { data: savedConfig } = trpc.labelConfig.get.useQuery({ storeId: 1 });
  const upsertConfig = trpc.labelConfig.upsert.useMutation({
    onSuccess: () => {
      utils.labelConfig.get.invalidate();
      toast.success("Configuracion guardada");
    },
  });

  const [config, setConfig] = useState(defaultConfig);

  useEffect(() => {
    if (savedConfig) {
      setConfig({
        labelWidth: savedConfig.labelWidth || defaultConfig.labelWidth,
        labelHeight: savedConfig.labelHeight || defaultConfig.labelHeight,
        nameFontSize: savedConfig.nameFontSize || defaultConfig.nameFontSize,
        nameMarginTop: savedConfig.nameMarginTop || defaultConfig.nameMarginTop,
        nameMarginBottom: savedConfig.nameMarginBottom || defaultConfig.nameMarginBottom,
        priceFontSize: savedConfig.priceFontSize || defaultConfig.priceFontSize,
        ivaFontSize: savedConfig.ivaFontSize || defaultConfig.ivaFontSize,
        barcodeWidth: savedConfig.barcodeWidth || defaultConfig.barcodeWidth,
        barcodeHeight: savedConfig.barcodeHeight || defaultConfig.barcodeHeight,
        barcodeModuleWidth: savedConfig.barcodeModuleWidth || defaultConfig.barcodeModuleWidth,
        barcodeBarHeight: savedConfig.barcodeBarHeight || defaultConfig.barcodeBarHeight,
        barcodeNumberFontSize: savedConfig.barcodeNumberFontSize || defaultConfig.barcodeNumberFontSize,
        barcodeNumberLetterSpacing: savedConfig.barcodeNumberLetterSpacing || defaultConfig.barcodeNumberLetterSpacing,
        barcodeNumberMarginTop: savedConfig.barcodeNumberMarginTop || defaultConfig.barcodeNumberMarginTop,
        footerFontSize: savedConfig.footerFontSize || defaultConfig.footerFontSize,
        footerMarginTop: savedConfig.footerMarginTop || defaultConfig.footerMarginTop,
        showPrice: savedConfig.showPrice ?? true,
        showIva: savedConfig.showIva ?? true,
        showBarcode: savedConfig.showBarcode ?? true,
        showBarcodeNumber: savedConfig.showBarcodeNumber ?? true,
        showFooter: savedConfig.showFooter ?? true,
        showDate: savedConfig.showDate ?? true,
        footerText: savedConfig.footerText || defaultConfig.footerText,
      });
    }
  }, [savedConfig]);

  const handleSave = () => {
    upsertConfig.mutate({ storeId: 1, ...config });
  };

  const handleReset = () => {
    setConfig(defaultConfig);
    toast.info("Valores reseteados a default");
  };

  const update = (key: string, value: any) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  // Preview item
  const previewItem = {
    nombre: "CAJA ORGANIZADORA",
    precio: "1990",
    codigoBarras: "77001116",
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Tag className="w-6 h-6" style={{ color: BRAND_RED }} />
          <h1 className="text-2xl font-bold" style={{ color: "#1B3A5C" }}>Configuracion de Etiquetas</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleReset} className="gap-2">
            <RotateCcw className="w-4 h-4" /> Resetear
          </Button>
          <Button onClick={handleSave} className="gap-2" style={{ background: BRAND_RED }}>
            <Save className="w-4 h-4" /> Guardar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT: Controls */}
        <div className="space-y-4">
          {/* Dimensions */}
          <div className="bg-white rounded-lg border p-4">
            <h3 className="font-semibold mb-3" style={{ color: "#1B3A5C" }}>Dimensiones de la Etiqueta</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Ancho (mm)</Label>
                <Input value={config.labelWidth} onChange={(e) => update("labelWidth", e.target.value)} />
              </div>
              <div>
                <Label>Alto (mm)</Label>
                <Input value={config.labelHeight} onChange={(e) => update("labelHeight", e.target.value)} />
              </div>
            </div>
          </div>

          {/* Product Name */}
          <div className="bg-white rounded-lg border p-4">
            <h3 className="font-semibold mb-3" style={{ color: "#1B3A5C" }}>Nombre del Producto</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tamano fuente</Label>
                <Input value={config.nameFontSize} onChange={(e) => update("nameFontSize", e.target.value)} />
              </div>
              <div>
                <Label>Margin arriba</Label>
                <Input value={config.nameMarginTop} onChange={(e) => update("nameMarginTop", e.target.value)} />
              </div>
              <div>
                <Label>Margin abajo</Label>
                <Input value={config.nameMarginBottom} onChange={(e) => update("nameMarginBottom", e.target.value)} />
              </div>
            </div>
          </div>

          {/* Price */}
          <div className="bg-white rounded-lg border p-4">
            <h3 className="font-semibold mb-3" style={{ color: "#1B3A5C" }}>Precio</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tamano precio</Label>
                <Input value={config.priceFontSize} onChange={(e) => update("priceFontSize", e.target.value)} />
              </div>
              <div>
                <Label>Tamano IVA</Label>
                <Input value={config.ivaFontSize} onChange={(e) => update("ivaFontSize", e.target.value)} />
              </div>
            </div>
            <div className="flex gap-6 mt-3">
              <div className="flex items-center gap-2">
                <Switch checked={config.showPrice} onCheckedChange={(v) => update("showPrice", v)} />
                <Label className="mb-0">Mostrar precio</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={config.showIva} onCheckedChange={(v) => update("showIva", v)} />
                <Label className="mb-0">Mostrar IVA</Label>
              </div>
            </div>
          </div>

          {/* Barcode */}
          <div className="bg-white rounded-lg border p-4">
            <h3 className="font-semibold mb-3" style={{ color: "#1B3A5C" }}>Codigo de Barras</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Ancho SVG</Label>
                <Input value={config.barcodeWidth} onChange={(e) => update("barcodeWidth", e.target.value)} />
              </div>
              <div>
                <Label>Alto SVG</Label>
                <Input value={config.barcodeHeight} onChange={(e) => update("barcodeHeight", e.target.value)} />
              </div>
              <div>
                <Label>Ancho modulo</Label>
                <Input value={config.barcodeModuleWidth} onChange={(e) => update("barcodeModuleWidth", e.target.value)} />
              </div>
              <div>
                <Label>Alto barras</Label>
                <Input value={config.barcodeBarHeight} onChange={(e) => update("barcodeBarHeight", e.target.value)} />
              </div>
            </div>
            <div className="flex gap-6 mt-3">
              <div className="flex items-center gap-2">
                <Switch checked={config.showBarcode} onCheckedChange={(v) => update("showBarcode", v)} />
                <Label className="mb-0">Mostrar barras</Label>
              </div>
            </div>
          </div>

          {/* Barcode Number */}
          <div className="bg-white rounded-lg border p-4">
            <h3 className="font-semibold mb-3" style={{ color: "#1B3A5C" }}>Numero del Codigo</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tamano fuente</Label>
                <Input value={config.barcodeNumberFontSize} onChange={(e) => update("barcodeNumberFontSize", e.target.value)} />
              </div>
              <div>
                <Label>Espaciado</Label>
                <Input value={config.barcodeNumberLetterSpacing} onChange={(e) => update("barcodeNumberLetterSpacing", e.target.value)} />
              </div>
              <div>
                <Label>Margin arriba</Label>
                <Input value={config.barcodeNumberMarginTop} onChange={(e) => update("barcodeNumberMarginTop", e.target.value)} />
              </div>
            </div>
            <div className="flex gap-6 mt-3">
              <div className="flex items-center gap-2">
                <Switch checked={config.showBarcodeNumber} onCheckedChange={(v) => update("showBarcodeNumber", v)} />
                <Label className="mb-0">Mostrar numero</Label>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-white rounded-lg border p-4">
            <h3 className="font-semibold mb-3" style={{ color: "#1B3A5C" }}>Pie de Etiqueta</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tamano fuente</Label>
                <Input value={config.footerFontSize} onChange={(e) => update("footerFontSize", e.target.value)} />
              </div>
              <div>
                <Label>Margin arriba</Label>
                <Input value={config.footerMarginTop} onChange={(e) => update("footerMarginTop", e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label>Texto del footer</Label>
                <Input value={config.footerText} onChange={(e) => update("footerText", e.target.value)} />
              </div>
            </div>
            <div className="flex gap-6 mt-3">
              <div className="flex items-center gap-2">
                <Switch checked={config.showFooter} onCheckedChange={(v) => update("showFooter", v)} />
                <Label className="mb-0">Mostrar footer</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={config.showDate} onCheckedChange={(v) => update("showDate", v)} />
                <Label className="mb-0">Mostrar fecha</Label>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: Preview */}
        <div className="bg-gray-100 rounded-lg border p-6 flex flex-col items-center">
          <h3 className="font-semibold mb-4" style={{ color: "#1B3A5C" }}>
            <Printer className="w-4 h-4 inline mr-1" /> Vista Previa
          </h3>
          <div
            className="bg-white border border-gray-300"
            style={{
              width: config.labelWidth,
              height: config.labelHeight,
              padding: "0.5mm 1mm",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "flex-start",
              textAlign: "center",
              fontFamily: "Arial Narrow, Arial, Helvetica, sans-serif",
              boxSizing: "border-box",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                fontSize: config.nameFontSize,
                fontWeight: "bold",
                color: "#000",
                textTransform: "uppercase",
                letterSpacing: "0.2px",
                lineHeight: 1.1,
                marginTop: config.nameMarginTop,
                marginBottom: config.nameMarginBottom,
                whiteSpace: "nowrap",
                overflow: "hidden",
                width: "100%",
              }}
            >
              {previewItem.nombre}
            </div>
            {config.showPrice && (
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: "1.5mm", margin: "0.2mm 0" }}>
                <span style={{ fontSize: config.priceFontSize, fontWeight: "bold", color: "#000", letterSpacing: "0.5px", lineHeight: 1 }}>
                  {previewItem.precio}
                </span>
                {config.showIva && (
                  <span style={{ fontSize: config.ivaFontSize, fontWeight: "bold", color: "#000" }}>IVA</span>
                )}
              </div>
            )}
            {config.showBarcode && (
              <svg
                viewBox="0 0 100 20"
                preserveAspectRatio="xMidYMid meet"
                style={{ width: config.barcodeWidth, height: config.barcodeHeight, margin: "0.5mm auto 0", display: "block" }}
              >
                <rect x="5" y="0" width="3" height="20" fill="#000" />
                <rect x="10" y="0" width="1" height="20" fill="#000" />
                <rect x="13" y="0" width="4" height="20" fill="#000" />
                <rect x="19" y="0" width="2" height="20" fill="#000" />
                <rect x="23" y="0" width="1" height="20" fill="#000" />
                <rect x="26" y="0" width="5" height="20" fill="#000" />
                <rect x="33" y="0" width="2" height="20" fill="#000" />
                <rect x="37" y="0" width="3" height="20" fill="#000" />
                <rect x="42" y="0" width="1" height="20" fill="#000" />
                <rect x="45" y="0" width="4" height="20" fill="#000" />
                <rect x="51" y="0" width="2" height="20" fill="#000" />
                <rect x="55" y="0" width="3" height="20" fill="#000" />
                <rect x="60" y="0" width="1" height="20" fill="#000" />
                <rect x="63" y="0" width="5" height="20" fill="#000" />
                <rect x="70" y="0" width="2" height="20" fill="#000" />
                <rect x="74" y="0" width="3" height="20" fill="#000" />
                <rect x="79" y="0" width="4" height="20" fill="#000" />
                <rect x="85" y="0" width="2" height="20" fill="#000" />
                <rect x="90" y="0" width="5" height="20" fill="#000" />
              </svg>
            )}
            {config.showBarcodeNumber && (
              <div
                style={{
                  fontSize: config.barcodeNumberFontSize,
                  color: "#000",
                  letterSpacing: config.barcodeNumberLetterSpacing,
                  fontFamily: "Courier New, Courier, monospace",
                  marginTop: config.barcodeNumberMarginTop,
                  whiteSpace: "nowrap",
                }}
              >
                {previewItem.codigoBarras}
              </div>
            )}
            {config.showFooter && (
              <div
                style={{
                  fontSize: config.footerFontSize,
                  color: "#000",
                  marginTop: config.footerMarginTop,
                  letterSpacing: "0.2px",
                  fontFamily: "Arial Narrow, Arial, sans-serif",
                  whiteSpace: "nowrap",
                }}
              >
                {config.showDate ? "2026-07-23 - " : ""}
                {config.footerText}
              </div>
            )}
          </div>

          <div className="mt-4 text-sm text-gray-500 text-center">
            Ajusta los valores a la izquierda y ve los cambios en tiempo real.
            <br />
            Cuando quede a tu gusto, guarda la configuracion.
          </div>
        </div>
      </div>
    </div>
  );
}
