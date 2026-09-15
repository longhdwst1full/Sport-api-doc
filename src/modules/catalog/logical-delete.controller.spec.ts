import type { AuthenticatedRequest } from '../../common/request/request-context';
import { OrganizationController } from '../organization/organization.controller';
import type { OrganizationService } from '../organization/organization.service';
import { CatalogMasterController } from './master-data/catalog-master.controller';
import type { CatalogMasterService } from './master-data/catalog-master.service';
import { AdminProductsController } from './products/controllers/admin-products.controller';
import type { ProductMediaService } from './products/services/product-media.service';
import type { ProductsService } from './products/services/products.service';

describe('Sprint 1 logical DELETE controllers', () => {
  const request = {
    id: 'delete-request-id',
    auth: {
      userId: 'actor-id',
      sessionId: 'session-id',
      displayName: 'Root Admin',
      permissionVersion: '1',
      permissions: [],
      scopes: [],
      mustChangePassword: false,
    },
    header: jest.fn(),
  } as unknown as AuthenticatedRequest;
  const context = { requestId: 'delete-request-id', actorUserId: 'actor-id' };

  it('maps Category DELETE to its INACTIVE lifecycle', async () => {
    const changeCategoryStatus = jest.fn().mockResolvedValue({ id: 'category-id' });
    const controller = new CatalogMasterController({
      changeCategoryStatus,
    } as unknown as CatalogMasterService);

    await controller.deleteCategory('category-id', { expectedVersion: 3 }, request);

    expect(changeCategoryStatus).toHaveBeenCalledWith(
      'category-id',
      'INACTIVE',
      { expectedVersion: 3 },
      context,
    );
  });

  /**
   * Thương hiệu là ngoại lệ có chủ ý của quy ước "DELETE = xoá mềm": tạo nhầm một
   * thương hiệu thì phải gỡ được hẳn. Service tự chặn khi còn sản phẩm tham chiếu,
   * nên xoá cứng ở đây không làm mất xuất xứ của hàng đã bán.
   */
  it('maps Brand DELETE to a real delete guarded by product references', async () => {
    const deleteBrand = jest.fn().mockResolvedValue(undefined);
    const controller = new CatalogMasterController({
      deleteBrand,
    } as unknown as CatalogMasterService);

    await controller.deleteBrand('brand-id', { expectedVersion: 2 }, request);

    expect(deleteBrand).toHaveBeenCalledWith('brand-id', { expectedVersion: 2 }, context);
  });

  it('maps Branch DELETE to the atomic branch and warehouse INACTIVE lifecycle', async () => {
    const changeBranchStatus = jest.fn().mockResolvedValue({
      branch: { id: 'branch-id' },
      warehouse: { id: 'warehouse-id' },
    });
    const controller = new OrganizationController({
      changeBranchStatus,
    } as unknown as OrganizationService);
    const input = { expectedVersion: 1, warehouseExpectedVersion: 4 };

    await controller.deleteBranch('branch-id', input, request);

    expect(changeBranchStatus).toHaveBeenCalledWith(
      'branch-id',
      'INACTIVE',
      input,
      context,
    );
  });

  it('maps Product, Variant and Product Media DELETE to archive lifecycles', async () => {
    const archiveProduct = jest.fn().mockResolvedValue({ id: 'product-id' });
    const archiveVariant = jest.fn().mockResolvedValue({ id: 'product-id' });
    const archiveMedia = jest.fn().mockResolvedValue([]);
    const controller = new AdminProductsController(
      { archiveProduct, archiveVariant } as unknown as ProductsService,
      { archive: archiveMedia } as unknown as ProductMediaService,
    );

    await controller.deleteProduct('product-id', { expectedVersion: 5 }, request);
    await controller.deleteVariant('variant-id', { expectedVersion: 6 }, request);
    await controller.deleteMedia(
      'product-id',
      'media-id',
      { expectedProductVersion: 7 },
      request,
    );

    expect(archiveProduct).toHaveBeenCalledWith(
      'product-id',
      { expectedVersion: 5 },
      context,
    );
    expect(archiveVariant).toHaveBeenCalledWith(
      'variant-id',
      { expectedVersion: 6 },
      context,
    );
    expect(archiveMedia).toHaveBeenCalledWith('product-id', 'media-id', 7, context);
  });
});
