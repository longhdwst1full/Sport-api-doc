/**
 * Danh mục tham số nghiệp vụ.
 *
 * RANH GIỚI với env — đọc trước khi thêm dòng mới:
 * - Vào bảng này: NGƯỠNG NGHIỆP VỤ mà vận hành cần đổi theo tình hình thật
 *   (biểu phí, thời gian giữ chỗ, cửa sổ đổi trả...). Sửa từ Admin, có hiệu lực
 *   ngay, có audit và version.
 * - Ở lại env: bí mật và cấu hình hạ tầng (DATABASE_URL, JWT secret, khoá
 *   Cloudinary/GHN, AUTH_BYPASS, bật/tắt job, CORS). Đưa vào database nghĩa là
 *   cho sửa cấu hình bảo mật qua giao diện và mở rộng bề mặt tấn công.
 */
export const SYSTEM_PARAMETER_GROUP = {
  SHIPPING: 'SHIPPING',
  CHECKOUT: 'CHECKOUT',
  ORDER: 'ORDER',
  PAYMENT: 'PAYMENT',
  CART: 'CART',
  PROMOTION: 'PROMOTION',
} as const;

export const SYSTEM_PARAMETER_VALUE_TYPE = {
  INTEGER: 'INTEGER',
  DECIMAL: 'DECIMAL',
  BOOLEAN: 'BOOLEAN',
  STRING: 'STRING',
} as const;

export type SystemParameterValueType =
  (typeof SYSTEM_PARAMETER_VALUE_TYPE)[keyof typeof SYSTEM_PARAMETER_VALUE_TYPE];

export const SYSTEM_PARAMETER_CODE = {
  SHIPPING_FREE_RADIUS_KM: 'SHIPPING_FREE_RADIUS_KM',
  SHIPPING_SMALL_MAX_WEIGHT_GRAMS: 'SHIPPING_SMALL_MAX_WEIGHT_GRAMS',
  SHIPPING_MEDIUM_MAX_WEIGHT_GRAMS: 'SHIPPING_MEDIUM_MAX_WEIGHT_GRAMS',
  SHIPPING_SMALL_FEE_VND: 'SHIPPING_SMALL_FEE_VND',
  SHIPPING_MEDIUM_FEE_VND: 'SHIPPING_MEDIUM_FEE_VND',
  SHIPPING_LARGE_FEE_VND: 'SHIPPING_LARGE_FEE_VND',
  CHECKOUT_RESERVATION_TTL_MINUTES: 'CHECKOUT_RESERVATION_TTL_MINUTES',
  ORDER_COMPLETION_HOLD_HOURS: 'ORDER_COMPLETION_HOLD_HOURS',
  PAYMENT_TIMEOUT_MINUTES: 'PAYMENT_TIMEOUT_MINUTES',
  GUEST_CART_TTL_DAYS: 'GUEST_CART_TTL_DAYS',
  FLASH_SALE_QUOTA_TTL_MINUTES: 'FLASH_SALE_QUOTA_TTL_MINUTES',
} as const;

export type SystemParameterCode =
  (typeof SYSTEM_PARAMETER_CODE)[keyof typeof SYSTEM_PARAMETER_CODE];

export interface SystemParameterDefinition {
  code: SystemParameterCode;
  groupCode: string;
  label: string;
  description: string;
  valueType: SystemParameterValueType;
  defaultValue: string;
  minValue?: number;
  maxValue?: number;
  unit?: string;
  sortOrder: number;
  /** Cho phép Storefront đọc qua API công khai (kế thừa whitelist của fund-ops-service). */
  isPublic?: boolean;
}

