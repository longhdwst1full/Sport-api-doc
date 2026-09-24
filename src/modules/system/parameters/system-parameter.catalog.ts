/**
 * Danh mục tham số hệ thống.
 *
 * RANH GIỚI với env — đọc trước khi thêm dòng mới:
 * - Vào bảng này: NGƯỠNG NGHIỆP VỤ mà vận hành cần đổi theo tình hình thật (biểu phí, thời gian
 *   giữ chỗ, cửa sổ đổi trả...), và CẤU HÌNH TÍCH HỢP với nhà cung cấp bên ngoài (GHN, VNPay,
 *   Mailtrap). Sửa từ Admin, có hiệu lực ngay, có audit và version.
 * - Ở lại env: nền tảng để ứng dụng khởi động được và không ai đổi lúc chạy — `DATABASE_URL`,
 *   `JWT_ACCESS_SECRET`, `AUTH_BYPASS`, `CORS_ORIGINS`, `CRON_SECRET`. Đưa những thứ này vào
 *   database là tự khoá mình ra ngoài khi database hỏng.
 *
 * BÍ MẬT TÍCH HỢP đặt `isSecret: true`. Giá trị của chúng KHÔNG bao giờ trả ra API đọc — chỉ ghi
 * được — vì tài khoản xem tham số không đồng nghĩa với được cầm khoá của nhà cung cấp, và giá trị
 * trả về sẽ nằm trong log của mọi proxy giữa đường. Env vẫn là fallback: tham số để trống thì
 * backend dùng biến môi trường, nên môi trường chưa cấu hình không bị chặn.
 */
