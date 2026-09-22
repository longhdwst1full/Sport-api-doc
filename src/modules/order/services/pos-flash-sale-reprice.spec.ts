import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { FLASH_SALE_ERROR_CODE } from '../../promotion/promotion.constants';
import { buildRepricedConflict, flashSaleLossVariantIds } from './pos-order.service';

/**
 * Quầy được bán theo giá flash và có trừ suất thật (đường đi: `create` → `buildCheckout` snapshot
 * `flashSaleItemId` → `reservations.confirm` giữ suất → `orders.place` chốt suất).
 *
 * Bộ test này khoá hành vi khi suất biến mất GIỮA lúc nhân viên lập đơn: phải báo lại giá gốc để
 * nhân viên xác nhận với khách, không được âm thầm lưu đơn ở giá khác giá vừa đọc.
 */
const quote = {
  checkoutToken: 'token',
  lines: [
    {
      productVariantId: '11',
      sku: 'TA-10KG',
      regularPrice: '500000.00',
      flashPrice: '399000.00',
    },
    {
      productVariantId: '12',
      sku: 'DAY-NHAY',
      regularPrice: '120000.00',
      flashPrice: null,
    },
  ],
};

function conflict(code: string, fields: string[]): ConflictException {
  return new ConflictException({
    code,
    message: 'Suất flash sale vừa hết; giá quay về giá gốc',
    details: fields.map((field) => ({ field, code, message: 'x' })),
  });
}

describe('flashSaleLossVariantIds', () => {
  it('nhận ra lỗi hết suất và trả về biến thể bị ảnh hưởng', () => {
    expect(
      flashSaleLossVariantIds(conflict(FLASH_SALE_ERROR_CODE.QUOTA_EXHAUSTED, ['11'])),
    ).toEqual(['11']);
  });

  it('nhận ra cả campaign kết thúc và vượt giới hạn mỗi khách', () => {
    expect(flashSaleLossVariantIds(conflict(FLASH_SALE_ERROR_CODE.CAMPAIGN_ENDED, ['11']))).toEqual([
      '11',
    ]);
    expect(
      flashSaleLossVariantIds(conflict(FLASH_SALE_ERROR_CODE.PER_CUSTOMER_LIMIT, ['11'])),
    ).toEqual(['11']);
  });

  /**
   * Quan trọng: hết tồn kho vật lý KHÔNG phải mất suất flash. Nhận lẫn hai thứ sẽ báo cho nhân
   * viên "giá đã về giá gốc" trong khi vấn đề thật là không còn hàng để bán.
   */
  it('bỏ qua lỗi không thuộc flash sale', () => {
    expect(flashSaleLossVariantIds(new ConflictException('Không đủ tồn kho'))).toBeUndefined();
    expect(flashSaleLossVariantIds(new ServiceUnavailableException('db'))).toBeUndefined();
    expect(flashSaleLossVariantIds(new Error('boom'))).toBeUndefined();
  });

  it('lỗi flash sale không có details vẫn được nhận, trả mảng rỗng', () => {
    const error = new ConflictException({
      code: FLASH_SALE_ERROR_CODE.QUOTA_EXHAUSTED,
      message: 'x',
    });
    expect(flashSaleLossVariantIds(error)).toEqual([]);
  });
});

describe('buildRepricedConflict', () => {
  it('chỉ báo lại dòng mất suất, kèm giá gốc và SKU', () => {
    const response = buildRepricedConflict(['11'], quote).getResponse() as {
      code: string;
      details: { field: string; message: string }[];
    };

    expect(response.code).toBe(FLASH_SALE_ERROR_CODE.POS_REPRICED);
    expect(response.details).toHaveLength(1);
    expect(response.details[0].field).toBe('11');
    expect(response.details[0].message).toContain('TA-10KG');
    expect(response.details[0].message).toContain('500000.00');
  });

  /** Không xác định được biến thể thì báo lại mọi dòng có giá flash, không báo dòng giá gốc. */
  it('không xác định được biến thể thì báo lại mọi dòng có giá flash', () => {
    const response = buildRepricedConflict([], quote).getResponse() as {
      details: { field: string }[];
    };

    expect(response.details.map((detail) => detail.field)).toEqual(['11']);
  });

  it('trả 409 để nhân viên xác nhận lại, không phải 200', () => {
    expect(buildRepricedConflict(['11'], quote).getStatus()).toBe(409);
  });
});
