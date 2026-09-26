import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { INVENTORY_ERROR } from './inventory.constants';
import { STOCK_TRANSFER_ERROR } from './stock-transfer.constants';

const VIETNAMESE = /[À-ỹĐđ]/u;

function entries(catalog: Record<string, unknown>) {
  return Object.entries(catalog).map(([key, value]) => {
    // Hàm cần tham số (SKU, số ký tự...) thì gọi thử với giá trị mẫu để kiểm nội dung.
    const error = (typeof value === 'function' ? (value as (...args: unknown[]) => unknown)(['SKU-1'], 'X') : value) as {
      code: string;
      message: string;
    };
    return { key, ...error };
  });
}

describe('Inventory error catalog', () => {
  it.each([
    ['INVENTORY_ERROR', INVENTORY_ERROR, 'INVENTORY_'],
    ['STOCK_TRANSFER_ERROR', STOCK_TRANSFER_ERROR, 'STOCK_TRANSFER_'],
  ] as const)('%s có mã ổn định và message tiếng Việt', (_name, catalog, prefix) => {
    for (const error of entries(catalog)) {
      expect(error.code.startsWith(prefix)).toBe(true);
      expect(VIETNAMESE.test(error.message)).toBe(true);
    }
  });

  /** Chặn tái diễn: service không được ném câu viết tay; mọi lỗi đi qua catalog ở constants. */
  it('service của module không ném exception bằng chuỗi viết trực tiếp', () => {
    const offenders = readdirSync(__dirname)
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'))
      .flatMap((file) => {
        const source = readFileSync(join(__dirname, file), 'utf8');
        return [...source.matchAll(/new \w+Exception\(\s*['`"]/g)].map((match) => `${file}: ${match[0]}`);
      });

    expect(offenders).toEqual([]);
  });
});
