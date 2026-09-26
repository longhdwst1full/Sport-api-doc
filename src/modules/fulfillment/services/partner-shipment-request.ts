import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { toEntityId } from '../../../common/identifiers/entity-id';
import type {
  CreatePartnerShipmentInput,
  PartnerPickupPoint,
} from '../../../integrations/shipping-partner/shipping-partner.client';
import { PAYMENT_METHOD } from '../../payment/payment.constants';
import { measurePackageFrom } from '../../shipping/package-measurement';

/** Phần dữ liệu fulfillment cần để dựng vận đơn; tạo lúc ship và worker tự tạo dùng chung. */
export interface PartnerShipmentSource {
  orderId: bigint;
  warehouse: { branch: { addressJson: Prisma.JsonValue } };
  order: {
    orderNo: string;
    grandTotal: Prisma.Decimal;
    addresses: Array<{
      recipientName: string;
      recipientPhone: string;
      addressLine: string;
      provinceCode: string;
      districtCode: string | null;
      wardCode: string | null;
    }>;
    checkoutSession: { paymentMethod: string };
    reservation: {
      items: Array<{
        quantity: number;
        productVariant: { weightGrams: number; lengthMm: number | null; widthMm: number | null; heightMm: number | null };
      }>;
    };
  };
}

/**
 * Dựng yêu cầu tạo vận đơn cho hãng. Một nguồn duy nhất để vận đơn tạo lúc ship và vận đơn worker tự
 * tạo sau thanh toán giống hệt nhau: cùng điểm lấy hàng, cùng kiện hàng, cùng số tiền thu hộ.
 */
export function buildPartnerShipmentRequest(source: PartnerShipmentSource, note?: string): CreatePartnerShipmentInput {
  const address = source.order.addresses[0];
  if (!address) {
    throw new ConflictException('Đơn hàng chưa có địa chỉ giao để tạo vận đơn');
  }
  const pickup = branchPickupPoint(source);
  const measurement = measurePackageFrom(
    source.order.reservation.items.map((item) => ({
      quantity: item.quantity,
      weightGrams: item.productVariant.weightGrams,
      lengthMm: item.productVariant.lengthMm,
      widthMm: item.productVariant.widthMm,
      heightMm: item.productVariant.heightMm,
    })),
  );
  const isCod = source.order.checkoutSession.paymentMethod === PAYMENT_METHOD.COD;
  const grandTotal = Math.round(Number(source.order.grandTotal));
  return {
    orderId: toEntityId(source.orderId),
    orderNo: source.order.orderNo,
    pickup,
    recipientName: address.recipientName,
    recipientPhone: address.recipientPhone,
    addressLine: address.addressLine,
    provinceCode: address.provinceCode,
    ...(address.districtCode ? { districtCode: address.districtCode } : {}),
    ...(address.wardCode ? { wardCode: address.wardCode } : {}),
    // Khối lượng và kích thước lấy từ đúng số đã khai ở sản phẩm; khai thiếu thì hãng cân lại và
    // phần chênh cước rơi vào cửa hàng (xem README mục "Cân nặng và kích thước kiện hàng").
    weightGrams: measurement.chargeableWeightGrams,
    ...(measurement.hasDimensions
      ? { lengthCm: measurement.lengthCm, widthCm: measurement.widthCm, heightCm: measurement.heightCm }
      : {}),
    // COD chỉ thu khi chưa thanh toán trước; chuyển khoản/VNPay đã thu nên cod_amount phải là 0.
    codAmount: isCod ? grandTotal : 0,
    declaredValue: grandTotal,
    ...(note?.trim() ? { note: note.trim() } : {}),
  };
}

/**
 * Điểm lấy hàng là địa chỉ chi nhánh sở hữu kho xuất, không phải cấu hình toàn hệ thống.
 * Mã quận/phường do Admin chọn qua API địa giới của hãng và nằm trong `branches.address_json`.
 */
function branchPickupPoint(source: PartnerShipmentSource): PartnerPickupPoint {
  const address = source.warehouse.branch.addressJson as { districtCode?: unknown; wardCode?: unknown } | null;
  const districtCode = typeof address?.districtCode === 'string' ? address.districtCode : '';
  const wardCode = typeof address?.wardCode === 'string' ? address.wardCode : '';
  if (!districtCode || !wardCode) {
    throw new ConflictException('Chi nhánh xuất hàng chưa có mã quận/huyện và phường/xã của hãng vận chuyển');
  }
  return { districtCode, wardCode };
}
