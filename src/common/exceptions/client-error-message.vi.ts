const VIETNAMESE_CHARACTER_PATTERN = /[À-ỹĐđ]/u;

const EXACT_MESSAGES: Readonly<Record<string, string>> = {
  'Request validation failed': 'Dữ liệu gửi lên không hợp lệ.',
  'Internal server error': 'Hệ thống đang gặp sự cố. Vui lòng thử lại sau.',
  'Request failed': 'Không thể xử lý yêu cầu. Vui lòng thử lại.',
  'Email/phone or password is incorrect': 'Email, số điện thoại hoặc mật khẩu không đúng.',
  'Bearer access token is required': 'Vui lòng đăng nhập để tiếp tục.',
  'Verified identity is required': 'Không xác định được danh tính đã xác thực.',
  'Authentication is unavailable': 'Dịch vụ xác thực tạm thời không khả dụng.',
  'Account is unavailable': 'Tài khoản hiện không khả dụng.',
  'Current password is incorrect': 'Mật khẩu hiện tại không đúng.',
  'New password must be different from the current password':
    'Mật khẩu mới phải khác mật khẩu hiện tại.',
  'Email or phone is required': 'Vui lòng nhập email hoặc số điện thoại.',
  'Provide email or phone': 'Vui lòng nhập email hoặc số điện thoại.',
  'Email or phone is already registered': 'Email hoặc số điện thoại đã được đăng ký.',
  'Phone number is invalid': 'Số điện thoại không hợp lệ.',
  'Vietnamese phone number is invalid': 'Số điện thoại Việt Nam không hợp lệ.',
  'Refresh token is invalid or expired': 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.',
  'Refresh token has already been used': 'Phiên đăng nhập này đã được sử dụng.',
  'Access token is invalid or expired': 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.',
  'Access token is invalid': 'Phiên đăng nhập không hợp lệ.',
  'Access token is no longer valid': 'Phiên đăng nhập không còn hiệu lực.',
  'Password must be changed before using this function':
    'Bạn phải đổi mật khẩu trước khi sử dụng chức năng này.',
  'Entity ID must be a positive decimal integer': 'ID phải là số nguyên dương.',
  'Idempotency-Key is required': 'Thiếu khóa chống xử lý trùng Idempotency-Key.',
  'A valid Idempotency-Key header is required':
    'Header Idempotency-Key không hợp lệ hoặc chưa được cung cấp.',
  'Idempotency-Key is too long': 'Idempotency-Key vượt quá độ dài cho phép.',
  'No branch scope is assigned': 'Tài khoản chưa được gán phạm vi chi nhánh.',
  'Branch scope is required': 'Chức năng này yêu cầu phạm vi chi nhánh.',
  'Warehouse is outside the assigned branch scope':
    'Kho không thuộc phạm vi chi nhánh được phân công.',
  'Global scope is required to view audit logs':
    'Cần phạm vi toàn hệ thống để xem nhật ký kiểm toán.',
  'User not found': 'Không tìm thấy tài khoản.',
  'Staff user not found': 'Không tìm thấy tài khoản nhân viên.',
  'Role not found': 'Không tìm thấy vai trò.',
  'Branch not found': 'Không tìm thấy chi nhánh.',
  'Branch warehouse not found': 'Không tìm thấy kho của chi nhánh.',
  'Brand not found': 'Không tìm thấy thương hiệu.',
  'Category not found': 'Không tìm thấy danh mục.',
  'Product not found': 'Không tìm thấy sản phẩm.',
  'Variant not found': 'Không tìm thấy biến thể sản phẩm.',
  'Product variant not found': 'Không tìm thấy biến thể sản phẩm.',
  'Product media not found': 'Không tìm thấy ảnh sản phẩm.',
  'Post not found': 'Không tìm thấy bài viết.',
  'Review not found': 'Không tìm thấy đánh giá.',
  'Cart item was not found': 'Không tìm thấy sản phẩm trong giỏ hàng.',
  'Active guest cart was not found': 'Không tìm thấy giỏ hàng khách hợp lệ.',
  'Active customer account was not found': 'Không tìm thấy tài khoản khách hàng đang hoạt động.',
  'Customer address was not found': 'Không tìm thấy địa chỉ khách hàng.',
  'Checkout session was not found': 'Không tìm thấy phiên thanh toán.',
  'Checkout was not found for this cart': 'Không tìm thấy phiên thanh toán của giỏ hàng này.',
  'Inventory reservation was not found': 'Không tìm thấy yêu cầu giữ hàng.',
  'Checkout or reservation was not found for this cart':
    'Không tìm thấy phiên thanh toán hoặc yêu cầu giữ hàng của giỏ hàng này.',
  'Stock transfer was not found': 'Không tìm thấy phiếu chuyển kho.',
  'Stock adjustment not found': 'Không tìm thấy phiếu điều chỉnh tồn kho.',
  'Brand code or slug already exists': 'Mã hoặc slug thương hiệu đã tồn tại.',
  'Category code or slug already exists': 'Mã hoặc slug danh mục đã tồn tại.',
  'Branch code already exists': 'Mã chi nhánh đã tồn tại.',
  'Warehouse code already exists': 'Mã kho đã tồn tại.',
  'Branch or warehouse code already exists': 'Mã chi nhánh hoặc mã kho đã tồn tại.',
  'Staff email already exists': 'Email nhân viên đã tồn tại.',
  'Role assignment already exists': 'Nhân viên đã được gán vai trò này.',
  'Product version conflict': 'Sản phẩm đã thay đổi. Vui lòng tải lại và thử lại.',
  'Variant version conflict': 'Biến thể đã thay đổi. Vui lòng tải lại và thử lại.',
  'Price effective window overlaps an existing price':
    'Khoảng thời gian áp dụng giá bị trùng với một mức giá hiện có.',
  'Cart has no sellable items': 'Giỏ hàng không có sản phẩm có thể bán.',
  'Checkout has no sellable items': 'Phiên thanh toán không có sản phẩm có thể bán.',
  'Product variant is not sellable': 'Biến thể sản phẩm hiện không thể bán.',
  'No branch currently has enough stock for the entire cart':
    'Hiện không có chi nhánh nào đủ hàng cho toàn bộ giỏ hàng.',
  'Checkout quote has expired': 'Báo giá thanh toán đã hết hạn.',
  'Reservation has not expired yet': 'Yêu cầu giữ hàng chưa hết hạn.',
  'Shipping fee cannot be negative': 'Phí giao hàng không được là số âm.',
  'Subtotal cannot be negative': 'Tạm tính không được là số âm.',
  'No shipping rate supports this destination and cart':
    'Chưa có mức phí giao hàng phù hợp với địa chỉ và giỏ hàng này.',
  'Active fulfillment branch was not found': 'Không tìm thấy chi nhánh giao hàng phù hợp.',
  'Object storage provider is not configured': 'Dịch vụ lưu trữ ảnh chưa được cấu hình.',
  'Shipping partner is not configured': 'Đối tác giao hàng chưa được cấu hình.',
  'Durable inventory storage is not enabled': 'Dịch vụ lưu trữ tồn kho chưa sẵn sàng.',
  'Durable checkout storage is not enabled': 'Dịch vụ lưu trữ thanh toán chưa sẵn sàng.',
  'Durable cart storage is not enabled': 'Dịch vụ lưu trữ giỏ hàng chưa sẵn sàng.',
  'Durable audit storage is not enabled': 'Dịch vụ lưu trữ nhật ký chưa sẵn sàng.',
  'Image type or size is not allowed': 'Định dạng hoặc dung lượng ảnh không được hỗ trợ.',
  'Uploaded image failed provider verification': 'Ảnh tải lên không vượt qua bước xác minh.',
  'Cloudinary upload signature is invalid': 'Chữ ký tải ảnh không hợp lệ.',
  'Valid cron authorization is required': 'Thông tin xác thực tác vụ định kỳ không hợp lệ.',
  'Invalid Telegram webhook secret': 'Mã bảo mật Telegram webhook không hợp lệ.',
};

