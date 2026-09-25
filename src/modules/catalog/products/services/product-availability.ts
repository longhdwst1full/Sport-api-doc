/**
 * Tính "còn hàng" cho Storefront từ số dư kho, không lộ số lượng.
 *
 * INVARIANT: khả dụng = `onHand − reserved` tại MỘT kho. Không cộng dồn giữa các kho: đơn online
 * giữ hàng ở đúng một kho chi nhánh, nên 1 cái ở kho A + 1 cái ở kho B không bán được combo 2 cái.
 * Combo không có dòng tồn riêng; còn hàng khi cùng một kho đủ mọi thành phần theo định mức.
 */
export interface StockLine {
  variantId: bigint;
  /** Rỗng với hàng lẻ; combo liệt kê thành phần và định mức. */
  components: ReadonlyArray<{ variantId: bigint; quantity: number }>;
}

export interface StockBalance {
  warehouseId: bigint;
  productVariantId: bigint;
  onHand: number;
  reserved: number;
}

/** Biến thể thực sự có dòng tồn: hàng lẻ là chính nó, combo là các thành phần. */
export function stockedVariantIds(lines: readonly StockLine[]): bigint[] {
  const ids = new Set<bigint>();
  for (const line of lines) {
    if (line.components.length === 0) ids.add(line.variantId);
    else for (const component of line.components) ids.add(component.variantId);
  }
  return [...ids];
}

/** Trả tập ID (dạng chuỗi) của các biến thể còn bán được ít nhất 1 đơn vị ở một kho nào đó. */
export function inStockVariantIds(
  lines: readonly StockLine[],
  balances: readonly StockBalance[],
): Set<string> {
  const byWarehouse = new Map<bigint, Map<bigint, number>>();
  for (const balance of balances) {
    const available = byWarehouse.get(balance.warehouseId) ?? new Map<bigint, number>();
    available.set(balance.productVariantId, balance.onHand - balance.reserved);
    byWarehouse.set(balance.warehouseId, available);
  }

  const result = new Set<string>();
  for (const line of lines) {
    for (const available of byWarehouse.values()) {
      const sellable =
        line.components.length === 0
          ? (available.get(line.variantId) ?? 0) >= 1
          : line.components.every(
              (component) => (available.get(component.variantId) ?? 0) >= component.quantity,
            );
      if (sellable) {
        result.add(line.variantId.toString());
        break;
      }
    }
  }
  return result;
}
