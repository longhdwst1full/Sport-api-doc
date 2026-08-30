export interface SearchableCatalogMaster {
  code: string;
  name: string;
  slug: string;
}

export function filterCatalogMasters<T extends SearchableCatalogMaster>(
  items: T[],
  search: string,
): T[] {
  const normalized = search.trim().toLocaleLowerCase('vi');
  if (!normalized) return items;
  return items.filter((item) =>
    [item.code, item.name, item.slug].some((value) =>
      value.toLocaleLowerCase('vi').includes(normalized),
    ),
  );
}
