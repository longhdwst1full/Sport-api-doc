import type { ProductMediaDto } from '@/generated/api/catalog/models';

export const reorderProductMedia = (
  media: ProductMediaDto[],
  index: number,
  direction: -1 | 1,
): Array<{ id: string; sortOrder: number }> | undefined => {
  const target = index + direction;
  if (index < 0 || index >= media.length || target < 0 || target >= media.length) return undefined;
  const orderedIds = media.map(({ id }) => id);
  const currentId = orderedIds[index];
  orderedIds[index] = orderedIds[target];
  orderedIds[target] = currentId;
  return orderedIds.map((id, sortOrder) => ({ id, sortOrder }));
};