export const SYSTEM_PARAMETER_CATALOG: readonly SystemParameterDefinition[] = [
  {
    code: SYSTEM_PARAMETER_CODE.SHIPPING_FREE_RADIUS_KM,
    groupCode: SYSTEM_PARAMETER_GROUP.SHIPPING,
    label: 'Bán kính miễn phí giao hàng',
    description: 'Trong bán kính này tính từ chi nhánh xuất hàng thì miễn phí giao.',
    valueType: SYSTEM_PARAMETER_VALUE_TYPE.INTEGER,
    defaultValue: '10', minValue: 0, maxValue: 100, unit: 'km', sortOrder: 10, isPublic: true,
  },
  {
    code: SYSTEM_PARAMETER_CODE.SHIPPING_SMALL_MAX_WEIGHT_GRAMS,
    groupCode: SYSTEM_PARAMETER_GROUP.SHIPPING,
    label: 'Mốc cân nặng bậc nhẹ',
    description: 'Đơn không vượt mốc này áp phí bậc nhẹ.',
    valueType: SYSTEM_PARAMETER_VALUE_TYPE.INTEGER,
    defaultValue: '5000', minValue: 100, maxValue: 1_000_000, unit: 'gram', sortOrder: 20,
  },
  {
    code: SYSTEM_PARAMETER_CODE.SHIPPING_MEDIUM_MAX_WEIGHT_GRAMS,
    groupCode: SYSTEM_PARAMETER_GROUP.SHIPPING,
    label: 'Mốc cân nặng bậc trung',
    description: 'Vượt mốc này áp phí bậc nặng.',
    valueType: SYSTEM_PARAMETER_VALUE_TYPE.INTEGER,
    defaultValue: '20000', minValue: 100, maxValue: 1_000_000, unit: 'gram', sortOrder: 30,
  },
  {
    code: SYSTEM_PARAMETER_CODE.SHIPPING_SMALL_FEE_VND,
    groupCode: SYSTEM_PARAMETER_GROUP.SHIPPING,
    label: 'Phí giao bậc nhẹ',
    description: 'Áp dụng khi ngoài bán kính miễn phí và không vượt mốc cân nặng bậc nhẹ.',
    valueType: SYSTEM_PARAMETER_VALUE_TYPE.INTEGER,
    defaultValue: '50000', minValue: 0, maxValue: 100_000_000, unit: 'VND', sortOrder: 40, isPublic: true,
  },
  {
    code: SYSTEM_PARAMETER_CODE.SHIPPING_MEDIUM_FEE_VND,
    groupCode: SYSTEM_PARAMETER_GROUP.SHIPPING,
    label: 'Phí giao bậc trung',
    description: 'Áp dụng cho đơn nằm giữa hai mốc cân nặng.',
    valueType: SYSTEM_PARAMETER_VALUE_TYPE.INTEGER,
    defaultValue: '100000', minValue: 0, maxValue: 100_000_000, unit: 'VND', sortOrder: 50, isPublic: true,
  },
  {
    code: SYSTEM_PARAMETER_CODE.SHIPPING_LARGE_FEE_VND,
    groupCode: SYSTEM_PARAMETER_GROUP.SHIPPING,
    label: 'Phí giao bậc nặng hoặc cồng kềnh',
    description: 'Áp dụng khi vượt mốc cân nặng bậc trung.',
    valueType: SYSTEM_PARAMETER_VALUE_TYPE.INTEGER,
    defaultValue: '200000', minValue: 0, maxValue: 100_000_000, unit: 'VND', sortOrder: 60, isPublic: true,
  },
  {
    code: SYSTEM_PARAMETER_CODE.CHECKOUT_RESERVATION_TTL_MINUTES,
    groupCode: SYSTEM_PARAMETER_GROUP.CHECKOUT,
    label: 'Thời gian giữ chỗ tồn kho',
    description: 'Hết thời gian này mà chưa đặt đơn thì reservation được trả lại kho.',
    valueType: SYSTEM_PARAMETER_VALUE_TYPE.INTEGER,
    defaultValue: '30', minValue: 5, maxValue: 1440, unit: 'phút', sortOrder: 10,
  },
  {
    code: SYSTEM_PARAMETER_CODE.ORDER_COMPLETION_HOLD_HOURS,
    groupCode: SYSTEM_PARAMETER_GROUP.ORDER,
    label: 'Thời gian chờ trước khi tự hoàn tất đơn',
    description: 'Sau khi giao thành công, đơn tự chuyển COMPLETED nếu không có khiếu nại.',
    valueType: SYSTEM_PARAMETER_VALUE_TYPE.INTEGER,
    defaultValue: '72', minValue: 1, maxValue: 720, unit: 'giờ', sortOrder: 10,
  },
  {
    code: SYSTEM_PARAMETER_CODE.PAYMENT_TIMEOUT_MINUTES,
    groupCode: SYSTEM_PARAMETER_GROUP.PAYMENT,
    label: 'Thời hạn thanh toán chuyển khoản',
    description: 'Quá hạn mà chưa có bằng chứng thì payment bị hủy tự động.',
    valueType: SYSTEM_PARAMETER_VALUE_TYPE.INTEGER,
    defaultValue: '30', minValue: 5, maxValue: 10_080, unit: 'phút', sortOrder: 10,
  },
  {
    code: SYSTEM_PARAMETER_CODE.GUEST_CART_TTL_DAYS,
    groupCode: SYSTEM_PARAMETER_GROUP.CART,
    label: 'Thời gian giữ giỏ hàng khách vãng lai',
    description: 'Giỏ hàng không hoạt động quá thời gian này sẽ hết hiệu lực.',
    valueType: SYSTEM_PARAMETER_VALUE_TYPE.INTEGER,
    defaultValue: '30', minValue: 1, maxValue: 365, unit: 'ngày', sortOrder: 10,
  },
  {
    code: SYSTEM_PARAMETER_CODE.FLASH_SALE_QUOTA_TTL_MINUTES,
    groupCode: SYSTEM_PARAMETER_GROUP.PROMOTION,
    label: 'Thời gian giữ suất flash sale',
    description: 'Suất đã giữ mà chưa đặt đơn sẽ được trả lại pool sau thời gian này.',
    valueType: SYSTEM_PARAMETER_VALUE_TYPE.INTEGER,
    defaultValue: '15', minValue: 1, maxValue: 1440, unit: 'phút', sortOrder: 10,
  },
];
