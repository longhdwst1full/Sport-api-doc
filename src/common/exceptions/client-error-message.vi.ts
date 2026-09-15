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

  // Bổ sung: các thông báo trước đây chưa có bản dịch nên khách chỉ thấy câu chung
  // chung theo mã HTTP, không biết lý do thật và không biết phải làm gì tiếp.
  'Account changed; retry password change':
    'Tài khoản vừa được cập nhật. Vui lòng thử đổi mật khẩu lại.',
  'Active role assignment not found': 'Không tìm thấy phân quyền đang hiệu lực.',
  'Refresh cookie is required': 'Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại.',
  'refreshToken is required': 'Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại.',
  'BRANCH scope requires one active branchId':
    'Phạm vi chi nhánh cần đúng một chi nhánh đang hoạt động.',
  'Only a LOCKED staff user can be unlocked': 'Chỉ mở khoá được nhân viên đang bị khoá.',
  'Only an ACTIVE staff user can be locked': 'Chỉ khoá được nhân viên đang hoạt động.',
  'Only subordinate branch assignments can be revoked':
    'Bạn chỉ thu hồi được phân quyền của chi nhánh cấp dưới.',
  'Only the root administrator can assign staff roles':
    'Chỉ quản trị viên gốc được gán vai trò cho nhân viên.',
  'Only the root administrator can manage staff accounts':
    'Chỉ quản trị viên gốc được quản lý tài khoản nhân viên.',
  'OWNER account cannot be locked or unlocked':
    'Không thể khoá hoặc mở khoá tài khoản chủ hệ thống.',
  'OWNER assignment cannot be revoked': 'Không thể thu hồi vai trò chủ hệ thống.',
  'OWNER is the single bootstrap administrator and cannot be assigned':
    'Chủ hệ thống là tài khoản quản trị gốc duy nhất, không thể gán thêm cho ai.',
  'Role assignment changed; reload the user list and try again':
    'Phân quyền vừa thay đổi. Vui lòng tải lại danh sách rồi thử lại.',
  'Staff status changed; reload the user list and try again':
    'Trạng thái nhân viên vừa thay đổi. Vui lòng tải lại danh sách rồi thử lại.',
  'Address changed; reload and retry': 'Địa chỉ vừa thay đổi. Vui lòng tải lại rồi thử lại.',
  'Choose another default address before removing this one':
    'Hãy chọn địa chỉ mặc định khác trước khi xoá địa chỉ này.',
  'Cart changed; reload and retry': 'Giỏ hàng vừa thay đổi. Vui lòng tải lại rồi thử lại.',
  'Cart changed while checkout was quoted; retry':
    'Giỏ hàng thay đổi trong lúc báo giá. Vui lòng thử lại.',
  'Checkout already has another reservation': 'Đơn đặt này đã có một lượt giữ hàng khác.',
  'Checkout changed; reload and retry':
    'Thông tin đặt hàng vừa thay đổi. Vui lòng tải lại rồi thử lại.',
  'Checkout is not awaiting shipping consultation':
    'Đơn đặt này không ở trạng thái chờ tư vấn giao hàng.',
  'Checkout is outside the assigned branch scope':
    'Đơn đặt này không thuộc chi nhánh bạn phụ trách.',
  'Checkout item has invalid bundle component': 'Combo trong đơn có thành phần không hợp lệ.',
  'Checkout item has invalid bundle snapshot': 'Dữ liệu combo trong đơn không hợp lệ.',
  'Checkout item snapshot has invalid quantity': 'Số lượng sản phẩm trong đơn không hợp lệ.',
  'Checkout token is required': 'Thiếu mã phiên đặt hàng.',
  'Only a quoted checkout can be confirmed': 'Chỉ xác nhận được đơn đã có báo giá.',
  'Current price changed; reload before replacing it':
    'Giá vừa thay đổi. Vui lòng tải lại trước khi cập nhật.',
  'Idempotency-Key must not exceed 130 characters': 'Khoá chống trùng quá dài.',
  'Idempotency-Key must not exceed 150 characters': 'Khoá chống trùng quá dài.',
  'Idempotency-Key was already used with another checkout':
    'Khoá chống trùng này đã dùng cho một đơn khác.',
  'Idempotency-Key was already used with another payload':
    'Khoá chống trùng này đã dùng cho một yêu cầu khác.',
  'Idempotency key was used with another checkout request':
    'Khoá chống trùng này đã dùng cho một yêu cầu đặt hàng khác.',
  'Active warehouse was not found': 'Không tìm thấy kho đang hoạt động.',
  'Both warehouses must be active': 'Cả kho nguồn và kho đích đều phải đang hoạt động.',
  'Source and destination warehouses must differ': 'Kho nguồn và kho đích phải khác nhau.',
  'Branch or warehouse version conflict':
    'Chi nhánh hoặc kho vừa được cập nhật. Vui lòng tải lại rồi thử lại.',
  'Claimed reservation has no items': 'Lượt giữ hàng không có sản phẩm nào.',
  'Claimed reservation set is inconsistent': 'Dữ liệu giữ hàng không nhất quán. Vui lòng thử lại.',
  'Inventory reservation has no items': 'Lượt giữ hàng không có sản phẩm nào.',
  'Reservation changed while expiry batch was running':
    'Lượt giữ hàng thay đổi trong lúc hệ thống dọn hàng hết hạn. Vui lòng thử lại.',
  'Reservation expiry retry limit reached':
    'Hệ thống đã thử dọn hàng hết hạn nhiều lần không thành công.',
  'Reservation token is required': 'Thiếu mã giữ hàng.',
  'Reservation was already released by another command':
    'Lượt giữ hàng đã được giải phóng bởi thao tác khác.',
  'Release reason is required': 'Vui lòng nhập lý do giải phóng hàng.',
  'Reserved inventory counter is inconsistent':
    'Số liệu hàng đang giữ không khớp. Vui lòng liên hệ quản trị.',
  'Inventory balance changed; retry with the same key':
    'Tồn kho vừa thay đổi. Vui lòng thử lại với cùng thao tác.',
  'Inventory changed concurrently; retry': 'Tồn kho vừa thay đổi. Vui lòng thử lại.',
  'Inventory changed concurrently; retry release':
    'Tồn kho vừa thay đổi. Vui lòng thử giải phóng lại.',
  'Inventory changed concurrently; retry the transfer command':
    'Tồn kho vừa thay đổi. Vui lòng thực hiện lại lệnh chuyển kho.',
  'Inventory changed concurrently; retry with the same key':
    'Tồn kho vừa thay đổi. Vui lòng thử lại với cùng thao tác.',
  'Inventory changed while expiring reservations':
    'Tồn kho thay đổi trong lúc dọn hàng hết hạn. Vui lòng thử lại.',
  'Inventory cursor is invalid': 'Con trỏ phân trang không hợp lệ.',
  'Inventory date range is invalid': 'Khoảng thời gian không hợp lệ.',
  'Adjustment items must contain unique SKU values':
    'Mỗi SKU chỉ được xuất hiện một lần trong phiếu.',
  'Adjustment must contain at least one item': 'Phiếu điều chỉnh phải có ít nhất một sản phẩm.',
  'Manual receipt reference already exists for this warehouse':
    'Số phiếu nhập này đã tồn tại ở kho.',
  'MANUAL_RECEIPT requires externalReference': 'Phiếu nhập tay cần số phiếu hoặc số chứng từ.',
  'Transfer items must contain unique SKU values':
    'Mỗi SKU chỉ được xuất hiện một lần trong phiếu chuyển.',
  'Transfer was already received with another result':
    'Phiếu chuyển đã được nhận với kết quả khác.',
  'Receive payload must contain every transfer SKU exactly once':
    'Phiếu nhận phải liệt kê đúng một lần cho mỗi SKU của phiếu chuyển.',
  'Only a SHIPPED transfer can be received': 'Chỉ nhận được phiếu chuyển đã xuất kho.',
  'Stock transfer version is stale':
    'Phiếu chuyển vừa được cập nhật. Vui lòng tải lại rồi thử lại.',
  'Categories must be unique': 'Mỗi danh mục chỉ được chọn một lần.',
  'categoryIds and primaryCategoryId must be sent together':
    'Vui lòng chọn danh mục và danh mục chính cùng lúc.',
  'Category is not active': 'Danh mục này đang ngừng hoạt động.',
  'Category version conflict': 'Danh mục vừa được cập nhật. Vui lòng tải lại rồi thử lại.',
  'Parent category is not active': 'Danh mục cha đang ngừng hoạt động.',
  'Primary category must be included in categoryIds':
    'Danh mục chính phải nằm trong các danh mục đã chọn.',
  'Brand is not active': 'Thương hiệu này đang ngừng hoạt động.',
  'Brand version conflict': 'Thương hiệu vừa được cập nhật. Vui lòng tải lại rồi thử lại.',
  'Bundle components must be unique': 'Mỗi sản phẩm chỉ được thêm một lần vào combo.',
  'Bundle contains invalid component': 'Combo có thành phần không hợp lệ.',
  'Nested bundles are not allowed': 'Không thể đặt combo bên trong combo.',
  'At least one mutable variant field is required': 'Vui lòng nhập ít nhất một thông tin cần sửa.',
  'Only ACTIVE variant can be archived': 'Chỉ lưu trữ được phiên bản đang hoạt động.',
  'Only INACTIVE variant can be reactivated': 'Chỉ kích hoạt lại được phiên bản đang ngừng.',
  'Variant must belong to the product': 'Phiên bản không thuộc sản phẩm này.',
  'Reactivate the product before its variant':
    'Hãy kích hoạt lại sản phẩm trước khi kích hoạt phiên bản.',
  'Only DRAFT product can be published': 'Chỉ đăng bán được sản phẩm đang ở bản nháp.',
  'Product slug cannot change after publish':
    'Không đổi được đường dẫn sản phẩm sau khi đã đăng bán.',
  'Product version conflict or product is archived':
    'Sản phẩm vừa được cập nhật hoặc đã lưu trữ. Vui lòng tải lại rồi thử lại.',
  'Price startsAt cannot be in the past': 'Ngày bắt đầu áp giá không được ở quá khứ.',
  'endsAt must be after startsAt': 'Ngày kết thúc phải sau ngày bắt đầu.',
  'Archived product media cannot be changed': 'Không sửa được ảnh của sản phẩm đã lưu trữ.',
  'Media asset exists but is inactive': 'Ảnh này đang ngừng sử dụng.',
  'Media asset is already attached to this target': 'Ảnh này đã được gắn vào đây.',
  'Media asset is not finalized or active': 'Ảnh chưa tải lên xong hoặc đang ngừng sử dụng.',
  'Media reorder items must be unique': 'Mỗi ảnh chỉ được sắp xếp một lần.',
  'Reorder must include every active product media item':
    'Vui lòng sắp xếp đủ tất cả ảnh đang dùng của sản phẩm.',
  'Post is already archived': 'Bài viết đã được lưu trữ.',
  'Post was changed by another request':
    'Bài viết vừa được người khác cập nhật. Vui lòng tải lại rồi thử lại.',
  'Review is already hidden': 'Đánh giá này đã được ẩn.',
  'Review was changed by another request':
    'Đánh giá vừa được người khác cập nhật. Vui lòng tải lại rồi thử lại.',
  'ETA maximum must not be less than ETA minimum':
    'Số ngày giao tối đa không được nhỏ hơn số ngày tối thiểu.',
  'GHN quote is not configured for this address':
    'Chưa cấu hình báo giá giao hàng cho địa chỉ này.',
  'GHTK quote is not configured for this address':
    'Chưa cấu hình báo giá giao hàng cho địa chỉ này.',
  'Audit cursor is invalid': 'Con trỏ phân trang không hợp lệ.',
  'Audit log write returned no row':
    'Hệ thống đang gặp sự cố khi ghi nhật ký. Vui lòng thử lại sau.',
  'Telegram bot is not configured': 'Kênh thông báo chưa được cấu hình.',
  'Telegram could not deliver the bot response': 'Không gửi được thông báo. Vui lòng thử lại sau.',
  'Active bundle variant must belong to the BUNDLE product':
    'Phiên bản combo phải thuộc đúng sản phẩm combo.',
  'Bundle definition can only be created for a BUNDLE product':
    'Chỉ tạo được cấu hình combo cho sản phẩm loại combo.',
  'STANDARD product cannot contain a bundle variant':
    'Sản phẩm thường không chứa được phiên bản combo.',
  'Every active BUNDLE variant requires an active non-empty definition, effective price and active components':
    'Combo đang bán cần có đủ thành phần, giá hiệu lực và các thành phần đều đang hoạt động.',
  'Product supplies an active published combo; archive the combo first':
    'Sản phẩm đang nằm trong một combo đang bán. Hãy lưu trữ combo đó trước.',
  'Variant is used by an active published combo; archive the combo first':
    'Phiên bản đang nằm trong một combo đang bán. Hãy lưu trữ combo đó trước.',
  'Product type cannot change after variants have been created':
    'Không đổi được loại sản phẩm sau khi đã tạo phiên bản.',
  'Published product requires an active variant and effective price':
    'Sản phẩm đăng bán cần có phiên bản đang hoạt động và giá hiệu lực.',
  'Deactivate active child categories before deactivating this category':
    'Hãy ngừng hoạt động các danh mục con trước khi ngừng danh mục này.',
  'Replacement price must start after the current price starts':
    'Giá mới phải bắt đầu sau thời điểm bắt đầu của giá hiện tại.',
  'Media sortOrder must be a unique zero-based sequence':
    'Thứ tự ảnh phải liền mạch và không trùng nhau.',
  'Set another media item as primary instead of clearing the current primary':
    'Hãy chọn ảnh khác làm ảnh chính thay vì bỏ trống ảnh chính.',
  'Committed reservation cannot be released; create a compensating stock movement':
    'Lượt giữ hàng đã chốt không giải phóng được. Hãy tạo phiếu điều chỉnh kho bù lại.',
  'Branch-scoped users may decrease at most 10 units per SKU in one adjustment':
    'Tài khoản chi nhánh chỉ được giảm tối đa 10 đơn vị cho mỗi SKU trong một phiếu.',
  'externalReference and sourceName are only allowed for MANUAL_RECEIPT':
    'Số chứng từ và nguồn hàng chỉ dùng cho phiếu nhập tay.',
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
