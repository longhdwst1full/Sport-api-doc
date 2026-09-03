import type { ProductVariantDto, UpdateVariantDto } from '@/generated/api/catalog/models';

export interface VariantEditValues {
  name: string;
  barcode: string;
  weightGrams: number;
  lengthMm?: number;
  widthMm?: number;
  heightMm?: number;
}

export const toVariantEditValues = (variant: ProductVariantDto): VariantEditValues => ({
  name: variant.name,
  barcode: variant.barcode ?? '',
  weightGrams: variant.weightGrams,
  lengthMm: variant.lengthMm ?? undefined,
  widthMm: variant.widthMm ?? undefined,
  heightMm: variant.heightMm ?? undefined,
});

export const toUpdateVariantDto = (
  values: VariantEditValues,
  expectedVersion: number,
): UpdateVariantDto => ({
  name: values.name.trim(),
  barcode: values.barcode.trim() || null,
  weightGrams: values.weightGrams,
  lengthMm: values.lengthMm ?? null,
  widthMm: values.widthMm ?? null,
  heightMm: values.heightMm ?? null,
  expectedVersion,
});