const STATUS_MESSAGES: Readonly<Record<number, string>> = {
  400: 'Yêu cầu không hợp lệ.',
  401: 'Bạn chưa đăng nhập hoặc phiên đăng nhập đã hết hạn.',
  403: 'Bạn không có quyền thực hiện thao tác này.',
  404: 'Không tìm thấy dữ liệu được yêu cầu.',
  405: 'Phương thức yêu cầu không được hỗ trợ.',
  409: 'Dữ liệu đã thay đổi hoặc bị trùng. Vui lòng tải lại và thử lại.',
  413: 'Dữ liệu gửi lên vượt quá dung lượng cho phép.',
  415: 'Định dạng dữ liệu không được hỗ trợ.',
  422: 'Yêu cầu không đáp ứng quy tắc nghiệp vụ.',
  429: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.',
  500: 'Hệ thống đang gặp sự cố. Vui lòng thử lại sau.',
  502: 'Dịch vụ bên ngoài đang gặp sự cố. Vui lòng thử lại sau.',
  503: 'Dịch vụ tạm thời không khả dụng. Vui lòng thử lại sau.',
  504: 'Dịch vụ phản hồi quá lâu. Vui lòng thử lại sau.',
};

const VALIDATION_MESSAGES: Readonly<Record<string, string>> = {
  ARRAY_MAX_SIZE: 'Danh sách vượt quá số lượng cho phép.',
  ARRAY_MIN_SIZE: 'Danh sách chưa đủ số lượng yêu cầu.',
  ARRAY_NOT_EMPTY: 'Danh sách không được để trống.',
  IS_ARRAY: 'Giá trị phải là một danh sách.',
  IS_BOOLEAN: 'Giá trị phải là đúng hoặc sai.',
  IS_DATE_STRING: 'Ngày giờ không đúng định dạng.',
  IS_EMAIL: 'Email không đúng định dạng.',
  IS_ENUM: 'Giá trị không nằm trong danh sách cho phép.',
  IS_IN: 'Giá trị không nằm trong danh sách cho phép.',
  IS_INT: 'Giá trị phải là số nguyên.',
  IS_NOT_EMPTY: 'Trường này không được để trống.',
  IS_NUMBER: 'Giá trị phải là số.',
  IS_NUMBER_STRING: 'Giá trị phải là chuỗi số.',
  IS_OPTIONAL: 'Giá trị không hợp lệ.',
  IS_POSITIVE: 'Giá trị phải lớn hơn 0.',
  IS_STRING: 'Giá trị phải là chuỗi ký tự.',
  IS_URL: 'Đường dẫn không đúng định dạng.',
  IS_UUID: 'ID không đúng định dạng.',
  LENGTH: 'Độ dài không đúng yêu cầu.',
  MATCHES: 'Giá trị không đúng định dạng yêu cầu.',
  MAX: 'Giá trị vượt quá giới hạn tối đa.',
  MAX_LENGTH: 'Nội dung vượt quá độ dài tối đa.',
  MIN: 'Giá trị nhỏ hơn giới hạn tối thiểu.',
  MIN_LENGTH: 'Nội dung chưa đạt độ dài tối thiểu.',
  VALIDATE_NESTED: 'Dữ liệu lồng nhau không hợp lệ.',
  INVALID_VALUE: 'Giá trị không hợp lệ.',
};

function isVietnamese(message: string): boolean {
  return VIETNAMESE_CHARACTER_PATTERN.test(message);
}

function validationCodeKey(code: string): string {
  return code
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toUpperCase();
}

export function clientMessageVi(message: string, status: number): string {
  const normalized = message.trim();
  if (isVietnamese(normalized)) return normalized;
  return EXACT_MESSAGES[normalized] ?? STATUS_MESSAGES[status] ?? 'Không thể xử lý yêu cầu.';
}

export function validationMessageVi(code: string, message: string, field?: string): string {
  const normalized = message.trim();
  if (isVietnamese(normalized)) return normalized;
  const translated = VALIDATION_MESSAGES[validationCodeKey(code)] ?? 'Giá trị không hợp lệ.';
  return field ? `Trường "${field}": ${translated}` : translated;
}
