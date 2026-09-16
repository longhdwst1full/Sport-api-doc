const VIETNAMESE_CHARACTER_PATTERN = /[À-ỹĐđ]/u;

/**
 * Khoá thông báo lỗi do Backend ném ra, đặt tên theo miền nghiệp vụ.
 *
 * Trước đây bảng dưới dùng thẳng chuỗi tiếng Anh làm khoá: sửa một thông báo ở service
 * mà quên sửa bảng thì không có gì báo, thông báo lặng lẽ rơi về câu chung theo mã HTTP.
 * Đặt tên hằng số ở đây cho phép tra ngược "mã lỗi này là tình huống nào", giống cách
 * các service khác trong hệ thống khai báo bộ mã lỗi của mình.
 */
export const ERROR_KEY = {

  // --- SYSTEM ---
  SYSTEM_REQUEST_VALIDATION_FAILED: 'Request validation failed',
  SYSTEM_INTERNAL_SERVER_ERROR: 'Internal server error',
  SYSTEM_REQUEST_FAILED: 'Request failed',

  // --- AUTH ---
  AUTH_EMAIL_PHONE_OR_PASSWORD_IS_INCORRECT: 'Email/phone or password is incorrect',
  AUTH_BEARER_ACCESS_TOKEN_IS_REQUIRED: 'Bearer access token is required',
  AUTH_VERIFIED_IDENTITY_IS_REQUIRED: 'Verified identity is required',
  AUTH_AUTHENTICATION_IS_UNAVAILABLE: 'Authentication is unavailable',
  AUTH_ACCOUNT_IS_UNAVAILABLE: 'Account is unavailable',
  AUTH_CURRENT_PASSWORD_IS_INCORRECT: 'Current password is incorrect',
  AUTH_NEW_PASSWORD_MUST_BE_DIFFERENT_FROM_THE_CURRENT_PASSWORD: 'New password must be different from the current password',
  AUTH_EMAIL_OR_PHONE_IS_REQUIRED: 'Email or phone is required',
  AUTH_PROVIDE_EMAIL_OR_PHONE: 'Provide email or phone',
  AUTH_EMAIL_OR_PHONE_IS_ALREADY_REGISTERED: 'Email or phone is already registered',
  AUTH_PHONE_NUMBER_IS_INVALID: 'Phone number is invalid',
  AUTH_VIETNAMESE_PHONE_NUMBER_IS_INVALID: 'Vietnamese phone number is invalid',
  AUTH_REFRESH_TOKEN_IS_INVALID_OR_EXPIRED: 'Refresh token is invalid or expired',
  AUTH_REFRESH_TOKEN_HAS_ALREADY_BEEN_USED: 'Refresh token has already been used',
  AUTH_ACCESS_TOKEN_IS_INVALID_OR_EXPIRED: 'Access token is invalid or expired',
  AUTH_ACCESS_TOKEN_IS_INVALID: 'Access token is invalid',
  AUTH_ACCESS_TOKEN_IS_NO_LONGER_VALID: 'Access token is no longer valid',
  AUTH_PASSWORD_MUST_BE_CHANGED_BEFORE_USING_THIS_FUNCTION: 'Password must be changed before using this function',

  // --- SYSTEM ---
  SYSTEM_ENTITY_ID_MUST_BE_A_POSITIVE_DECIMAL_INTEGER: 'Entity ID must be a positive decimal integer',

  // --- CHECKOUT ---
  CHECKOUT_IDEMPOTENCY_KEY_IS_REQUIRED: 'Idempotency-Key is required',
  CHECKOUT_A_VALID_IDEMPOTENCY_KEY_HEADER_IS_REQUIRED: 'A valid Idempotency-Key header is required',
  CHECKOUT_IDEMPOTENCY_KEY_IS_TOO_LONG: 'Idempotency-Key is too long',

  // --- IAM ---
  IAM_NO_BRANCH_SCOPE_IS_ASSIGNED: 'No branch scope is assigned',
  IAM_BRANCH_SCOPE_IS_REQUIRED: 'Branch scope is required',
  IAM_WAREHOUSE_IS_OUTSIDE_THE_ASSIGNED_BRANCH_SCOPE: 'Warehouse is outside the assigned branch scope',
  IAM_GLOBAL_SCOPE_IS_REQUIRED_TO_VIEW_AUDIT_LOGS: 'Global scope is required to view audit logs',
  IAM_USER_NOT_FOUND: 'User not found',
  IAM_STAFF_USER_NOT_FOUND: 'Staff user not found',
  IAM_ROLE_NOT_FOUND: 'Role not found',

  // --- BRANCH ---
  BRANCH_BRANCH_NOT_FOUND: 'Branch not found',

  // --- INVENTORY ---
  INVENTORY_BRANCH_WAREHOUSE_NOT_FOUND: 'Branch warehouse not found',

  // --- CATALOG ---
  CATALOG_BRAND_NOT_FOUND: 'Brand not found',
  CATALOG_CATEGORY_NOT_FOUND: 'Category not found',
  CATALOG_PRODUCT_NOT_FOUND: 'Product not found',
  CATALOG_VARIANT_NOT_FOUND: 'Variant not found',
  CATALOG_PRODUCT_VARIANT_NOT_FOUND: 'Product variant not found',
  CATALOG_PRODUCT_MEDIA_NOT_FOUND: 'Product media not found',

  // --- CONTENT ---
  CONTENT_POST_NOT_FOUND: 'Post not found',

  // --- REVIEW ---
  REVIEW_REVIEW_NOT_FOUND: 'Review not found',

  // --- CART ---
  CART_CART_ITEM_WAS_NOT_FOUND: 'Cart item was not found',
  CART_ACTIVE_GUEST_CART_WAS_NOT_FOUND: 'Active guest cart was not found',

  // --- AUTH ---
  AUTH_ACTIVE_CUSTOMER_ACCOUNT_WAS_NOT_FOUND: 'Active customer account was not found',

  // --- SHIPPING ---
  SHIPPING_CUSTOMER_ADDRESS_WAS_NOT_FOUND: 'Customer address was not found',

  // --- AUTH ---
  AUTH_CHECKOUT_SESSION_WAS_NOT_FOUND: 'Checkout session was not found',

  // --- CART ---
  CART_CHECKOUT_WAS_NOT_FOUND_FOR_THIS_CART: 'Checkout was not found for this cart',

  // --- CHECKOUT ---
  CHECKOUT_INVENTORY_RESERVATION_WAS_NOT_FOUND: 'Inventory reservation was not found',

  // --- CART ---
  CART_CHECKOUT_OR_RESERVATION_WAS_NOT_FOUND_FOR_THIS_CART: 'Checkout or reservation was not found for this cart',

  // --- INVENTORY ---
  INVENTORY_STOCK_TRANSFER_WAS_NOT_FOUND: 'Stock transfer was not found',
  INVENTORY_STOCK_ADJUSTMENT_NOT_FOUND: 'Stock adjustment not found',

  // --- CATALOG ---
  CATALOG_BRAND_CODE_OR_SLUG_ALREADY_EXISTS: 'Brand code or slug already exists',
  CATALOG_CATEGORY_CODE_OR_SLUG_ALREADY_EXISTS: 'Category code or slug already exists',

  // --- BRANCH ---
  BRANCH_BRANCH_CODE_ALREADY_EXISTS: 'Branch code already exists',

  // --- INVENTORY ---
  INVENTORY_WAREHOUSE_CODE_ALREADY_EXISTS: 'Warehouse code already exists',
  INVENTORY_BRANCH_OR_WAREHOUSE_CODE_ALREADY_EXISTS: 'Branch or warehouse code already exists',

  // --- IAM ---
  IAM_STAFF_EMAIL_ALREADY_EXISTS: 'Staff email already exists',
  IAM_ROLE_ASSIGNMENT_ALREADY_EXISTS: 'Role assignment already exists',

  // --- CATALOG ---
  CATALOG_PRODUCT_VERSION_CONFLICT: 'Product version conflict',
  CATALOG_VARIANT_VERSION_CONFLICT: 'Variant version conflict',
  CATALOG_PRICE_EFFECTIVE_WINDOW_OVERLAPS_AN_EXISTING_PRICE: 'Price effective window overlaps an existing price',

  // --- CART ---
  CART_CART_HAS_NO_SELLABLE_ITEMS: 'Cart has no sellable items',

  // --- CHECKOUT ---
  CHECKOUT_CHECKOUT_HAS_NO_SELLABLE_ITEMS: 'Checkout has no sellable items',

  // --- CATALOG ---
  CATALOG_PRODUCT_VARIANT_IS_NOT_SELLABLE: 'Product variant is not sellable',

  // --- CART ---
  CART_NO_BRANCH_CURRENTLY_HAS_ENOUGH_STOCK_FOR_THE_ENTIRE_CART: 'No branch currently has enough stock for the entire cart',

  // --- CHECKOUT ---
  CHECKOUT_CHECKOUT_QUOTE_HAS_EXPIRED: 'Checkout quote has expired',
  CHECKOUT_RESERVATION_HAS_NOT_EXPIRED_YET: 'Reservation has not expired yet',

  // --- SHIPPING ---
  SHIPPING_SHIPPING_FEE_CANNOT_BE_NEGATIVE: 'Shipping fee cannot be negative',

  // --- SYSTEM ---
  SYSTEM_SUBTOTAL_CANNOT_BE_NEGATIVE: 'Subtotal cannot be negative',

  // --- CART ---
  CART_NO_SHIPPING_RATE_SUPPORTS_THIS_DESTINATION_AND_CART: 'No shipping rate supports this destination and cart',

  // --- BRANCH ---
  BRANCH_ACTIVE_FULFILLMENT_BRANCH_WAS_NOT_FOUND: 'Active fulfillment branch was not found',

  // --- MEDIA ---
  MEDIA_OBJECT_STORAGE_PROVIDER_IS_NOT_CONFIGURED: 'Object storage provider is not configured',

  // --- EMAIL ---
  EMAIL_PROVIDER_IS_NOT_CONFIGURED: 'Email provider is not configured',
  EMAIL_PROVIDER_REJECTED_THE_MESSAGE: 'Email provider rejected the message',
  EMAIL_HAS_NO_RECIPIENT: 'Email has no recipient',

  // --- SHIPPING ---
  SHIPPING_SHIPPING_PARTNER_IS_NOT_CONFIGURED: 'Shipping partner is not configured',
  SHIPPING_GHN_IS_NOT_REACHABLE: 'GHN is not reachable',
  SHIPPING_GHN_DID_NOT_RETURN_A_TRACKING_CODE: 'GHN did not return a tracking code',
  SHIPPING_GHN_DID_NOT_RETURN_A_PRINT_TOKEN: 'GHN did not return a print token',
  SHIPPING_GHN_LABEL_REQUIRES_AT_LEAST_ONE_TRACKING_CODE:
    'GHN label requires at least one tracking code',
  SHIPPING_GHN_SHIPMENT_REQUIRES_RECIPIENT_DISTRICT_AND_WARD_CODES:
    'GHN shipment requires recipient district and ward codes',
  SHIPPING_GHN_WEBHOOK_SECRET_IS_NOT_CONFIGURED: 'GHN webhook secret is not configured',
  SHIPPING_GHN_WEBHOOK_ACTOR_USER_IS_NOT_CONFIGURED: 'GHN webhook actor user is not configured',
  SHIPPING_INVALID_GHN_WEBHOOK_SECRET: 'Invalid GHN webhook secret',

  // --- INVENTORY ---
  INVENTORY_DURABLE_INVENTORY_STORAGE_IS_NOT_ENABLED: 'Durable inventory storage is not enabled',

  // --- CHECKOUT ---
  CHECKOUT_DURABLE_CHECKOUT_STORAGE_IS_NOT_ENABLED: 'Durable checkout storage is not enabled',

  // --- CART ---
  CART_DURABLE_CART_STORAGE_IS_NOT_ENABLED: 'Durable cart storage is not enabled',

  // --- AUDIT ---
  AUDIT_DURABLE_AUDIT_STORAGE_IS_NOT_ENABLED: 'Durable audit storage is not enabled',

  // --- MEDIA ---
  MEDIA_IMAGE_TYPE_OR_SIZE_IS_NOT_ALLOWED: 'Image type or size is not allowed',
  MEDIA_UPLOADED_IMAGE_FAILED_PROVIDER_VERIFICATION: 'Uploaded image failed provider verification',
  MEDIA_CLOUDINARY_UPLOAD_SIGNATURE_IS_INVALID: 'Cloudinary upload signature is invalid',

  // --- SYSTEM ---
  SYSTEM_VALID_CRON_AUTHORIZATION_IS_REQUIRED: 'Valid cron authorization is required',
  SYSTEM_INVALID_TELEGRAM_WEBHOOK_SECRET: 'Invalid Telegram webhook secret',

  // --- AUTH ---
  AUTH_ACCOUNT_CHANGED_RETRY_PASSWORD_CHANGE: 'Account changed; retry password change',

  // --- IAM ---
  IAM_ACTIVE_ROLE_ASSIGNMENT_NOT_FOUND: 'Active role assignment not found',

  // --- AUTH ---
  AUTH_REFRESH_COOKIE_IS_REQUIRED: 'Refresh cookie is required',
  AUTH_REFRESHTOKEN_IS_REQUIRED: 'refreshToken is required',

  // --- IAM ---
  IAM_BRANCH_SCOPE_REQUIRES_ONE_ACTIVE_BRANCHID: 'BRANCH scope requires one active branchId',
  IAM_ONLY_A_LOCKED_STAFF_USER_CAN_BE_UNLOCKED: 'Only a LOCKED staff user can be unlocked',
  IAM_ONLY_AN_ACTIVE_STAFF_USER_CAN_BE_LOCKED: 'Only an ACTIVE staff user can be locked',

  // --- BRANCH ---
  BRANCH_ONLY_SUBORDINATE_BRANCH_ASSIGNMENTS_CAN_BE_REVOKED: 'Only subordinate branch assignments can be revoked',

  // --- IAM ---
  IAM_ONLY_THE_ROOT_ADMINISTRATOR_CAN_ASSIGN_STAFF_ROLES: 'Only the root administrator can assign staff roles',

  // --- AUTH ---
  AUTH_ONLY_THE_ROOT_ADMINISTRATOR_CAN_MANAGE_STAFF_ACCOUNTS: 'Only the root administrator can manage staff accounts',
  AUTH_OWNER_ACCOUNT_CANNOT_BE_LOCKED_OR_UNLOCKED: 'OWNER account cannot be locked or unlocked',

  // --- IAM ---
  IAM_OWNER_ASSIGNMENT_CANNOT_BE_REVOKED: 'OWNER assignment cannot be revoked',
  IAM_OWNER_IS_THE_SINGLE_BOOTSTRAP_ADMINISTRATOR_AND_CANNOT_BE: 'OWNER is the single bootstrap administrator and cannot be assigned',
  IAM_ROLE_ASSIGNMENT_CHANGED_RELOAD_THE_USER_LIST_AND_TRY_AGAIN: 'Role assignment changed; reload the user list and try again',
  IAM_STAFF_STATUS_CHANGED_RELOAD_THE_USER_LIST_AND_TRY_AGAIN: 'Staff status changed; reload the user list and try again',

  // --- SHIPPING ---
  SHIPPING_ADDRESS_CHANGED_RELOAD_AND_RETRY: 'Address changed; reload and retry',
  SHIPPING_CHOOSE_ANOTHER_DEFAULT_ADDRESS_BEFORE_REMOVING_THIS_ONE: 'Choose another default address before removing this one',

  // --- CART ---
  CART_CART_CHANGED_RELOAD_AND_RETRY: 'Cart changed; reload and retry',
  CART_CART_CHANGED_WHILE_CHECKOUT_WAS_QUOTED_RETRY: 'Cart changed while checkout was quoted; retry',

  // --- CHECKOUT ---
  CHECKOUT_CHECKOUT_ALREADY_HAS_ANOTHER_RESERVATION: 'Checkout already has another reservation',
  CHECKOUT_CHECKOUT_CHANGED_RELOAD_AND_RETRY: 'Checkout changed; reload and retry',
  CHECKOUT_CHECKOUT_IS_NOT_AWAITING_SHIPPING_CONSULTATION: 'Checkout is not awaiting shipping consultation',

  // --- IAM ---
  IAM_CHECKOUT_IS_OUTSIDE_THE_ASSIGNED_BRANCH_SCOPE: 'Checkout is outside the assigned branch scope',

  // --- CHECKOUT ---
  CHECKOUT_CHECKOUT_ITEM_HAS_INVALID_BUNDLE_COMPONENT: 'Checkout item has invalid bundle component',
  CHECKOUT_CHECKOUT_ITEM_HAS_INVALID_BUNDLE_SNAPSHOT: 'Checkout item has invalid bundle snapshot',
  CHECKOUT_CHECKOUT_ITEM_SNAPSHOT_HAS_INVALID_QUANTITY: 'Checkout item snapshot has invalid quantity',

  // --- AUTH ---
  AUTH_CHECKOUT_TOKEN_IS_REQUIRED: 'Checkout token is required',

  // --- CHECKOUT ---
  CHECKOUT_ONLY_A_QUOTED_CHECKOUT_CAN_BE_CONFIRMED: 'Only a quoted checkout can be confirmed',

  // --- CATALOG ---
  CATALOG_CURRENT_PRICE_CHANGED_RELOAD_BEFORE_REPLACING_IT: 'Current price changed; reload before replacing it',

  // --- CHECKOUT ---
  CHECKOUT_IDEMPOTENCY_KEY_MUST_NOT_EXCEED_130_CHARACTERS: 'Idempotency-Key must not exceed 130 characters',
  CHECKOUT_IDEMPOTENCY_KEY_MUST_NOT_EXCEED_150_CHARACTERS: 'Idempotency-Key must not exceed 150 characters',
  CHECKOUT_IDEMPOTENCY_KEY_WAS_ALREADY_USED_WITH_ANOTHER_CHECKOUT: 'Idempotency-Key was already used with another checkout',
  CHECKOUT_IDEMPOTENCY_KEY_WAS_ALREADY_USED_WITH_ANOTHER_PAYLOAD: 'Idempotency-Key was already used with another payload',
  CHECKOUT_IDEMPOTENCY_KEY_WAS_USED_WITH_ANOTHER_CHECKOUT_REQUEST: 'Idempotency key was used with another checkout request',

  // --- INVENTORY ---
  INVENTORY_ACTIVE_WAREHOUSE_WAS_NOT_FOUND: 'Active warehouse was not found',
  INVENTORY_BOTH_WAREHOUSES_MUST_BE_ACTIVE: 'Both warehouses must be active',
  INVENTORY_SOURCE_AND_DESTINATION_WAREHOUSES_MUST_DIFFER: 'Source and destination warehouses must differ',
  INVENTORY_BRANCH_OR_WAREHOUSE_VERSION_CONFLICT: 'Branch or warehouse version conflict',

  // --- CHECKOUT ---
  CHECKOUT_CLAIMED_RESERVATION_HAS_NO_ITEMS: 'Claimed reservation has no items',
  CHECKOUT_CLAIMED_RESERVATION_SET_IS_INCONSISTENT: 'Claimed reservation set is inconsistent',
  CHECKOUT_INVENTORY_RESERVATION_HAS_NO_ITEMS: 'Inventory reservation has no items',
  CHECKOUT_RESERVATION_CHANGED_WHILE_EXPIRY_BATCH_WAS_RUNNING: 'Reservation changed while expiry batch was running',
  CHECKOUT_RESERVATION_EXPIRY_RETRY_LIMIT_REACHED: 'Reservation expiry retry limit reached',

  // --- AUTH ---
  AUTH_RESERVATION_TOKEN_IS_REQUIRED: 'Reservation token is required',

  // --- CHECKOUT ---
  CHECKOUT_RESERVATION_WAS_ALREADY_RELEASED_BY_ANOTHER_COMMAND: 'Reservation was already released by another command',

  // --- SYSTEM ---
  SYSTEM_RELEASE_REASON_IS_REQUIRED: 'Release reason is required',

  // --- INVENTORY ---
  INVENTORY_RESERVED_INVENTORY_COUNTER_IS_INCONSISTENT: 'Reserved inventory counter is inconsistent',
  INVENTORY_INVENTORY_BALANCE_CHANGED_RETRY_WITH_THE_SAME_KEY: 'Inventory balance changed; retry with the same key',
  INVENTORY_INVENTORY_CHANGED_CONCURRENTLY_RETRY: 'Inventory changed concurrently; retry',
  INVENTORY_INVENTORY_CHANGED_CONCURRENTLY_RETRY_RELEASE: 'Inventory changed concurrently; retry release',
  INVENTORY_INVENTORY_CHANGED_CONCURRENTLY_RETRY_THE_TRANSFER_COMMAND: 'Inventory changed concurrently; retry the transfer command',
  INVENTORY_INVENTORY_CHANGED_CONCURRENTLY_RETRY_WITH_THE_SAME_KEY: 'Inventory changed concurrently; retry with the same key',

  // --- CHECKOUT ---
  CHECKOUT_INVENTORY_CHANGED_WHILE_EXPIRING_RESERVATIONS: 'Inventory changed while expiring reservations',

  // --- INVENTORY ---
  INVENTORY_INVENTORY_CURSOR_IS_INVALID: 'Inventory cursor is invalid',
  INVENTORY_INVENTORY_DATE_RANGE_IS_INVALID: 'Inventory date range is invalid',
  INVENTORY_ADJUSTMENT_ITEMS_MUST_CONTAIN_UNIQUE_SKU_VALUES: 'Adjustment items must contain unique SKU values',
  INVENTORY_ADJUSTMENT_MUST_CONTAIN_AT_LEAST_ONE_ITEM: 'Adjustment must contain at least one item',
  INVENTORY_MANUAL_RECEIPT_REFERENCE_ALREADY_EXISTS_FOR_THIS_WAREHOUSE: 'Manual receipt reference already exists for this warehouse',
  INVENTORY_MANUAL_RECEIPT_REQUIRES_EXTERNALREFERENCE: 'MANUAL_RECEIPT requires externalReference',
  INVENTORY_TRANSFER_ITEMS_MUST_CONTAIN_UNIQUE_SKU_VALUES: 'Transfer items must contain unique SKU values',
  INVENTORY_TRANSFER_WAS_ALREADY_RECEIVED_WITH_ANOTHER_RESULT: 'Transfer was already received with another result',
  INVENTORY_RECEIVE_PAYLOAD_MUST_CONTAIN_EVERY_TRANSFER_SKU_EXACTLY_ON: 'Receive payload must contain every transfer SKU exactly once',
  INVENTORY_ONLY_A_SHIPPED_TRANSFER_CAN_BE_RECEIVED: 'Only a SHIPPED transfer can be received',
  INVENTORY_STOCK_TRANSFER_VERSION_IS_STALE: 'Stock transfer version is stale',

  // --- CATALOG ---
  CATALOG_CATEGORIES_MUST_BE_UNIQUE: 'Categories must be unique',
  CATALOG_CATEGORYIDS_AND_PRIMARYCATEGORYID_MUST_BE_SENT_TOGETHER: 'categoryIds and primaryCategoryId must be sent together',
  CATALOG_CATEGORY_IS_NOT_ACTIVE: 'Category is not active',
  CATALOG_CATEGORY_VERSION_CONFLICT: 'Category version conflict',
  CATALOG_PARENT_CATEGORY_IS_NOT_ACTIVE: 'Parent category is not active',
  CATALOG_PRIMARY_CATEGORY_MUST_BE_INCLUDED_IN_CATEGORYIDS: 'Primary category must be included in categoryIds',
  CATALOG_BRAND_IS_NOT_ACTIVE: 'Brand is not active',
  CATALOG_BRAND_VERSION_CONFLICT: 'Brand version conflict',
  CATALOG_BUNDLE_COMPONENTS_MUST_BE_UNIQUE: 'Bundle components must be unique',
  CATALOG_BUNDLE_CONTAINS_INVALID_COMPONENT: 'Bundle contains invalid component',
  CATALOG_NESTED_BUNDLES_ARE_NOT_ALLOWED: 'Nested bundles are not allowed',
  CATALOG_AT_LEAST_ONE_MUTABLE_VARIANT_FIELD_IS_REQUIRED: 'At least one mutable variant field is required',
  CATALOG_ONLY_ACTIVE_VARIANT_CAN_BE_ARCHIVED: 'Only ACTIVE variant can be archived',
  CATALOG_ONLY_INACTIVE_VARIANT_CAN_BE_REACTIVATED: 'Only INACTIVE variant can be reactivated',
  CATALOG_VARIANT_MUST_BELONG_TO_THE_PRODUCT: 'Variant must belong to the product',
  CATALOG_REACTIVATE_THE_PRODUCT_BEFORE_ITS_VARIANT: 'Reactivate the product before its variant',
  CATALOG_ONLY_DRAFT_PRODUCT_CAN_BE_PUBLISHED: 'Only DRAFT product can be published',
  CATALOG_PRODUCT_SLUG_CANNOT_CHANGE_AFTER_PUBLISH: 'Product slug cannot change after publish',
  CATALOG_PRODUCT_VERSION_CONFLICT_OR_PRODUCT_IS_ARCHIVED: 'Product version conflict or product is archived',
  CATALOG_PRICE_STARTSAT_CANNOT_BE_IN_THE_PAST: 'Price startsAt cannot be in the past',

  // --- SYSTEM ---
  SYSTEM_ENDSAT_MUST_BE_AFTER_STARTSAT: 'endsAt must be after startsAt',

  // --- CATALOG ---
  CATALOG_ARCHIVED_PRODUCT_MEDIA_CANNOT_BE_CHANGED: 'Archived product media cannot be changed',

  // --- MEDIA ---
  MEDIA_MEDIA_ASSET_EXISTS_BUT_IS_INACTIVE: 'Media asset exists but is inactive',
  MEDIA_MEDIA_ASSET_IS_ALREADY_ATTACHED_TO_THIS_TARGET: 'Media asset is already attached to this target',
  MEDIA_MEDIA_ASSET_IS_NOT_FINALIZED_OR_ACTIVE: 'Media asset is not finalized or active',
  MEDIA_MEDIA_REORDER_ITEMS_MUST_BE_UNIQUE: 'Media reorder items must be unique',

  // --- CATALOG ---
  CATALOG_REORDER_MUST_INCLUDE_EVERY_ACTIVE_PRODUCT_MEDIA_ITEM: 'Reorder must include every active product media item',

  // --- CONTENT ---
  CONTENT_POST_IS_ALREADY_ARCHIVED: 'Post is already archived',
  CONTENT_POST_WAS_CHANGED_BY_ANOTHER_REQUEST: 'Post was changed by another request',

  // --- REVIEW ---
  REVIEW_REVIEW_IS_ALREADY_HIDDEN: 'Review is already hidden',
  REVIEW_REVIEW_WAS_CHANGED_BY_ANOTHER_REQUEST: 'Review was changed by another request',

  // --- SHIPPING ---
  SHIPPING_ETA_MAXIMUM_MUST_NOT_BE_LESS_THAN_ETA_MINIMUM: 'ETA maximum must not be less than ETA minimum',

  // --- CHECKOUT ---
  CHECKOUT_GHN_QUOTE_IS_NOT_CONFIGURED_FOR_THIS_ADDRESS: 'GHN quote is not configured for this address',
  CHECKOUT_GHTK_QUOTE_IS_NOT_CONFIGURED_FOR_THIS_ADDRESS: 'GHTK quote is not configured for this address',

  // --- AUDIT ---
  AUDIT_AUDIT_CURSOR_IS_INVALID: 'Audit cursor is invalid',
  AUDIT_AUDIT_LOG_WRITE_RETURNED_NO_ROW: 'Audit log write returned no row',

  // --- SYSTEM ---
  SYSTEM_TELEGRAM_BOT_IS_NOT_CONFIGURED: 'Telegram bot is not configured',
  SYSTEM_TELEGRAM_COULD_NOT_DELIVER_THE_BOT_RESPONSE: 'Telegram could not deliver the bot response',

  // --- CATALOG ---
  CATALOG_ACTIVE_BUNDLE_VARIANT_MUST_BELONG_TO_THE_BUNDLE_PRODUCT: 'Active bundle variant must belong to the BUNDLE product',
  CATALOG_BUNDLE_DEFINITION_CAN_ONLY_BE_CREATED_FOR_A_BUNDLE_PRODUCT: 'Bundle definition can only be created for a BUNDLE product',
  CATALOG_STANDARD_PRODUCT_CANNOT_CONTAIN_A_BUNDLE_VARIANT: 'STANDARD product cannot contain a bundle variant',
  CATALOG_EVERY_ACTIVE_BUNDLE_VARIANT_REQUIRES_AN_ACTIVE_NON_EMPTY_D: 'Every active BUNDLE variant requires an active non-empty definition, effective price and active components',
  CATALOG_PRODUCT_SUPPLIES_AN_ACTIVE_PUBLISHED_COMBO_ARCHIVE_THE_COM: 'Product supplies an active published combo; archive the combo first',
  CATALOG_VARIANT_IS_USED_BY_AN_ACTIVE_PUBLISHED_COMBO_ARCHIVE_THE_C: 'Variant is used by an active published combo; archive the combo first',
  CATALOG_PRODUCT_TYPE_CANNOT_CHANGE_AFTER_VARIANTS_HAVE_BEEN_CREATE: 'Product type cannot change after variants have been created',
  CATALOG_PUBLISHED_PRODUCT_REQUIRES_AN_ACTIVE_VARIANT_AND_EFFECTIVE: 'Published product requires an active variant and effective price',
  CATALOG_DEACTIVATE_ACTIVE_CHILD_CATEGORIES_BEFORE_DEACTIVATING_THI: 'Deactivate active child categories before deactivating this category',
  CATALOG_REPLACEMENT_PRICE_MUST_START_AFTER_THE_CURRENT_PRICE_START: 'Replacement price must start after the current price starts',

  // --- MEDIA ---
  MEDIA_MEDIA_SORTORDER_MUST_BE_A_UNIQUE_ZERO_BASED_SEQUENCE: 'Media sortOrder must be a unique zero-based sequence',
  MEDIA_SET_ANOTHER_MEDIA_ITEM_AS_PRIMARY_INSTEAD_OF_CLEARING_THE: 'Set another media item as primary instead of clearing the current primary',

  // --- CHECKOUT ---
  CHECKOUT_COMMITTED_RESERVATION_CANNOT_BE_RELEASED_CREATE_A_COMPENSA: 'Committed reservation cannot be released; create a compensating stock movement',

  // --- IAM ---
  IAM_BRANCH_SCOPED_USERS_MAY_DECREASE_AT_MOST_10_UNITS_PER_SKU: 'Branch-scoped users may decrease at most 10 units per SKU in one adjustment',

  // --- INVENTORY ---
  INVENTORY_EXTERNALREFERENCE_AND_SOURCENAME_ARE_ONLY_ALLOWED_FOR_MANU: 'externalReference and sourceName are only allowed for MANUAL_RECEIPT',
} as const;

