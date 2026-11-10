import { trpc } from "@/providers/trpc";
import { useActiveStore } from "@/hooks/useActiveStore";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Search, Link2, Camera, Barcode, Hash, Package, Sparkles, ImagePlus,
} from "lucide-react";
import { useRef, useState } from "react";

const BRAND_RED = "#B22234";
const BRAND_BLUE = "#1B3A5C";

export type UnpackFields = {
  nombre: string;
  precio: string;
  cantidad: number;
  codigoBarras: string;
  codigo: string;
  costo: string;
  precioRefUsd: string;
  sourceUrl: string;
};

type Mode = "nombre" | "codigo" | "barcode" | "link" | "foto" | "usd";

type Props = {
  value: UnpackFields;
  onChange: (next: UnpackFields) => void;
};

export default function UnpackLookup({ value, onChange }: Props) {
  const { storeId } = useActiveStore();
  const [mode, setMode] = useState<Mode>("nombre");
  const [query, setQuery] = useState("");
  const [link, setLink] = useState("");
  const [usdManual, setUsdManual] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const lookupMode =
    mode === "codigo" ? "codigo" as const
      : mode === "barcode" ? "barcode" as const
        : mode === "nombre" ? "nombre" as const
          : "auto" as const;

  const { data: hits, isFetching: lookingUp } = trpc.inventory.lookupProduct.useQuery(
    { storeId, query: query.trim() || value.nombre || value.codigo || value.codigoBarras, mode: lookupMode },
    {
      enabled:
        (mode === "nombre" || mode === "codigo" || mode === "barcode")
        && (query.trim().length >= 2 || value.nombre.length >= 2 || value.codigo.length >= 2 || value.codigoBarras.length >= 2),
    },
  );

  const [band, setBand] = useState<{
    mismo: number;
    menos20: number;
    unPocoMas: number;
  } | null>(null);
  const [referencias, setReferencias] = useState<Array<{
    sitio: string;
    precioUsd: number | null;
    url: string | null;
    nota?: string | null;
  }>>([]);
  const [fuentePrincipal, setFuentePrincipal] = useState<string | null>(null);

  const applySuggestion = (res: {
    nombre?: string | null;
    usd?: number | null;
    precioSugeridoCrc?: number | null;
    precioMismo?: number | null;
    precioMenos20?: number | null;
    precioUnPocoMas?: number | null;
    codigoPosible?: string | null;
    note?: string;
    sourceUrl?: string;
    referencias?: Array<{ sitio: string; precioUsd: number | null; url: string | null; nota?: string | null }>;
    fuentePrincipal?: string | null;
  }) => {
    setError(null);
    if (res.note) setNote(res.note);
    setReferencias(res.referencias || []);
    setFuentePrincipal(res.fuentePrincipal || null);
    if (res.precioMismo != null && res.precioMenos20 != null && res.precioUnPocoMas != null) {
      setBand({
        mismo: res.precioMismo,
        menos20: res.precioMenos20,
        unPocoMas: res.precioUnPocoMas,
      });
    }
    const primaryRefUrl = res.referencias?.find((r) => r.url)?.url;
    onChange({
      ...value,
      nombre: res.nombre || value.nombre,
      precio: res.precioSugeridoCrc != null ? String(res.precioSugeridoCrc) : value.precio,
      codigo: res.codigoPosible || value.codigo,
      precioRefUsd: res.usd != null ? String(res.usd) : value.precioRefUsd,
      sourceUrl: res.sourceUrl || primaryRefUrl || value.sourceUrl,
    });
  };

  const suggestLink = trpc.inventory.suggestPriceFromLink.useMutation({
    onSuccess: (res) => applySuggestion({ ...res, sourceUrl: link.trim() }),
    onError: (e) => setError(e.message),
  });

  const suggestPhoto = trpc.inventory.suggestPriceFromPhoto.useMutation({
    onSuccess: (res) => applySuggestion(res),
    onError: (e) => setError(e.message),
  });

  const suggestUsd = trpc.inventory.suggestPriceFromUsd.useMutation({
    onSuccess: (res) => applySuggestion(res),
    onError: (e) => setError(e.message),
  });

  const applyHit = (hit: { nombre: string; precio: number; codigoBarras: string | null; codigo: string | null }) => {
    onChange({
      ...value,
      nombre: hit.nombre,
      precio: String(hit.precio),
      codigoBarras: hit.codigoBarras || value.codigoBarras,
      codigo: hit.codigo || value.codigo,
    });
    setQuery(hit.nombre);
    setNote(`Desde historial (${hit.codigo ? "codigo" : hit.codigoBarras ? "barras" : "nombre"})`);
  };

  const onPhotoSelected = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Selecciona una imagen (jpg, png, etc.)");
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      setPhotoPreview(dataUrl);
      const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
      suggestPhoto.mutate({ imageBase64: base64, mimeType: file.type || "image/jpeg" });
    };
    reader.onerror = () => setError("No se pudo leer la imagen");
    reader.readAsDataURL(file);
  };

  const tabs: { id: Mode; label: string; icon: typeof Search }[] = [
    { id: "nombre", label: "Nombre", icon: Search },
    { id: "codigo", label: "Codigo", icon: Hash },
    { id: "barcode", label: "Barras", icon: Barcode },
    { id: "link", label: "Link", icon: Link2 },
    { id: "foto", label: "Foto", icon: Camera },
    { id: "usd", label: "USD", icon: Sparkles },
  ];

  const busy = suggestLink.isPending || suggestPhoto.isPending || suggestUsd.isPending;

  return (
    <div className="space-y-3 rounded-lg border p-3" style={{ borderColor: "hsl(210 20% 90%)", background: "hsl(0 0% 99%)" }}>
      <div className="flex flex-wrap gap-1.5">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = mode === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => { setMode(t.id); setError(null); setNote(null); }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold border transition-colors"
              style={{
                background: active ? "rgba(178,34,52,0.1)" : "white",
                color: active ? BRAND_RED : BRAND_BLUE,
                borderColor: active ? "rgba(178,34,52,0.35)" : "hsl(210 20% 88%)",
              }}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {(mode === "nombre" || mode === "codigo" || mode === "barcode") && (
        <div>
          <Label className="text-xs">
            {mode === "nombre" && "Buscar por nombre"}
            {mode === "codigo" && "Codigo de articulo (Costway / caja / manual)"}
            {mode === "barcode" && "Codigo de barras"}
          </Label>
          <div className="flex gap-2 mt-1">
            <Input
              value={query}
              placeholder={
                mode === "codigo" ? "Ej: CW12345 / SKU de la caja"
                  : mode === "barcode" ? "Escanea o pega el codigo de barras"
                    : "Escribe el nombre..."
              }
              onChange={(e) => {
                const v = e.target.value;
                setQuery(v);
                if (mode === "nombre") onChange({ ...value, nombre: v });
                if (mode === "codigo") onChange({ ...value, codigo: v });
                if (mode === "barcode") onChange({ ...value, codigoBarras: v });
              }}
              className="flex-1"
            />
          </div>
          {lookingUp && <p className="text-xs mt-1" style={{ color: "hsl(207 20% 55%)" }}>Buscando...</p>}
          {!!hits?.length && (
            <div className="mt-2 rounded-md border overflow-hidden bg-white" style={{ borderColor: "hsl(210 20% 90%)" }}>
              {hits.map((hit) => (
                <button
                  key={hit.id}
                  type="button"
                  className="w-full text-left px-3 py-2 border-t first:border-t-0 hover:bg-gray-50 flex items-center gap-2"
                  style={{ borderColor: "hsl(210 20% 94%)" }}
                  onClick={() => applyHit(hit)}
                >
                  <Package className="w-4 h-4 shrink-0" style={{ color: "hsl(207 20% 55%)" }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{hit.nombre}</p>
                    <p className="text-[10px]" style={{ color: "hsl(207 20% 55%)" }}>
                      match: {hit.match}
                      {hit.codigo ? ` · cod ${hit.codigo}` : ""}
                      {hit.codigoBarras ? ` · ${hit.codigoBarras}` : ""}
                    </p>
                  </div>
                  <span className="text-xs font-bold" style={{ color: BRAND_RED }}>
                    ₡{hit.precio.toLocaleString("es-CR")}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {mode === "link" && (
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Pegar link Amazon / Target / Costway / etc.</Label>
            <div className="flex gap-2 mt-1">
              <Input
                value={link}
                placeholder="https://..."
                onChange={(e) => setLink(e.target.value)}
                className="flex-1 font-mono text-xs"
              />
              <Button
                type="button"
                disabled={busy || !link.trim()}
                onClick={() => suggestLink.mutate({ url: link.trim() })}
                style={{ background: BRAND_RED }}
              >
                {suggestLink.isPending ? "..." : "Sugerir"}
              </Button>
            </div>
          </div>
          <div className="rounded-md border p-3 space-y-2" style={{ borderColor: "hsl(210 20% 90%)", background: "white" }}>
            <p className="text-[11px] font-medium" style={{ color: BRAND_BLUE }}>
              Si el link no trae precio (muy comun en Amazon/Costway), pega el $ que ves en la pagina:
            </p>
            <div className="flex gap-2">
              <Input
                type="number"
                step="0.01"
                value={usdManual}
                placeholder="Ej: 29.99"
                onChange={(e) => setUsdManual(e.target.value)}
              />
              <Button
                type="button"
                disabled={busy || !Number(usdManual)}
                onClick={() => {
                  onChange({ ...value, sourceUrl: link.trim() || value.sourceUrl });
                  suggestUsd.mutate({ usd: Number(usdManual) });
                }}
                style={{ background: BRAND_RED }}
              >
                Convertir
              </Button>
            </div>
          </div>
        </div>
      )}

      {mode === "foto" && (
        <div className="space-y-2">
          <Label className="text-xs">Foto del articulo (caja o producto)</Label>
          {/* Cámara — capture fuerza la cámara en móvil */}
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              onPhotoSelected(e.target.files?.[0] || null);
              e.target.value = "";
            }}
          />
          {/* Galería / archivos — sin capture para poder cargar */}
          <input
            ref={uploadRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              onPhotoSelected(e.target.files?.[0] || null);
              e.target.value = "";
            }}
          />
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              className="w-full h-11"
              disabled={busy}
              onClick={() => cameraRef.current?.click()}
              style={{ color: BRAND_BLUE, borderColor: "hsl(210 20% 88%)" }}
            >
              <Camera className="w-4 h-4 mr-2" />
              Tomar foto
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full h-11"
              disabled={busy}
              onClick={() => uploadRef.current?.click()}
              style={{ color: BRAND_BLUE, borderColor: "hsl(210 20% 88%)" }}
            >
              <ImagePlus className="w-4 h-4 mr-2" />
              Cargar foto
            </Button>
          </div>
          {suggestPhoto.isPending && (
            <p className="text-xs font-medium" style={{ color: BRAND_BLUE }}>Analizando foto...</p>
          )}
          {photoPreview && (
            <div className="rounded-md border overflow-hidden" style={{ borderColor: "hsl(210 20% 90%)" }}>
              <img src={photoPreview} alt="Vista previa" className="max-h-40 w-full object-contain bg-white" />
            </div>
          )}
          <p className="text-[10px]" style={{ color: "hsl(207 20% 55%)" }}>
            En el celular: “Tomar foto” abre la cámara; “Cargar foto” abre la galería. Confirma siempre el precio.
          </p>
        </div>
      )}

      {mode === "usd" && (
        <div>
          <Label className="text-xs">Precio USA visto ($)</Label>
          <div className="flex gap-2 mt-1">
            <Input
              type="number"
              step="0.01"
              value={usdManual}
              placeholder="29.99"
              onChange={(e) => setUsdManual(e.target.value)}
            />
            <Button
              type="button"
              disabled={busy || !Number(usdManual)}
              onClick={() => suggestUsd.mutate({ usd: Number(usdManual) })}
              style={{ background: BRAND_RED }}
            >
              Convertir
            </Button>
          </div>
        </div>
      )}

      {band && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => onChange({ ...value, precio: String(band.menos20) })} style={{ borderColor: "hsl(210 20% 88%)", color: BRAND_BLUE }}>
            -20%: ₡{band.menos20.toLocaleString("es-CR")}
          </Button>
          <Button type="button" size="sm" onClick={() => onChange({ ...value, precio: String(band.mismo) })} style={{ background: BRAND_RED }}>
            Mismo USA: ₡{band.mismo.toLocaleString("es-CR")}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => onChange({ ...value, precio: String(band.unPocoMas) })} style={{ borderColor: "hsl(210 20% 88%)", color: BRAND_BLUE }}>
            +10%: ₡{band.unPocoMas.toLocaleString("es-CR")}
          </Button>
        </div>
      )}

      {referencias.filter((r) => !!r.url).length > 0 && (
        <div className="rounded-md border p-3 space-y-2" style={{ borderColor: "hsl(210 20% 90%)", background: "white" }}>
          <p className="text-xs font-semibold" style={{ color: BRAND_BLUE }}>
            Links para revisar el precio
            {fuentePrincipal ? ` (${fuentePrincipal})` : ""}
          </p>
          <div className="space-y-2">
            {referencias.filter((r) => !!r.url).map((r) => (
              <a
                key={`${r.sitio}-${r.url}`}
                href={r.url!}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-md border px-3 py-2 hover:bg-gray-50 transition-colors"
                style={{ borderColor: "hsl(210 20% 90%)" }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold" style={{ color: BRAND_RED }}>{r.sitio}</span>
                  {r.precioUsd != null && (
                    <span className="text-xs font-bold" style={{ color: BRAND_BLUE }}>~${r.precioUsd}</span>
                  )}
                </div>
                <p className="text-[11px] mt-1 break-all underline" style={{ color: BRAND_BLUE }}>
                  {r.url}
                </p>
              </a>
            ))}
          </div>
        </div>
      )}

      {note && (
        <p className="text-xs rounded-md px-2 py-1.5" style={{ background: "rgba(27,58,92,0.08)", color: BRAND_BLUE }}>
          {note} Mira el semáforo del contenedor: si vas en rojo, prefiere “Mismo” o “+10%”.
        </p>
      )}
      {error && (
        <p className="text-xs rounded-md px-2 py-1.5" style={{ background: "rgba(178,34,52,0.1)", color: BRAND_RED }}>
          {error}
        </p>
      )}
    </div>
  );
}
