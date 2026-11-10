import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocalAuth } from "@/hooks/useLocalAuth";
import { trpc } from "@/providers/trpc";
import { BODEGA_STORE_ID, sortStoresBodegaFirst } from "@/lib/stores";

const STORAGE_KEY = "aolc_active_store_id";

type ActiveStoreContextValue = {
  storeId: number;
  setStoreId: (id: number) => void;
  canSwitchStore: boolean;
  stores: { id: number; name: string; slug: string }[];
  storeName: string;
  isBodega: boolean;
};

const ActiveStoreContext = createContext<ActiveStoreContextValue | null>(null);

function readStoredStoreId(): number | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function ActiveStoreProvider({ children }: { children: ReactNode }) {
  const { user, isAdmin, isManager, storeId: userStoreId } = useLocalAuth();
  const canSwitchStore = isAdmin || isManager;
  const { data: storesData } = trpc.inventory.stores.useQuery(undefined, {
    enabled: !!user,
  });

  const stores = useMemo(
    () => sortStoresBodegaFirst((storesData || []).map((s) => ({ id: s.id, name: s.name, slug: s.slug }))),
    [storesData],
  );

  // Admin/manager default to Bodega as the principal warehouse workspace.
  const [selectedStoreId, setSelectedStoreId] = useState<number>(() => {
    if (canSwitchStore) return readStoredStoreId() || BODEGA_STORE_ID;
    return userStoreId || BODEGA_STORE_ID;
  });

  useEffect(() => {
    if (!user) return;
    if (!canSwitchStore) {
      if (userStoreId) setSelectedStoreId(userStoreId);
      return;
    }
    const stored = readStoredStoreId();
    setSelectedStoreId(stored || BODEGA_STORE_ID);
  }, [user, canSwitchStore, userStoreId]);

  useEffect(() => {
    if (stores.length === 0) return;
    if (!stores.some((s) => s.id === selectedStoreId)) {
      const bodega = stores.find((s) => s.id === BODEGA_STORE_ID);
      setSelectedStoreId(bodega?.id || stores[0].id);
    }
  }, [stores, selectedStoreId]);

  const setStoreId = (id: number) => {
    if (!canSwitchStore) return;
    setSelectedStoreId(id);
    localStorage.setItem(STORAGE_KEY, String(id));
  };

  const storeName = stores.find((s) => s.id === selectedStoreId)?.name || "Bodega";

  const value: ActiveStoreContextValue = {
    storeId: selectedStoreId,
    setStoreId,
    canSwitchStore,
    stores,
    storeName,
    isBodega: selectedStoreId === BODEGA_STORE_ID,
  };

  return (
    <ActiveStoreContext.Provider value={value}>{children}</ActiveStoreContext.Provider>
  );
}

export function useActiveStore() {
  const ctx = useContext(ActiveStoreContext);
  if (!ctx) {
    throw new Error("useActiveStore must be used within ActiveStoreProvider");
  }
  return ctx;
}
