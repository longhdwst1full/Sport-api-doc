import {
  PRODUCT_BUNDLE_STATUS,
  PRODUCT_STATUS,
  PRODUCT_TYPE,
  PRODUCT_VARIANT_STATUS,
  type ProductType,
} from './product.constants';

/**
 * Một nguồn quyết định duy nhất cho "sản phẩm đã đủ điều kiện xuất bản chưa".
 *
 * INVARIANT: `publish` và `getAdminProductSetupStatus` gọi CÙNG hàm này; không được viết điều kiện
 * riêng ở UI hay ở một endpoint khác, nếu không checklist nói "đủ" mà publish vẫn bị từ chối.
 *
 * Chặn cứng: SKU đang bán có giá hiệu lực, cấu trúc STANDARD/BUNDLE hợp lệ, có ảnh chính.
 * Chỉ cảnh báo: chưa có tồn khả dụng — sản phẩm publish cho cả chuỗi còn tồn là việc của từng
 * chi nhánh (dữ liệu 2026-09-25: 593/596 sản phẩm đang bán chưa có tồn trong hệ thống).
 */
export const PRODUCT_READINESS_ISSUE = {
  NO_SELLABLE_VARIANT: 'NO_SELLABLE_VARIANT',
  STANDARD_HAS_BUNDLE_VARIANT: 'STANDARD_HAS_BUNDLE_VARIANT',
  INVALID_BUNDLE: 'INVALID_BUNDLE',
  MISSING_PRIMARY_IMAGE: 'MISSING_PRIMARY_IMAGE',
  NO_AVAILABLE_STOCK: 'NO_AVAILABLE_STOCK',
} as const;

export type ProductReadinessIssueCode = (typeof PRODUCT_READINESS_ISSUE)[keyof typeof PRODUCT_READINESS_ISSUE];

export interface ProductReadinessIssue {
  code: ProductReadinessIssueCode;
  /** Câu tiếng Anh ổn định: publish ném đúng câu này (đã có bản dịch ở client-error-message.vi.ts). */
  message: string;
}

export interface ProductPublishSnapshot {
  status: string;
  productType: ProductType;
  /** Chỉ các SKU ACTIVE, kèm giá đang hiệu lực tại thời điểm đánh giá. */
  activeVariants: Array<{
    prices: unknown[];
    bundleDefinition: null | {
      status: string;
      items: Array<{ componentVariant: { status: string; product: { status: string } } }>;
    };
  }>;
  hasPrimaryImage: boolean;
  availableStock: number;
}

export interface ProductPublishReadiness {
  canPublish: boolean;
  blockingIssues: ProductReadinessIssue[];
  warnings: ProductReadinessIssue[];
}

export function evaluatePublishReadiness(snapshot: ProductPublishSnapshot): ProductPublishReadiness {
  const blockingIssues: ProductReadinessIssue[] = [];
  const { activeVariants, productType } = snapshot;

  if (activeVariants.length === 0 || !activeVariants.some(({ prices }) => prices.length > 0)) {
    blockingIssues.push({
      code: PRODUCT_READINESS_ISSUE.NO_SELLABLE_VARIANT,
      message: 'Published product requires an active variant and effective price',
    });
  }
  if (productType === PRODUCT_TYPE.STANDARD) {
    if (activeVariants.some(({ bundleDefinition }) => bundleDefinition !== null)) {
      blockingIssues.push({
        code: PRODUCT_READINESS_ISSUE.STANDARD_HAS_BUNDLE_VARIANT,
        message: 'STANDARD product cannot contain a bundle variant',
      });
    }
  } else if (
    activeVariants.some(
      ({ prices, bundleDefinition }) =>
        prices.length === 0 ||
        !bundleDefinition ||
        bundleDefinition.status !== PRODUCT_BUNDLE_STATUS.ACTIVE ||
        bundleDefinition.items.length === 0 ||
        bundleDefinition.items.some(
          ({ componentVariant }) =>
            componentVariant.status !== PRODUCT_VARIANT_STATUS.ACTIVE ||
            componentVariant.product.status === PRODUCT_STATUS.ARCHIVED,
        ),
    )
  ) {
    blockingIssues.push({
      code: PRODUCT_READINESS_ISSUE.INVALID_BUNDLE,
      message: 'Every active BUNDLE variant requires an active non-empty definition, effective price and active components',
    });
  }
  if (!snapshot.hasPrimaryImage) {
    blockingIssues.push({
      code: PRODUCT_READINESS_ISSUE.MISSING_PRIMARY_IMAGE,
      message: 'Published product requires a primary image',
    });
  }

  const warnings: ProductReadinessIssue[] = snapshot.availableStock > 0
    ? []
    : [{ code: PRODUCT_READINESS_ISSUE.NO_AVAILABLE_STOCK, message: 'No branch has available stock yet' }];

  return {
    canPublish: snapshot.status === PRODUCT_STATUS.DRAFT && blockingIssues.length === 0,
    blockingIssues,
    warnings,
  };
}