export const SYSTEM_PARAMETER_GROUP = {
  SHIPPING: 'SHIPPING',
  CHECKOUT: 'CHECKOUT',
  ORDER: 'ORDER',
  PAYMENT: 'PAYMENT',
  CART: 'CART',
  PROMOTION: 'PROMOTION',
  /** Cấu hình kết nối nhà cung cấp bên ngoài: vận chuyển, thanh toán, email. */
  INTEGRATION: 'INTEGRATION',
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
  RETURN_WINDOW_DAYS: 'RETURN_WINDOW_DAYS',
  PAYMENT_TIMEOUT_MINUTES: 'PAYMENT_TIMEOUT_MINUTES',
  GUEST_CART_TTL_DAYS: 'GUEST_CART_TTL_DAYS',
  FLASH_SALE_QUOTA_TTL_MINUTES: 'FLASH_SALE_QUOTA_TTL_MINUTES',
  FLASH_SALE_QUOTA_EXPIRY_JOB_ENABLED: 'FLASH_SALE_QUOTA_EXPIRY_JOB_ENABLED',
  RESERVATION_EXPIRY_JOB_ENABLED: 'RESERVATION_EXPIRY_JOB_ENABLED',
  PAYMENT_EXPIRY_JOB_ENABLED: 'PAYMENT_EXPIRY_JOB_ENABLED',
  ORDER_COMPLETION_JOB_ENABLED: 'ORDER_COMPLETION_JOB_ENABLED',
  FLASH_SALE_QUOTA_EXPIRY_JOB_BATCH_SIZE: 'FLASH_SALE_QUOTA_EXPIRY_JOB_BATCH_SIZE',

  // --- Tích hợp vận chuyển GHN ---
  GHN_ENABLED: 'GHN_ENABLED',
  GHN_BASE_URL: 'GHN_BASE_URL',
  GHN_TOKEN: 'GHN_TOKEN',
  GHN_SHOP_ID: 'GHN_SHOP_ID',
  GHN_SERVICE_TYPE_ID: 'GHN_SERVICE_TYPE_ID',
  GHN_WEBHOOK_SECRET: 'GHN_WEBHOOK_SECRET',
  GHN_WEBHOOK_ACTOR_USER_ID: 'GHN_WEBHOOK_ACTOR_USER_ID',

  // --- Tích hợp thanh toán VNPay ---
  VNPAY_TMN_CODE: 'VNPAY_TMN_CODE',
  VNPAY_HASH_SECRET: 'VNPAY_HASH_SECRET',
  VNPAY_PAYMENT_URL: 'VNPAY_PAYMENT_URL',
  VNPAY_RETURN_URL: 'VNPAY_RETURN_URL',
  STOREFRONT_BASE_URL: 'STOREFRONT_BASE_URL',
  VNPAY_EXPIRE_MINUTES: 'VNPAY_EXPIRE_MINUTES',

  // --- Tích hợp email Mailtrap ---
  MAILTRAP_API_TOKEN: 'MAILTRAP_API_TOKEN',
  MAILTRAP_SENDER_EMAIL: 'MAILTRAP_SENDER_EMAIL',
  MAILTRAP_SENDER_NAME: 'MAILTRAP_SENDER_NAME',
  MAILTRAP_REDIRECT_ALL_TO: 'MAILTRAP_REDIRECT_ALL_TO',

  // --- Tích hợp lưu trữ ảnh Cloudinary ---
  CLOUDINARY_CLOUD_NAME: 'CLOUDINARY_CLOUD_NAME',
  CLOUDINARY_API_KEY: 'CLOUDINARY_API_KEY',
  CLOUDINARY_API_SECRET: 'CLOUDINARY_API_SECRET',
  CLOUDINARY_FOLDER: 'CLOUDINARY_FOLDER',

  // --- Tích hợp Telegram ---
  TELEGRAM_BOT_ENABLED: 'TELEGRAM_BOT_ENABLED',
  TELEGRAM_BOT_TOKEN: 'TELEGRAM_BOT_TOKEN',
  TELEGRAM_ALLOWED_USER_ID: 'TELEGRAM_ALLOWED_USER_ID',
  TELEGRAM_WEBHOOK_SECRET: 'TELEGRAM_WEBHOOK_SECRET',
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
  /** Bí mật nhà cung cấp: ghi được, không đọc lại được qua API. */
  isSecret?: boolean;
  /**
   * Biến môi trường dùng làm fallback khi tham số còn để trống. Giữ đường này để môi trường mới
   * chạy được ngay bằng env, rồi chuyển dần sang quản trị bằng tham số.
   */
  envFallback?: string;
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
    code: SYSTEM_PARAMETER_CODE.RETURN_WINDOW_DAYS,
    groupCode: SYSTEM_PARAMETER_GROUP.ORDER,
    label: 'Thời hạn đổi trả',
    description:
      'Số ngày tính từ lúc giao thành công mà khách còn được tạo yêu cầu trả hàng (D54). Quá hạn chỉ tạo được khi có quyền override và ghi lý do.',
    valueType: SYSTEM_PARAMETER_VALUE_TYPE.INTEGER,
    defaultValue: '7', minValue: 1, maxValue: 90, unit: 'ngày', sortOrder: 20, isPublic: true,
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
  {
    code: SYSTEM_PARAMETER_CODE.FLASH_SALE_QUOTA_EXPIRY_JOB_ENABLED,
    groupCode: SYSTEM_PARAMETER_GROUP.PROMOTION,
    label: 'Bật worker trả suất flash sale quá hạn',
    description:
      'Tắt thì endpoint cron trả no-op và suất đã giữ sẽ không được trả lại pool. Chỉ tắt khi đang xử lý sự cố.',
    valueType: SYSTEM_PARAMETER_VALUE_TYPE.BOOLEAN,
    defaultValue: 'false', sortOrder: 20,
    envFallback: 'FLASH_SALE_QUOTA_EXPIRY_JOB_ENABLED',
  },
  {
    code: SYSTEM_PARAMETER_CODE.FLASH_SALE_QUOTA_EXPIRY_JOB_BATCH_SIZE,
    groupCode: SYSTEM_PARAMETER_GROUP.PROMOTION,
    label: 'Số reservation xử lý mỗi lần chạy worker',
    description:
      'Giới hạn của một lần gọi cron. Đặt quá lớn thì transaction giữ lock lâu; kết quả trả về `hasMore` để vận hành biết còn tồn đọng.',
    valueType: SYSTEM_PARAMETER_VALUE_TYPE.INTEGER,
    defaultValue: '50', minValue: 1, maxValue: 500, unit: 'bản ghi', sortOrder: 30,
    envFallback: 'FLASH_SALE_QUOTA_EXPIRY_JOB_BATCH_SIZE',
  },
  // --- Tích hợp vận chuyển GHN ---
  {
    code: SYSTEM_PARAMETER_CODE.GHN_ENABLED,
    groupCode: SYSTEM_PARAMETER_GROUP.INTEGRATION,
    label: 'Bật tích hợp GHN',
    description: 'Tắt thì báo giá dùng bảng phí nội bộ và mã vận đơn nhập tay.',
    valueType: SYSTEM_PARAMETER_VALUE_TYPE.BOOLEAN,
    defaultValue: 'false', sortOrder: 10, envFallback: 'GHN_ENABLED',
  },
  {
    code: SYSTEM_PARAMETER_CODE.GHN_BASE_URL,
    groupCode: SYSTEM_PARAMETER_GROUP.INTEGRATION,
    label: 'Địa chỉ API GHN',
    description: 'Dùng gateway dev khi thử nghiệm, gateway chính thức khi chạy thật.',
    valueType: SYSTEM_PARAMETER_VALUE_TYPE.STRING,
    defaultValue: 'https://dev-online-gateway.ghn.vn/shiip/public-api',
    sortOrder: 20, envFallback: 'GHN_BASE_URL',
  },
  {
    code: SYSTEM_PARAMETER_CODE.GHN_TOKEN,
    groupCode: SYSTEM_PARAMETER_GROUP.INTEGRATION,
    label: 'Token GHN',
    description: 'Khoá API lấy trong trang quản trị GHN. Ghi được, không đọc lại được.',
    valueType: SYSTEM_PARAMETER_VALUE_TYPE.STRING,
    defaultValue: '', sortOrder: 30, isSecret: true, envFallback: 'GHN_TOKEN',
  },
  {
    code: SYSTEM_PARAMETER_CODE.GHN_SHOP_ID,
    groupCode: SYSTEM_PARAMETER_GROUP.INTEGRATION,
    label: 'Shop ID GHN',
    description: 'Mã cửa hàng trong tài khoản GHN.',
    valueType: SYSTEM_PARAMETER_VALUE_TYPE.STRING,
    defaultValue: '', sortOrder: 40, envFallback: 'GHN_SHOP_ID',
  },
  {
    code: SYSTEM_PARAMETER_CODE.GHN_SERVICE_TYPE_ID,
    groupCode: SYSTEM_PARAMETER_GROUP.INTEGRATION,
    label: 'Loại dịch vụ GHN',
    description: '2 là hàng nhẹ, 5 là hàng nặng theo phân loại của GHN.',
    valueType: SYSTEM_PARAMETER_VALUE_TYPE.INTEGER,
    defaultValue: '2', minValue: 1, maxValue: 99, sortOrder: 50,
    envFallback: 'GHN_SERVICE_TYPE_ID',
  },
  {
    code: SYSTEM_PARAMETER_CODE.GHN_WEBHOOK_SECRET,
    groupCode: SYSTEM_PARAMETER_GROUP.INTEGRATION,
    label: 'Bí mật webhook GHN',
    description: 'Tối thiểu 16 ký tự. Đặt vào query string của URL webhook khai ở cổng GHN.',
    valueType: SYSTEM_PARAMETER_VALUE_TYPE.STRING,
    defaultValue: '', sortOrder: 60, isSecret: true, envFallback: 'GHN_WEBHOOK_SECRET',
  },
  {
    code: SYSTEM_PARAMETER_CODE.GHN_WEBHOOK_ACTOR_USER_ID,
    groupCode: SYSTEM_PARAMETER_GROUP.INTEGRATION,
    label: 'Tài khoản dịch vụ cho webhook GHN',
    description: 'Phải là users.id có thật vì transition do webhook kích hoạt phải ghi audit.',
    valueType: SYSTEM_PARAMETER_VALUE_TYPE.STRING,
    defaultValue: '', sortOrder: 70, envFallback: 'GHN_WEBHOOK_ACTOR_USER_ID',
  },

  // --- Tích hợp thanh toán VNPay ---
  {
    code: SYSTEM_PARAMETER_CODE.VNPAY_TMN_CODE,
    groupCode: SYSTEM_PARAMETER_GROUP.INTEGRATION,
    label: 'Mã website VNPay',
    description: 'Để trống thì tính năng thanh toán VNPay tắt.',
    valueType: SYSTEM_PARAMETER_VALUE_TYPE.STRING,
    defaultValue: '', sortOrder: 110, envFallback: 'VNPAY_TMN_CODE',
  },
  {
    code: SYSTEM_PARAMETER_CODE.VNPAY_HASH_SECRET,
    groupCode: SYSTEM_PARAMETER_GROUP.INTEGRATION,
    label: 'Hash secret VNPay',
    description: 'Khoá ký chữ ký giao dịch. Ghi được, không đọc lại được.',
    valueType: SYSTEM_PARAMETER_VALUE_TYPE.STRING,
    defaultValue: '', sortOrder: 120, isSecret: true, envFallback: 'VNPAY_HASH_SECRET',
  },
  {
    code: SYSTEM_PARAMETER_CODE.VNPAY_PAYMENT_URL,
    groupCode: SYSTEM_PARAMETER_GROUP.INTEGRATION,
    label: 'Địa chỉ cổng thanh toán VNPay',
    description: 'Sandbox khi thử nghiệm, cổng chính thức khi chạy thật.',
    valueType: SYSTEM_PARAMETER_VALUE_TYPE.STRING,
    defaultValue: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
    sortOrder: 130, envFallback: 'VNPAY_PAYMENT_URL',
  },
  {
    code: SYSTEM_PARAMETER_CODE.VNPAY_RETURN_URL,
    groupCode: SYSTEM_PARAMETER_GROUP.INTEGRATION,
    label: 'Địa chỉ khách quay về sau thanh toán',
    description: 'Trang Storefront nhận kết quả thanh toán.',
    valueType: SYSTEM_PARAMETER_VALUE_TYPE.STRING,
    defaultValue: '', sortOrder: 140, envFallback: 'VNPAY_RETURN_URL',
  },
  {
    code: SYSTEM_PARAMETER_CODE.STOREFRONT_BASE_URL,
    groupCode: SYSTEM_PARAMETER_GROUP.INTEGRATION,
    label: 'Địa chỉ Storefront',
    description:
      'Gốc đường dẫn dựng link trong email, ví dụ link đặt lại mật khẩu. Sai giá trị này thì link '
      + 'trong email trỏ về nơi khác.',
    valueType: SYSTEM_PARAMETER_VALUE_TYPE.STRING,
    defaultValue: 'http://localhost:3000', sortOrder: 150, envFallback: 'STOREFRONT_BASE_URL',
  },
  {
    code: SYSTEM_PARAMETER_CODE.VNPAY_EXPIRE_MINUTES,
    groupCode: SYSTEM_PARAMETER_GROUP.INTEGRATION,
    label: 'Hạn thanh toán VNPay',
    description: 'Quá thời gian này thì liên kết thanh toán hết hiệu lực.',
    valueType: SYSTEM_PARAMETER_VALUE_TYPE.INTEGER,
    defaultValue: '15', minValue: 1, maxValue: 1440, unit: 'phút', sortOrder: 150,
    envFallback: 'VNPAY_EXPIRE_MINUTES',
  },

  // --- Tích hợp email Mailtrap ---
  {
    code: SYSTEM_PARAMETER_CODE.MAILTRAP_API_TOKEN,
    groupCode: SYSTEM_PARAMETER_GROUP.INTEGRATION,
    label: 'Token Mailtrap',
    description: 'Để trống thì tính năng gửi email tắt. Ghi được, không đọc lại được.',
    valueType: SYSTEM_PARAMETER_VALUE_TYPE.STRING,
    defaultValue: '', sortOrder: 210, isSecret: true, envFallback: 'MAILTRAP_API_TOKEN',
  },
  {
    code: SYSTEM_PARAMETER_CODE.MAILTRAP_SENDER_EMAIL,
    groupCode: SYSTEM_PARAMETER_GROUP.INTEGRATION,
    label: 'Email người gửi',
    description: 'Phải thuộc domain đã verify trong Mailtrap.',
    valueType: SYSTEM_PARAMETER_VALUE_TYPE.STRING,
    defaultValue: '', sortOrder: 220, envFallback: 'MAILTRAP_SENDER_EMAIL',
  },
  {
    code: SYSTEM_PARAMETER_CODE.MAILTRAP_SENDER_NAME,
    groupCode: SYSTEM_PARAMETER_GROUP.INTEGRATION,
    label: 'Tên người gửi',
    description: 'Tên hiển thị trong hộp thư của khách.',
    valueType: SYSTEM_PARAMETER_VALUE_TYPE.STRING,
    defaultValue: 'Bảo An Sport', sortOrder: 230, envFallback: 'MAILTRAP_SENDER_NAME',
  },
  {
    code: SYSTEM_PARAMETER_CODE.MAILTRAP_REDIRECT_ALL_TO,
    groupCode: SYSTEM_PARAMETER_GROUP.INTEGRATION,
    label: 'Chuyển hướng toàn bộ email về',
    description:
      'Ngoài production, mọi email gửi về địa chỉ này để không gửi nhầm khách thật. '
      + 'Production bỏ qua giá trị này.',
    valueType: SYSTEM_PARAMETER_VALUE_TYPE.STRING,
    defaultValue: '', sortOrder: 240, envFallback: 'MAILTRAP_REDIRECT_ALL_TO',
  },
  // --- Tích hợp lưu trữ ảnh Cloudinary ---
  {
    code: SYSTEM_PARAMETER_CODE.CLOUDINARY_CLOUD_NAME,
    groupCode: SYSTEM_PARAMETER_GROUP.INTEGRATION,
    label: 'Cloud name Cloudinary',
    description: 'Để trống thì upload ảnh tắt và API trả 503 rõ ràng.',
    valueType: SYSTEM_PARAMETER_VALUE_TYPE.STRING,
    defaultValue: '', sortOrder: 310, envFallback: 'CLOUDINARY_CLOUD_NAME',
  },
  {
    code: SYSTEM_PARAMETER_CODE.CLOUDINARY_API_KEY,
    groupCode: SYSTEM_PARAMETER_GROUP.INTEGRATION,
    label: 'API key Cloudinary',
    description: 'Khoá công khai dùng để ký yêu cầu upload.',
    valueType: SYSTEM_PARAMETER_VALUE_TYPE.STRING,
    defaultValue: '', sortOrder: 320, envFallback: 'CLOUDINARY_API_KEY',
  },
  {
    code: SYSTEM_PARAMETER_CODE.CLOUDINARY_API_SECRET,
    groupCode: SYSTEM_PARAMETER_GROUP.INTEGRATION,
    label: 'API secret Cloudinary',
    description: 'Khoá bí mật để ký upload. Ghi được, không đọc lại được.',
    valueType: SYSTEM_PARAMETER_VALUE_TYPE.STRING,
    defaultValue: '', sortOrder: 330, isSecret: true, envFallback: 'CLOUDINARY_API_SECRET',
  },
  {
    code: SYSTEM_PARAMETER_CODE.CLOUDINARY_FOLDER,
    groupCode: SYSTEM_PARAMETER_GROUP.INTEGRATION,
    label: 'Thư mục lưu ảnh',
    description: 'Đường dẫn tương đối trong tài khoản Cloudinary.',
    valueType: SYSTEM_PARAMETER_VALUE_TYPE.STRING,
    defaultValue: 'sport-sys/sport', sortOrder: 340, envFallback: 'CLOUDINARY_FOLDER',
  },

  // --- Tích hợp Telegram ---
  {
    code: SYSTEM_PARAMETER_CODE.TELEGRAM_BOT_ENABLED,
    groupCode: SYSTEM_PARAMETER_GROUP.INTEGRATION,
    label: 'Bật bot Telegram',
    description: 'Tắt thì webhook Telegram từ chối mọi cập nhật.',
    valueType: SYSTEM_PARAMETER_VALUE_TYPE.BOOLEAN,
    defaultValue: 'false', sortOrder: 410, envFallback: 'TELEGRAM_BOT_ENABLED',
  },
  {
    code: SYSTEM_PARAMETER_CODE.TELEGRAM_BOT_TOKEN,
    groupCode: SYSTEM_PARAMETER_GROUP.INTEGRATION,
    label: 'Token bot Telegram',
    description: 'Khoá BotFather cấp. Ghi được, không đọc lại được.',
    valueType: SYSTEM_PARAMETER_VALUE_TYPE.STRING,
    defaultValue: '', sortOrder: 420, isSecret: true, envFallback: 'TELEGRAM_BOT_TOKEN',
  },
  {
    code: SYSTEM_PARAMETER_CODE.TELEGRAM_ALLOWED_USER_ID,
    groupCode: SYSTEM_PARAMETER_GROUP.INTEGRATION,
    label: 'Tài khoản Telegram được phép',
    description: 'Chỉ user ID này gửi lệnh được cho bot.',
    valueType: SYSTEM_PARAMETER_VALUE_TYPE.STRING,
    defaultValue: '', sortOrder: 430, envFallback: 'TELEGRAM_ALLOWED_USER_ID',
  },
  {
    code: SYSTEM_PARAMETER_CODE.TELEGRAM_WEBHOOK_SECRET,
    groupCode: SYSTEM_PARAMETER_GROUP.INTEGRATION,
    label: 'Bí mật webhook Telegram',
    description: 'Tối thiểu 32 ký tự, gửi qua header x-telegram-bot-api-secret-token.',
    valueType: SYSTEM_PARAMETER_VALUE_TYPE.STRING,
    defaultValue: '', sortOrder: 440, isSecret: true, envFallback: 'TELEGRAM_WEBHOOK_SECRET',
  },
  /**
   * Cờ bật/tắt ba worker còn lại.
   *
   * Trước đây chúng chỉ đọc biến môi trường, mà `.env.production` trong repo không bao giờ được
   * ứng dụng đọc (`envFilePath` chỉ có `.env.local` và `.env`) và Vercel cũng không nạp file env từ
   * repo. Hệ quả đã xảy ra thật: job "đã bật" trong file nhưng chạy no-op trên production, im lặng.
   * Đưa vào bảng tham số thì vận hành bật/tắt được ngay từ màn Admin và tra được bằng
   * `GET /api/v1/health/config`.
   */
  {
    code: SYSTEM_PARAMETER_CODE.RESERVATION_EXPIRY_JOB_ENABLED,
    groupCode: SYSTEM_PARAMETER_GROUP.CHECKOUT,
    label: 'Bật worker trả tồn kho giữ chỗ quá hạn',
    description:
      'Tắt thì hàng đã giữ cho checkout bỏ dở không bao giờ trả về kho. Chỉ tắt khi đang xử lý sự cố.',
    valueType: SYSTEM_PARAMETER_VALUE_TYPE.BOOLEAN,
    defaultValue: 'false', sortOrder: 90,
    envFallback: 'RESERVATION_EXPIRY_JOB_ENABLED',
  },
  {
    code: SYSTEM_PARAMETER_CODE.PAYMENT_EXPIRY_JOB_ENABLED,
    groupCode: SYSTEM_PARAMETER_GROUP.PAYMENT,
    label: 'Bật worker huỷ đơn quá hạn thanh toán',
    description:
      'Tắt thì đơn chờ chuyển khoản quá hạn vẫn giữ tồn kho và không bao giờ tự huỷ.',
    valueType: SYSTEM_PARAMETER_VALUE_TYPE.BOOLEAN,
    defaultValue: 'false', sortOrder: 91,
    envFallback: 'PAYMENT_EXPIRY_JOB_ENABLED',
  },
  {
    code: SYSTEM_PARAMETER_CODE.ORDER_COMPLETION_JOB_ENABLED,
    groupCode: SYSTEM_PARAMETER_GROUP.ORDER,
    label: 'Bật worker tự hoàn tất đơn đã giao',
    description:
      'Tắt thì đơn đã giao đứng mãi ở DELIVERED và không vào doanh thu thực nhận của báo cáo.',
    valueType: SYSTEM_PARAMETER_VALUE_TYPE.BOOLEAN,
    defaultValue: 'false', sortOrder: 92,
    envFallback: 'ORDER_COMPLETION_JOB_ENABLED',
  },

];