const EXACT_MESSAGES: Readonly<Record<string, string>> = {
  [ERROR_KEY.SYSTEM_REQUEST_VALIDATION_FAILED]: 'Dữ liệu gửi lên không hợp lệ.',
  [ERROR_KEY.SYSTEM_INTERNAL_SERVER_ERROR]: 'Hệ thống đang gặp sự cố. Vui lòng thử lại sau.',
  [ERROR_KEY.SYSTEM_REQUEST_FAILED]: 'Không thể xử lý yêu cầu. Vui lòng thử lại.',
  [ERROR_KEY.AUTH_EMAIL_PHONE_OR_PASSWORD_IS_INCORRECT]:
    'Email, số điện thoại hoặc mật khẩu không đúng.',
  [ERROR_KEY.AUTH_BEARER_ACCESS_TOKEN_IS_REQUIRED]: 'Vui lòng đăng nhập để tiếp tục.',
  [ERROR_KEY.AUTH_VERIFIED_IDENTITY_IS_REQUIRED]: 'Không xác định được danh tính đã xác thực.',
  [ERROR_KEY.AUTH_AUTHENTICATION_IS_UNAVAILABLE]: 'Dịch vụ xác thực tạm thời không khả dụng.',
  [ERROR_KEY.AUTH_ACCOUNT_IS_UNAVAILABLE]: 'Tài khoản hiện không khả dụng.',
  [ERROR_KEY.AUTH_CURRENT_PASSWORD_IS_INCORRECT]: 'Mật khẩu hiện tại không đúng.',
  [ERROR_KEY.AUTH_NEW_PASSWORD_MUST_BE_DIFFERENT_FROM_THE_CURRENT_PASSWORD]:
    'Mật khẩu mới phải khác mật khẩu hiện tại.',
  [ERROR_KEY.AUTH_EMAIL_OR_PHONE_IS_REQUIRED]: 'Vui lòng nhập email hoặc số điện thoại.',
  [ERROR_KEY.AUTH_PROVIDE_EMAIL_OR_PHONE]: 'Vui lòng nhập email hoặc số điện thoại.',
  [ERROR_KEY.AUTH_EMAIL_OR_PHONE_IS_ALREADY_REGISTERED]:
    'Email hoặc số điện thoại đã được đăng ký.',
  [ERROR_KEY.AUTH_PHONE_NUMBER_IS_INVALID]: 'Số điện thoại không hợp lệ.',
  [ERROR_KEY.AUTH_VIETNAMESE_PHONE_NUMBER_IS_INVALID]: 'Số điện thoại Việt Nam không hợp lệ.',
  [ERROR_KEY.AUTH_REFRESH_TOKEN_IS_INVALID_OR_EXPIRED]:
    'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.',
  [ERROR_KEY.AUTH_REFRESH_TOKEN_HAS_ALREADY_BEEN_USED]: 'Phiên đăng nhập này đã được sử dụng.',
  [ERROR_KEY.AUTH_ACCESS_TOKEN_IS_INVALID_OR_EXPIRED]:
    'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.',
  [ERROR_KEY.AUTH_ACCESS_TOKEN_IS_INVALID]: 'Phiên đăng nhập không hợp lệ.',
  [ERROR_KEY.AUTH_ACCESS_TOKEN_IS_NO_LONGER_VALID]: 'Phiên đăng nhập không còn hiệu lực.',
  [ERROR_KEY.AUTH_PASSWORD_MUST_BE_CHANGED_BEFORE_USING_THIS_FUNCTION]:
    'Bạn phải đổi mật khẩu trước khi sử dụng chức năng này.',
  [ERROR_KEY.SYSTEM_ENTITY_ID_MUST_BE_A_POSITIVE_DECIMAL_INTEGER]: 'ID phải là số nguyên dương.',
  [ERROR_KEY.CHECKOUT_IDEMPOTENCY_KEY_IS_REQUIRED]: 'Không gửi được yêu cầu. Vui lòng thử lại.',
  [ERROR_KEY.CHECKOUT_A_VALID_IDEMPOTENCY_KEY_HEADER_IS_REQUIRED]:
    'Không gửi được yêu cầu. Vui lòng thử lại.',
  [ERROR_KEY.CHECKOUT_IDEMPOTENCY_KEY_IS_TOO_LONG]: 'Không gửi được yêu cầu. Vui lòng thử lại.',
  [ERROR_KEY.IAM_NO_BRANCH_SCOPE_IS_ASSIGNED]: 'Tài khoản chưa được gán phạm vi chi nhánh.',
  [ERROR_KEY.IAM_BRANCH_SCOPE_IS_REQUIRED]: 'Chức năng này yêu cầu phạm vi chi nhánh.',
  [ERROR_KEY.IAM_WAREHOUSE_IS_OUTSIDE_THE_ASSIGNED_BRANCH_SCOPE]:
    'Kho không thuộc phạm vi chi nhánh được phân công.',
  [ERROR_KEY.IAM_GLOBAL_SCOPE_IS_REQUIRED_TO_VIEW_AUDIT_LOGS]:
    'Cần phạm vi toàn hệ thống để xem nhật ký kiểm toán.',
  [ERROR_KEY.IAM_USER_NOT_FOUND]: 'Không tìm thấy tài khoản.',
  [ERROR_KEY.IAM_STAFF_USER_NOT_FOUND]: 'Không tìm thấy tài khoản nhân viên.',
  [ERROR_KEY.IAM_ROLE_NOT_FOUND]: 'Không tìm thấy vai trò.',
  [ERROR_KEY.BRANCH_BRANCH_NOT_FOUND]: 'Không tìm thấy chi nhánh.',
  [ERROR_KEY.INVENTORY_BRANCH_WAREHOUSE_NOT_FOUND]: 'Không tìm thấy kho của chi nhánh.',
  [ERROR_KEY.CATALOG_BRAND_NOT_FOUND]: 'Không tìm thấy thương hiệu.',
  [ERROR_KEY.CATALOG_CATEGORY_NOT_FOUND]: 'Không tìm thấy danh mục.',
  [ERROR_KEY.CATALOG_PRODUCT_NOT_FOUND]: 'Không tìm thấy sản phẩm.',
  [ERROR_KEY.CATALOG_VARIANT_NOT_FOUND]: 'Không tìm thấy biến thể sản phẩm.',
  [ERROR_KEY.CATALOG_PRODUCT_VARIANT_NOT_FOUND]: 'Không tìm thấy biến thể sản phẩm.',
  [ERROR_KEY.CATALOG_PRODUCT_MEDIA_NOT_FOUND]: 'Không tìm thấy ảnh sản phẩm.',
  [ERROR_KEY.CONTENT_POST_NOT_FOUND]: 'Không tìm thấy bài viết.',
  [ERROR_KEY.REVIEW_REVIEW_NOT_FOUND]: 'Không tìm thấy đánh giá.',
  [ERROR_KEY.CART_CART_ITEM_WAS_NOT_FOUND]: 'Không tìm thấy sản phẩm trong giỏ hàng.',
  [ERROR_KEY.CART_ACTIVE_GUEST_CART_WAS_NOT_FOUND]: 'Không tìm thấy giỏ hàng khách hợp lệ.',
  [ERROR_KEY.AUTH_ACTIVE_CUSTOMER_ACCOUNT_WAS_NOT_FOUND]:
    'Không tìm thấy tài khoản khách hàng đang hoạt động.',
  [ERROR_KEY.SHIPPING_CUSTOMER_ADDRESS_WAS_NOT_FOUND]: 'Không tìm thấy địa chỉ khách hàng.',
  [ERROR_KEY.AUTH_CHECKOUT_SESSION_WAS_NOT_FOUND]: 'Không tìm thấy phiên thanh toán.',
  [ERROR_KEY.CART_CHECKOUT_WAS_NOT_FOUND_FOR_THIS_CART]:
    'Không tìm thấy phiên thanh toán của giỏ hàng này.',
  [ERROR_KEY.CHECKOUT_INVENTORY_RESERVATION_WAS_NOT_FOUND]: 'Không tìm thấy yêu cầu giữ hàng.',
  [ERROR_KEY.CART_CHECKOUT_OR_RESERVATION_WAS_NOT_FOUND_FOR_THIS_CART]:
    'Không tìm thấy phiên thanh toán hoặc yêu cầu giữ hàng của giỏ hàng này.',
  [ERROR_KEY.INVENTORY_STOCK_TRANSFER_WAS_NOT_FOUND]: 'Không tìm thấy phiếu chuyển kho.',
  [ERROR_KEY.INVENTORY_STOCK_ADJUSTMENT_NOT_FOUND]: 'Không tìm thấy phiếu điều chỉnh tồn kho.',
  [ERROR_KEY.CATALOG_BRAND_CODE_OR_SLUG_ALREADY_EXISTS]: 'Mã hoặc đường dẫn thương hiệu đã tồn tại.',
  [ERROR_KEY.CATALOG_CATEGORY_CODE_OR_SLUG_ALREADY_EXISTS]: 'Mã hoặc đường dẫn danh mục đã tồn tại.',
  [ERROR_KEY.BRANCH_BRANCH_CODE_ALREADY_EXISTS]: 'Mã chi nhánh đã tồn tại.',
  [ERROR_KEY.INVENTORY_WAREHOUSE_CODE_ALREADY_EXISTS]: 'Mã kho đã tồn tại.',
  [ERROR_KEY.INVENTORY_BRANCH_OR_WAREHOUSE_CODE_ALREADY_EXISTS]:
    'Mã chi nhánh hoặc mã kho đã tồn tại.',
  [ERROR_KEY.IAM_STAFF_EMAIL_ALREADY_EXISTS]: 'Email nhân viên đã tồn tại.',
  [ERROR_KEY.IAM_ROLE_ASSIGNMENT_ALREADY_EXISTS]: 'Nhân viên đã được gán vai trò này.',
  [ERROR_KEY.CATALOG_PRODUCT_VERSION_CONFLICT]:
    'Sản phẩm đã thay đổi. Vui lòng tải lại và thử lại.',
  [ERROR_KEY.CATALOG_VARIANT_VERSION_CONFLICT]:
    'Biến thể đã thay đổi. Vui lòng tải lại và thử lại.',
  [ERROR_KEY.CATALOG_PRICE_EFFECTIVE_WINDOW_OVERLAPS_AN_EXISTING_PRICE]:
    'Khoảng thời gian áp dụng giá bị trùng với một mức giá hiện có.',
  [ERROR_KEY.CART_CART_HAS_NO_SELLABLE_ITEMS]: 'Giỏ hàng không có sản phẩm có thể bán.',
  [ERROR_KEY.CHECKOUT_CHECKOUT_HAS_NO_SELLABLE_ITEMS]:
    'Phiên thanh toán không có sản phẩm có thể bán.',
  [ERROR_KEY.CATALOG_PRODUCT_VARIANT_IS_NOT_SELLABLE]: 'Biến thể sản phẩm hiện không thể bán.',
  [ERROR_KEY.CART_NO_BRANCH_CURRENTLY_HAS_ENOUGH_STOCK_FOR_THE_ENTIRE_CART]:
    'Hiện không có chi nhánh nào đủ hàng cho toàn bộ giỏ hàng.',
  [ERROR_KEY.CHECKOUT_CHECKOUT_QUOTE_HAS_EXPIRED]: 'Báo giá thanh toán đã hết hạn.',
  [ERROR_KEY.CHECKOUT_RESERVATION_HAS_NOT_EXPIRED_YET]: 'Yêu cầu giữ hàng chưa hết hạn.',
  [ERROR_KEY.SHIPPING_SHIPPING_FEE_CANNOT_BE_NEGATIVE]: 'Phí giao hàng không được là số âm.',
  [ERROR_KEY.SYSTEM_SUBTOTAL_CANNOT_BE_NEGATIVE]: 'Tạm tính không được là số âm.',
  [ERROR_KEY.CART_NO_SHIPPING_RATE_SUPPORTS_THIS_DESTINATION_AND_CART]:
    'Chưa có mức phí giao hàng phù hợp với địa chỉ và giỏ hàng này.',
  [ERROR_KEY.BRANCH_ACTIVE_FULFILLMENT_BRANCH_WAS_NOT_FOUND]:
    'Không tìm thấy chi nhánh giao hàng phù hợp.',
  [ERROR_KEY.MEDIA_OBJECT_STORAGE_PROVIDER_IS_NOT_CONFIGURED]:
    'Dịch vụ lưu trữ ảnh chưa được cấu hình.',
  [ERROR_KEY.EMAIL_PROVIDER_IS_NOT_CONFIGURED]: 'Dịch vụ gửi email chưa được cấu hình.',
  [ERROR_KEY.EMAIL_PROVIDER_REJECTED_THE_MESSAGE]:
    'Không gửi được email vào lúc này. Vui lòng thử lại sau.',
  [ERROR_KEY.EMAIL_HAS_NO_RECIPIENT]: 'Email không có người nhận.',
  [ERROR_KEY.SHIPPING_SHIPPING_PARTNER_IS_NOT_CONFIGURED]: 'Đối tác giao hàng chưa được cấu hình.',
  [ERROR_KEY.SHIPPING_GHN_IS_NOT_REACHABLE]:
    'Không kết nối được tới GHN. Vui lòng thử lại sau ít phút.',
  [ERROR_KEY.SHIPPING_GHN_DID_NOT_RETURN_A_TRACKING_CODE]:
    'GHN không trả về mã vận đơn. Vui lòng thử lại hoặc tạo vận đơn thủ công.',
  [ERROR_KEY.SHIPPING_GHN_DID_NOT_RETURN_A_PRINT_TOKEN]:
    'GHN không trả về phiếu in. Vui lòng thử lại.',
  [ERROR_KEY.SHIPPING_GHN_LABEL_REQUIRES_AT_LEAST_ONE_TRACKING_CODE]:
    'Chưa chọn vận đơn nào để in.',
  [ERROR_KEY.SHIPPING_GHN_SHIPMENT_REQUIRES_RECIPIENT_DISTRICT_AND_WARD_CODES]:
    'Địa chỉ giao hàng thiếu mã quận/huyện hoặc phường/xã của GHN.',
  // Ba thông báo dưới chỉ tới webhook của GHN, không hiển thị cho người dùng cuối.
  [ERROR_KEY.SHIPPING_GHN_WEBHOOK_SECRET_IS_NOT_CONFIGURED]:
    'Webhook GHN chưa được cấu hình bí mật dùng chung.',
  [ERROR_KEY.SHIPPING_GHN_WEBHOOK_ACTOR_USER_IS_NOT_CONFIGURED]:
    'Webhook GHN chưa được gán tài khoản dịch vụ.',
  [ERROR_KEY.SHIPPING_INVALID_GHN_WEBHOOK_SECRET]: 'Bí mật webhook GHN không hợp lệ.',
  [ERROR_KEY.INVENTORY_DURABLE_INVENTORY_STORAGE_IS_NOT_ENABLED]:
    'Dịch vụ lưu trữ tồn kho chưa sẵn sàng.',
  [ERROR_KEY.CHECKOUT_DURABLE_CHECKOUT_STORAGE_IS_NOT_ENABLED]:
    'Dịch vụ lưu trữ thanh toán chưa sẵn sàng.',
  [ERROR_KEY.CART_DURABLE_CART_STORAGE_IS_NOT_ENABLED]: 'Dịch vụ lưu trữ giỏ hàng chưa sẵn sàng.',
  [ERROR_KEY.AUDIT_DURABLE_AUDIT_STORAGE_IS_NOT_ENABLED]: 'Dịch vụ lưu trữ nhật ký chưa sẵn sàng.',
  [ERROR_KEY.MEDIA_IMAGE_TYPE_OR_SIZE_IS_NOT_ALLOWED]:
    'Định dạng hoặc dung lượng ảnh không được hỗ trợ.',
  [ERROR_KEY.MEDIA_UPLOADED_IMAGE_FAILED_PROVIDER_VERIFICATION]:
    'Ảnh tải lên không vượt qua bước xác minh.',
  [ERROR_KEY.MEDIA_CLOUDINARY_UPLOAD_SIGNATURE_IS_INVALID]: 'Chữ ký tải ảnh không hợp lệ.',
  [ERROR_KEY.SYSTEM_VALID_CRON_AUTHORIZATION_IS_REQUIRED]:
    'Thông tin xác thực tác vụ định kỳ không hợp lệ.',
  [ERROR_KEY.SYSTEM_INVALID_TELEGRAM_WEBHOOK_SECRET]: 'Mã bảo mật Telegram webhook không hợp lệ.',
  [ERROR_KEY.AUTH_ACCOUNT_CHANGED_RETRY_PASSWORD_CHANGE]:
    'Tài khoản vừa được cập nhật. Vui lòng thử đổi mật khẩu lại.',
  [ERROR_KEY.IAM_ACTIVE_ROLE_ASSIGNMENT_NOT_FOUND]: 'Không tìm thấy phân quyền đang hiệu lực.',
  [ERROR_KEY.AUTH_REFRESH_COOKIE_IS_REQUIRED]:
    'Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại.',
  [ERROR_KEY.AUTH_REFRESHTOKEN_IS_REQUIRED]: 'Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại.',
  [ERROR_KEY.IAM_BRANCH_SCOPE_REQUIRES_ONE_ACTIVE_BRANCHID]:
    'Phạm vi chi nhánh cần đúng một chi nhánh đang hoạt động.',
  [ERROR_KEY.IAM_ONLY_A_LOCKED_STAFF_USER_CAN_BE_UNLOCKED]:
    'Chỉ mở khoá được nhân viên đang bị khoá.',
  [ERROR_KEY.IAM_ONLY_AN_ACTIVE_STAFF_USER_CAN_BE_LOCKED]:
    'Chỉ khoá được nhân viên đang hoạt động.',
  [ERROR_KEY.BRANCH_ONLY_SUBORDINATE_BRANCH_ASSIGNMENTS_CAN_BE_REVOKED]:
    'Bạn chỉ thu hồi được phân quyền của chi nhánh cấp dưới.',
  [ERROR_KEY.IAM_ONLY_THE_ROOT_ADMINISTRATOR_CAN_ASSIGN_STAFF_ROLES]:
    'Chỉ quản trị viên gốc được gán vai trò cho nhân viên.',
  [ERROR_KEY.AUTH_ONLY_THE_ROOT_ADMINISTRATOR_CAN_MANAGE_STAFF_ACCOUNTS]:
    'Chỉ quản trị viên gốc được quản lý tài khoản nhân viên.',
  [ERROR_KEY.AUTH_OWNER_ACCOUNT_CANNOT_BE_LOCKED_OR_UNLOCKED]:
    'Không thể khoá hoặc mở khoá tài khoản chủ hệ thống.',
  [ERROR_KEY.IAM_OWNER_ASSIGNMENT_CANNOT_BE_REVOKED]: 'Không thể thu hồi vai trò chủ hệ thống.',
  [ERROR_KEY.IAM_OWNER_IS_THE_SINGLE_BOOTSTRAP_ADMINISTRATOR_AND_CANNOT_BE]:
    'Chủ hệ thống là tài khoản quản trị gốc duy nhất, không thể gán thêm cho ai.',
  [ERROR_KEY.IAM_ROLE_ASSIGNMENT_CHANGED_RELOAD_THE_USER_LIST_AND_TRY_AGAIN]:
    'Phân quyền vừa thay đổi. Vui lòng tải lại danh sách rồi thử lại.',
  [ERROR_KEY.IAM_STAFF_STATUS_CHANGED_RELOAD_THE_USER_LIST_AND_TRY_AGAIN]:
    'Trạng thái nhân viên vừa thay đổi. Vui lòng tải lại danh sách rồi thử lại.',
  [ERROR_KEY.SHIPPING_ADDRESS_CHANGED_RELOAD_AND_RETRY]:
    'Địa chỉ vừa thay đổi. Vui lòng tải lại rồi thử lại.',
  [ERROR_KEY.SHIPPING_CHOOSE_ANOTHER_DEFAULT_ADDRESS_BEFORE_REMOVING_THIS_ONE]:
    'Hãy chọn địa chỉ mặc định khác trước khi xoá địa chỉ này.',
  [ERROR_KEY.CART_CART_CHANGED_RELOAD_AND_RETRY]:
    'Giỏ hàng vừa thay đổi. Vui lòng tải lại rồi thử lại.',
  [ERROR_KEY.CART_CART_CHANGED_WHILE_CHECKOUT_WAS_QUOTED_RETRY]:
    'Giỏ hàng thay đổi trong lúc báo giá. Vui lòng thử lại.',
  [ERROR_KEY.CHECKOUT_CHECKOUT_ALREADY_HAS_ANOTHER_RESERVATION]:
    'Đơn đặt này đã có một lượt giữ hàng khác.',
  [ERROR_KEY.CHECKOUT_CHECKOUT_CHANGED_RELOAD_AND_RETRY]:
    'Thông tin đặt hàng vừa thay đổi. Vui lòng tải lại rồi thử lại.',
  [ERROR_KEY.CHECKOUT_CHECKOUT_IS_NOT_AWAITING_SHIPPING_CONSULTATION]:
    'Đơn đặt này không ở trạng thái chờ tư vấn giao hàng.',
  [ERROR_KEY.IAM_CHECKOUT_IS_OUTSIDE_THE_ASSIGNED_BRANCH_SCOPE]:
    'Đơn đặt này không thuộc chi nhánh bạn phụ trách.',
  [ERROR_KEY.CHECKOUT_CHECKOUT_ITEM_HAS_INVALID_BUNDLE_COMPONENT]:
    'Combo trong đơn có thành phần không hợp lệ.',
  [ERROR_KEY.CHECKOUT_CHECKOUT_ITEM_HAS_INVALID_BUNDLE_SNAPSHOT]:
    'Dữ liệu combo trong đơn không hợp lệ.',
  [ERROR_KEY.CHECKOUT_CHECKOUT_ITEM_SNAPSHOT_HAS_INVALID_QUANTITY]:
    'Số lượng sản phẩm trong đơn không hợp lệ.',
  [ERROR_KEY.AUTH_CHECKOUT_TOKEN_IS_REQUIRED]: 'Thiếu mã phiên đặt hàng.',
  [ERROR_KEY.CHECKOUT_ONLY_A_QUOTED_CHECKOUT_CAN_BE_CONFIRMED]:
    'Chỉ xác nhận được đơn đã có báo giá.',
  [ERROR_KEY.CATALOG_CURRENT_PRICE_CHANGED_RELOAD_BEFORE_REPLACING_IT]:
    'Giá vừa thay đổi. Vui lòng tải lại trước khi cập nhật.',
  [ERROR_KEY.CHECKOUT_IDEMPOTENCY_KEY_MUST_NOT_EXCEED_130_CHARACTERS]: 'Khoá chống trùng quá dài.',
  [ERROR_KEY.CHECKOUT_IDEMPOTENCY_KEY_MUST_NOT_EXCEED_150_CHARACTERS]: 'Khoá chống trùng quá dài.',
  [ERROR_KEY.CHECKOUT_IDEMPOTENCY_KEY_WAS_ALREADY_USED_WITH_ANOTHER_CHECKOUT]:
    'Khoá chống trùng này đã dùng cho một đơn khác.',
  [ERROR_KEY.CHECKOUT_IDEMPOTENCY_KEY_WAS_ALREADY_USED_WITH_ANOTHER_PAYLOAD]:
    'Khoá chống trùng này đã dùng cho một yêu cầu khác.',
  [ERROR_KEY.CHECKOUT_IDEMPOTENCY_KEY_WAS_USED_WITH_ANOTHER_CHECKOUT_REQUEST]:
    'Khoá chống trùng này đã dùng cho một yêu cầu đặt hàng khác.',
  [ERROR_KEY.INVENTORY_ACTIVE_WAREHOUSE_WAS_NOT_FOUND]: 'Không tìm thấy kho đang hoạt động.',
  [ERROR_KEY.INVENTORY_BOTH_WAREHOUSES_MUST_BE_ACTIVE]:
    'Cả kho nguồn và kho đích đều phải đang hoạt động.',
  [ERROR_KEY.INVENTORY_SOURCE_AND_DESTINATION_WAREHOUSES_MUST_DIFFER]:
    'Kho nguồn và kho đích phải khác nhau.',
  [ERROR_KEY.INVENTORY_BRANCH_OR_WAREHOUSE_VERSION_CONFLICT]:
    'Chi nhánh hoặc kho vừa được cập nhật. Vui lòng tải lại rồi thử lại.',
  [ERROR_KEY.CHECKOUT_CLAIMED_RESERVATION_HAS_NO_ITEMS]: 'Lượt giữ hàng không có sản phẩm nào.',
  [ERROR_KEY.CHECKOUT_CLAIMED_RESERVATION_SET_IS_INCONSISTENT]:
    'Dữ liệu giữ hàng không nhất quán. Vui lòng thử lại.',
  [ERROR_KEY.CHECKOUT_INVENTORY_RESERVATION_HAS_NO_ITEMS]: 'Lượt giữ hàng không có sản phẩm nào.',
  [ERROR_KEY.CHECKOUT_RESERVATION_CHANGED_WHILE_EXPIRY_BATCH_WAS_RUNNING]:
    'Lượt giữ hàng thay đổi trong lúc hệ thống dọn hàng hết hạn. Vui lòng thử lại.',
  [ERROR_KEY.CHECKOUT_RESERVATION_EXPIRY_RETRY_LIMIT_REACHED]:
    'Hệ thống đã thử dọn hàng hết hạn nhiều lần không thành công.',
  [ERROR_KEY.AUTH_RESERVATION_TOKEN_IS_REQUIRED]: 'Thiếu mã giữ hàng.',
  [ERROR_KEY.CHECKOUT_RESERVATION_WAS_ALREADY_RELEASED_BY_ANOTHER_COMMAND]:
    'Lượt giữ hàng đã được giải phóng bởi thao tác khác.',
  [ERROR_KEY.SYSTEM_RELEASE_REASON_IS_REQUIRED]: 'Vui lòng nhập lý do giải phóng hàng.',
  [ERROR_KEY.INVENTORY_RESERVED_INVENTORY_COUNTER_IS_INCONSISTENT]:
    'Số liệu hàng đang giữ không khớp. Vui lòng liên hệ quản trị.',
  [ERROR_KEY.INVENTORY_INVENTORY_BALANCE_CHANGED_RETRY_WITH_THE_SAME_KEY]:
    'Tồn kho vừa thay đổi. Vui lòng thử lại với cùng thao tác.',
  [ERROR_KEY.INVENTORY_INVENTORY_CHANGED_CONCURRENTLY_RETRY]:
    'Tồn kho vừa thay đổi. Vui lòng thử lại.',
  [ERROR_KEY.INVENTORY_INVENTORY_CHANGED_CONCURRENTLY_RETRY_RELEASE]:
    'Tồn kho vừa thay đổi. Vui lòng thử giải phóng lại.',
  [ERROR_KEY.INVENTORY_INVENTORY_CHANGED_CONCURRENTLY_RETRY_THE_TRANSFER_COMMAND]:
    'Tồn kho vừa thay đổi. Vui lòng thực hiện lại lệnh chuyển kho.',
  [ERROR_KEY.INVENTORY_INVENTORY_CHANGED_CONCURRENTLY_RETRY_WITH_THE_SAME_KEY]:
    'Tồn kho vừa thay đổi. Vui lòng thử lại với cùng thao tác.',
  [ERROR_KEY.CHECKOUT_INVENTORY_CHANGED_WHILE_EXPIRING_RESERVATIONS]:
    'Tồn kho thay đổi trong lúc dọn hàng hết hạn. Vui lòng thử lại.',
  [ERROR_KEY.INVENTORY_INVENTORY_CURSOR_IS_INVALID]: 'Con trỏ phân trang không hợp lệ.',
  [ERROR_KEY.INVENTORY_INVENTORY_DATE_RANGE_IS_INVALID]: 'Khoảng thời gian không hợp lệ.',
  [ERROR_KEY.INVENTORY_ADJUSTMENT_ITEMS_MUST_CONTAIN_UNIQUE_SKU_VALUES]:
    'Mỗi SKU chỉ được xuất hiện một lần trong phiếu.',
  [ERROR_KEY.INVENTORY_ADJUSTMENT_MUST_CONTAIN_AT_LEAST_ONE_ITEM]:
    'Phiếu điều chỉnh phải có ít nhất một sản phẩm.',
  [ERROR_KEY.INVENTORY_MANUAL_RECEIPT_REFERENCE_ALREADY_EXISTS_FOR_THIS_WAREHOUSE]:
    'Số phiếu nhập này đã tồn tại ở kho.',
  [ERROR_KEY.INVENTORY_MANUAL_RECEIPT_REQUIRES_EXTERNALREFERENCE]:
    'Phiếu nhập tay cần số phiếu hoặc số chứng từ.',
  [ERROR_KEY.INVENTORY_TRANSFER_ITEMS_MUST_CONTAIN_UNIQUE_SKU_VALUES]:
    'Mỗi SKU chỉ được xuất hiện một lần trong phiếu chuyển.',
  [ERROR_KEY.INVENTORY_TRANSFER_WAS_ALREADY_RECEIVED_WITH_ANOTHER_RESULT]:
    'Phiếu chuyển đã được nhận với kết quả khác.',
  [ERROR_KEY.INVENTORY_RECEIVE_PAYLOAD_MUST_CONTAIN_EVERY_TRANSFER_SKU_EXACTLY_ON]:
    'Phiếu nhận phải liệt kê đúng một lần cho mỗi SKU của phiếu chuyển.',
  [ERROR_KEY.INVENTORY_ONLY_A_SHIPPED_TRANSFER_CAN_BE_RECEIVED]:
    'Chỉ nhận được phiếu chuyển đã xuất kho.',
  [ERROR_KEY.INVENTORY_STOCK_TRANSFER_VERSION_IS_STALE]:
    'Phiếu chuyển vừa được cập nhật. Vui lòng tải lại rồi thử lại.',
  [ERROR_KEY.CATALOG_CATEGORIES_MUST_BE_UNIQUE]: 'Mỗi danh mục chỉ được chọn một lần.',
  [ERROR_KEY.CATALOG_CATEGORYIDS_AND_PRIMARYCATEGORYID_MUST_BE_SENT_TOGETHER]:
    'Vui lòng chọn danh mục và danh mục chính cùng lúc.',
  [ERROR_KEY.CATALOG_CATEGORY_IS_NOT_ACTIVE]: 'Danh mục này đang ngừng hoạt động.',
  [ERROR_KEY.CATALOG_CATEGORY_VERSION_CONFLICT]:
    'Danh mục vừa được cập nhật. Vui lòng tải lại rồi thử lại.',
  [ERROR_KEY.CATALOG_PARENT_CATEGORY_IS_NOT_ACTIVE]: 'Danh mục cha đang ngừng hoạt động.',
  [ERROR_KEY.CATALOG_PRIMARY_CATEGORY_MUST_BE_INCLUDED_IN_CATEGORYIDS]:
    'Danh mục chính phải nằm trong các danh mục đã chọn.',
  [ERROR_KEY.CATALOG_BRAND_IS_NOT_ACTIVE]: 'Thương hiệu này đang ngừng hoạt động.',
  [ERROR_KEY.CATALOG_BRAND_VERSION_CONFLICT]:
    'Thương hiệu vừa được cập nhật. Vui lòng tải lại rồi thử lại.',
  [ERROR_KEY.CATALOG_BUNDLE_COMPONENTS_MUST_BE_UNIQUE]:
    'Mỗi sản phẩm chỉ được thêm một lần vào combo.',
  [ERROR_KEY.CATALOG_BUNDLE_CONTAINS_INVALID_COMPONENT]: 'Combo có thành phần không hợp lệ.',
  [ERROR_KEY.CATALOG_NESTED_BUNDLES_ARE_NOT_ALLOWED]: 'Không thể đặt combo bên trong combo.',
  [ERROR_KEY.CATALOG_AT_LEAST_ONE_MUTABLE_VARIANT_FIELD_IS_REQUIRED]:
    'Vui lòng nhập ít nhất một thông tin cần sửa.',
  [ERROR_KEY.CATALOG_ONLY_ACTIVE_VARIANT_CAN_BE_ARCHIVED]:
    'Chỉ lưu trữ được phiên bản đang hoạt động.',
  [ERROR_KEY.CATALOG_ONLY_INACTIVE_VARIANT_CAN_BE_REACTIVATED]:
    'Chỉ kích hoạt lại được phiên bản đang ngừng.',
  [ERROR_KEY.CATALOG_VARIANT_MUST_BELONG_TO_THE_PRODUCT]: 'Phiên bản không thuộc sản phẩm này.',
  [ERROR_KEY.CATALOG_REACTIVATE_THE_PRODUCT_BEFORE_ITS_VARIANT]:
    'Hãy kích hoạt lại sản phẩm trước khi kích hoạt phiên bản.',
  [ERROR_KEY.CATALOG_ONLY_DRAFT_PRODUCT_CAN_BE_PUBLISHED]:
    'Chỉ đăng bán được sản phẩm đang ở bản nháp.',
  [ERROR_KEY.CATALOG_PRODUCT_SLUG_CANNOT_CHANGE_AFTER_PUBLISH]:
    'Không đổi được đường dẫn sản phẩm sau khi đã đăng bán.',
  [ERROR_KEY.CATALOG_PRODUCT_VERSION_CONFLICT_OR_PRODUCT_IS_ARCHIVED]:
    'Sản phẩm vừa được cập nhật hoặc đã lưu trữ. Vui lòng tải lại rồi thử lại.',
  [ERROR_KEY.CATALOG_PRICE_STARTSAT_CANNOT_BE_IN_THE_PAST]:
    'Ngày bắt đầu áp giá không được ở quá khứ.',
  [ERROR_KEY.SYSTEM_ENDSAT_MUST_BE_AFTER_STARTSAT]: 'Ngày kết thúc phải sau ngày bắt đầu.',
  [ERROR_KEY.CATALOG_ARCHIVED_PRODUCT_MEDIA_CANNOT_BE_CHANGED]:
    'Không sửa được ảnh của sản phẩm đã lưu trữ.',
  [ERROR_KEY.MEDIA_MEDIA_ASSET_EXISTS_BUT_IS_INACTIVE]: 'Ảnh này đang ngừng sử dụng.',
  [ERROR_KEY.MEDIA_MEDIA_ASSET_IS_ALREADY_ATTACHED_TO_THIS_TARGET]: 'Ảnh này đã được gắn vào đây.',
  [ERROR_KEY.MEDIA_MEDIA_ASSET_IS_NOT_FINALIZED_OR_ACTIVE]:
    'Ảnh chưa tải lên xong hoặc đang ngừng sử dụng.',
  [ERROR_KEY.MEDIA_MEDIA_REORDER_ITEMS_MUST_BE_UNIQUE]: 'Mỗi ảnh chỉ được sắp xếp một lần.',
  [ERROR_KEY.CATALOG_REORDER_MUST_INCLUDE_EVERY_ACTIVE_PRODUCT_MEDIA_ITEM]:
    'Vui lòng sắp xếp đủ tất cả ảnh đang dùng của sản phẩm.',
  [ERROR_KEY.CONTENT_POST_IS_ALREADY_ARCHIVED]: 'Bài viết đã được lưu trữ.',
  [ERROR_KEY.CONTENT_POST_WAS_CHANGED_BY_ANOTHER_REQUEST]:
    'Bài viết vừa được người khác cập nhật. Vui lòng tải lại rồi thử lại.',
  [ERROR_KEY.REVIEW_REVIEW_IS_ALREADY_HIDDEN]: 'Đánh giá này đã được ẩn.',
  [ERROR_KEY.REVIEW_REVIEW_WAS_CHANGED_BY_ANOTHER_REQUEST]:
    'Đánh giá vừa được người khác cập nhật. Vui lòng tải lại rồi thử lại.',
  [ERROR_KEY.SHIPPING_ETA_MAXIMUM_MUST_NOT_BE_LESS_THAN_ETA_MINIMUM]:
    'Số ngày giao tối đa không được nhỏ hơn số ngày tối thiểu.',
  [ERROR_KEY.CHECKOUT_GHN_QUOTE_IS_NOT_CONFIGURED_FOR_THIS_ADDRESS]:
    'Chưa cấu hình báo giá giao hàng cho địa chỉ này.',
  [ERROR_KEY.CHECKOUT_GHTK_QUOTE_IS_NOT_CONFIGURED_FOR_THIS_ADDRESS]:
    'Chưa cấu hình báo giá giao hàng cho địa chỉ này.',
  [ERROR_KEY.AUDIT_AUDIT_CURSOR_IS_INVALID]: 'Con trỏ phân trang không hợp lệ.',
  [ERROR_KEY.AUDIT_AUDIT_LOG_WRITE_RETURNED_NO_ROW]:
    'Hệ thống đang gặp sự cố khi ghi nhật ký. Vui lòng thử lại sau.',
  [ERROR_KEY.SYSTEM_TELEGRAM_BOT_IS_NOT_CONFIGURED]: 'Kênh thông báo chưa được cấu hình.',
  [ERROR_KEY.SYSTEM_TELEGRAM_COULD_NOT_DELIVER_THE_BOT_RESPONSE]:
    'Không gửi được thông báo. Vui lòng thử lại sau.',
  [ERROR_KEY.CATALOG_ACTIVE_BUNDLE_VARIANT_MUST_BELONG_TO_THE_BUNDLE_PRODUCT]:
    'Phiên bản combo phải thuộc đúng sản phẩm combo.',
  [ERROR_KEY.CATALOG_BUNDLE_DEFINITION_CAN_ONLY_BE_CREATED_FOR_A_BUNDLE_PRODUCT]:
    'Chỉ tạo được cấu hình combo cho sản phẩm loại combo.',
  [ERROR_KEY.CATALOG_STANDARD_PRODUCT_CANNOT_CONTAIN_A_BUNDLE_VARIANT]:
    'Sản phẩm thường không chứa được phiên bản combo.',
  [ERROR_KEY.CATALOG_EVERY_ACTIVE_BUNDLE_VARIANT_REQUIRES_AN_ACTIVE_NON_EMPTY_D]:
    'Combo đang bán cần có đủ thành phần, giá hiệu lực và các thành phần đều đang hoạt động.',
  [ERROR_KEY.CATALOG_PRODUCT_SUPPLIES_AN_ACTIVE_PUBLISHED_COMBO_ARCHIVE_THE_COM]:
    'Sản phẩm đang nằm trong một combo đang bán. Hãy lưu trữ combo đó trước.',
  [ERROR_KEY.CATALOG_VARIANT_IS_USED_BY_AN_ACTIVE_PUBLISHED_COMBO_ARCHIVE_THE_C]:
    'Phiên bản đang nằm trong một combo đang bán. Hãy lưu trữ combo đó trước.',
  [ERROR_KEY.CATALOG_PRODUCT_TYPE_CANNOT_CHANGE_AFTER_VARIANTS_HAVE_BEEN_CREATE]:
    'Không đổi được loại sản phẩm sau khi đã tạo phiên bản.',
  [ERROR_KEY.CATALOG_PUBLISHED_PRODUCT_REQUIRES_AN_ACTIVE_VARIANT_AND_EFFECTIVE]:
    'Sản phẩm đăng bán cần có phiên bản đang hoạt động và giá hiệu lực.',
  [ERROR_KEY.CATALOG_DEACTIVATE_ACTIVE_CHILD_CATEGORIES_BEFORE_DEACTIVATING_THI]:
    'Hãy ngừng hoạt động các danh mục con trước khi ngừng danh mục này.',
  [ERROR_KEY.CATALOG_REPLACEMENT_PRICE_MUST_START_AFTER_THE_CURRENT_PRICE_START]:
    'Giá mới phải bắt đầu sau thời điểm bắt đầu của giá hiện tại.',
  [ERROR_KEY.MEDIA_MEDIA_SORTORDER_MUST_BE_A_UNIQUE_ZERO_BASED_SEQUENCE]:
    'Thứ tự ảnh phải liền mạch và không trùng nhau.',
  [ERROR_KEY.MEDIA_SET_ANOTHER_MEDIA_ITEM_AS_PRIMARY_INSTEAD_OF_CLEARING_THE]:
    'Hãy chọn ảnh khác làm ảnh chính thay vì bỏ trống ảnh chính.',
  [ERROR_KEY.CHECKOUT_COMMITTED_RESERVATION_CANNOT_BE_RELEASED_CREATE_A_COMPENSA]:
    'Lượt giữ hàng đã chốt không giải phóng được. Hãy tạo phiếu điều chỉnh kho bù lại.',
  [ERROR_KEY.IAM_BRANCH_SCOPED_USERS_MAY_DECREASE_AT_MOST_10_UNITS_PER_SKU]:
    'Tài khoản chi nhánh chỉ được giảm tối đa 10 đơn vị cho mỗi SKU trong một phiếu.',
  [ERROR_KEY.INVENTORY_EXTERNALREFERENCE_AND_SOURCENAME_ARE_ONLY_ALLOWED_FOR_MANU]:
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
