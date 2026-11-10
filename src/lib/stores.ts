/** Warehouse / Bodega is always store id 1 in this system. */
export const BODEGA_STORE_ID = 1;

export function sortStoresBodegaFirst<T extends { id: number; name: string }>(stores: T[]): T[] {
  return [...stores].sort((a, b) => {
    if (a.id === BODEGA_STORE_ID) return -1;
    if (b.id === BODEGA_STORE_ID) return 1;
    return a.name.localeCompare(b.name, "es");
  });
}
