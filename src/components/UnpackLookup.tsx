import { trpc } from "@/providers/trpc";
import { useActiveStore } from "@/hooks/useActiveStore";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Search, Link2, Camera, Barcode, Hash, Package, Sparkles,
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
  const fileRef = useRef<HTMLInputElement>(null);

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
  }) => {
    setError(null);
    if (res.note) setNote(res.note);
    if (res.precioMismo != null && res.precioMenos20 != null && res.precioUnPocoMas != null) {
      setBand({
        mismo: res.precioMismo,
        menos20: res.precioMenos20,
        unPocoMas: res.precioUnPocoMas,
      });
    }
    onChange({
      ...value,
      nombre: res.nombre || value.nombre,
      precio: res.precioSugeridoCrc != null ? String(res.precioSugeridoCrc) : value.precio,
      codigo: res.codigoPosible || value.codigo,
      precioRefUsd: res.usd != null ? String(res.usd) : value.precioRefUsd,
      sourceUrl: res.sourceUrl || value.sourceUrl,
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
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
      suggestPhoto.mutate({ imageBase64: base64, mimeType: file.type || "image/jpeg" });
    };
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
      )}

      {mode === "foto" && (
        <div>
          <Label className="text-xs">Foto del articulo (caja o producto)</Label>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => onPhotoSelected(e.target.files?.[0] || null)}
          />
          <Button
            type="button"
            variant="outline"
            className="mt-1 w-full"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            style={{ color: BRAND_BLUE, borderColor: "hsl(210 20% 88%)" }}
          >
            <Camera className="w-4 h-4 mr-2" />
            {suggestPhoto.isPending ? "Analizando foto..." : "Tomar / subir foto"}
          </Button>
          <p className="text-[10px] mt-1" style={{ color: "hsl(207 20% 55%)" }}>
            Requiere OPENAI_API_KEY en el servidor. La sugerencia es referencia USA → outlet; confirma el precio.
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
