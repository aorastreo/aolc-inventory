import { trpc } from "@/providers/trpc";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Package, AlertTriangle } from "lucide-react";
import { useState, useRef, useEffect } from "react";

const BRAND_RED = "#B22234";

interface ProductAutocompleteProps {
  nombre: string;
  precio: string;
  codigoBarras: string;
  cantidad: number;
  onChange: (fields: { nombre: string; precio: string; codigoBarras: string; cantidad: number }) => void;
  label?: string;
}

export default function ProductAutocomplete({
  nombre, precio, codigoBarras, cantidad, onChange, label = "Nombre del Articulo",
}: ProductAutocompleteProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState(-1);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: suggestions } = trpc.inventory.searchProductsSimilar.useQuery(
    { storeId: 1, query: nombre },
    { enabled: nombre.length >= 2 }
  );

  const activeSuggestions = suggestions || [];

  const handleSelect = (item: { nombre: string; precio: number; codigoBarras: string | null }) => {
    onChange({
      nombre: item.nombre,
      precio: String(item.precio),
      codigoBarras: item.codigoBarras || "",
      cantidad,
    });
    setShowSuggestions(false);
    setSelectedSuggestion(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedSuggestion((prev) => Math.min(prev + 1, activeSuggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedSuggestion((prev) => Math.max(prev - 1, -1));
    } else if (e.key === "Enter" && selectedSuggestion >= 0) {
      e.preventDefault();
      const item = activeSuggestions[selectedSuggestion];
      if (item) handleSelect(item);
    }
  };

  return (
    <div className="relative">
      <Label>{label}</Label>
      <Input
        ref={inputRef}
        placeholder="Escribe el nombre..."
        value={nombre}
        onChange={(e) => {
          onChange({ nombre: e.target.value, precio, codigoBarras, cantidad });
          setShowSuggestions(true);
          setSelectedSuggestion(-1);
        }}
        onFocus={() => nombre.length >= 2 && setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        onKeyDown={handleKeyDown}
        className="mt-1"
      />
      <p className="text-xs mt-1" style={{ color: "hsl(207 20% 55%)" }}>
        Si el articulo existe en Base de Datos, el precio se completara automaticamente
      </p>

      {showSuggestions && activeSuggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute z-50 w-full mt-1 rounded-lg border shadow-lg overflow-hidden"
          style={{ background: "white", borderColor: "hsl(210 20% 88%)" }}
        >
          <div className="px-3 py-2 text-xs font-semibold flex items-center gap-1.5" style={{ background: "rgba(217,119,6,0.08)", color: "#B45309" }}>
            <AlertTriangle className="w-3.5 h-3.5" />
            Articulos similares encontrados:
          </div>
          {activeSuggestions.map((item, idx) => (
            <button
              key={item.id}
              className="w-full text-left px-3 py-2.5 flex items-center gap-2 transition-colors border-t"
              style={{
                background: selectedSuggestion === idx ? "hsl(0 0% 97%)" : "white",
                borderColor: "hsl(210 20% 94%)",
              }}
              onMouseEnter={() => setSelectedSuggestion(idx)}
              onClick={() => handleSelect(item)}
            >
              <Package className="w-4 h-4 flex-shrink-0" style={{ color: "hsl(207 20% 55%)" }} />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium" style={{ color: "hsl(207 55% 15%)" }}>{item.nombre}</span>
                <span className="text-xs ml-2 font-bold" style={{ color: BRAND_RED }}>
                  {item.precio.toLocaleString("es-CR")} c/u
                </span>
              </div>
              {item.contenedor && (
                <span className="text-xs flex-shrink-0" style={{ color: "hsl(207 20% 55%)" }}>
                  ({item.contenedor})
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
