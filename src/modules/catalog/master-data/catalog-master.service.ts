import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  toDatabaseId,
  toEntityId,
  toOptionalDatabaseId,
  toOptionalEntityId,
} from '../../../common/identifiers/entity-id';
import { MutationContext } from '../../../common/request/request-context';
import {
  ActiveLookupResponseDto,
  ActiveSearchQueryDto,
  buildActiveLookupResponse,
} from '../../../common/pagination/active-search.dto';
import { PrismaService } from '../../../database/prisma.service';
import { AuditWriter } from '../../audit/audit.writer';
import {
  BrandDto,
  BrandListDto,
  CatalogCategoryDto,
  CatalogCategoryListDto,
  CategoryDto,
  CategoryListDto,
  ChangeMasterStatusDto,
  CreateBrandDto,
  CreateCategoryDto,
  UpdateBrandDto,
  UpdateCategoryDto,
} from './catalog-master.dto';

@Injectable()
export class CatalogMasterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
  ) {}

  async listBrands(): Promise<BrandListDto> {
    const rows = await this.prisma.brand.findMany({ orderBy: { name: 'asc' } });
    const items = rows.map((row) => this.toBrand(row));
    return { items, total: items.length };
  }

  async listCategories(): Promise<CategoryListDto> {
    const rows = await this.prisma.category.findMany({
      orderBy: [{ path: 'asc' }, { sortOrder: 'asc' }],
    });
    const items = rows.map((row) => this.toCategory(row));
    return { items, total: items.length };
  }

  /**
   * Danh mục công khai cho Storefront: chỉ ACTIVE, kèm ảnh và số sản phẩm
   * PUBLISHED để trang danh mục không phải hiển thị số liệu bịa.
   */
  async listStorefrontCategories(): Promise<CatalogCategoryListDto> {
    const rows = await this.prisma.category.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        imageAsset: { select: { secureUrl: true, thumbnailUrl: true } },
        // Menu nhiều cấp của Storefront cần biết cha là ai; trước đây phải hardcode.
        parent: { select: { slug: true } },
      },
    });

    const counts = await this.publishedProductCountByCategory();
    const items: CatalogCategoryDto[] = rows.map((row) => ({
      code: row.code,
      name: row.name,
      slug: row.slug,
      description: row.description ?? undefined,
      imageUrl: row.imageAsset?.thumbnailUrl ?? row.imageAsset?.secureUrl ?? null,
      sortOrder: row.sortOrder,
      productCount: counts.get(row.id.toString()) ?? 0,
      depth: row.depth,
      parentSlug: row.parent?.slug ?? null,
    }));
    return { items, total: items.length };
  }

  /**
   * Số sản phẩm PUBLISHED của từng danh mục, **cộng dồn cả nhánh con** — đúng cách bộ
   * lọc sản phẩm hiểu một danh mục (`ProductsService.resolveCategoryFilter` khớp theo
   * tiền tố `path`). Đếm trực tiếp bằng `_count` làm danh mục cha luôn ra 0 trong khi
   * bấm vào nó lại liệt kê hàng chục sản phẩm.
   *
   * `COUNT(DISTINCT ...)` vì một sản phẩm có thể gắn đồng thời vào cha và con.
   */
  private async publishedProductCountByCategory(): Promise<Map<string, number>> {
    const rows = await this.prisma.$queryRaw<Array<{ id: bigint; total: number }>>`
      SELECT c.id, COUNT(DISTINCT p.id)::int AS total
      FROM public.categories c
      LEFT JOIN public.categories d
        ON d.path = c.path OR d.path LIKE c.path || '/%'
      LEFT JOIN public.product_categories pc ON pc.category_id = d.id
      LEFT JOIN public.products p ON p.id = pc.product_id AND p.status = 'PUBLISHED'
      WHERE c.status = 'ACTIVE'
      GROUP BY c.id
    `;
    return new Map(rows.map((row) => [row.id.toString(), row.total]));
  }

  async searchActiveBrands(query: ActiveSearchQueryDto): Promise<ActiveLookupResponseDto> {
    const { items } = await this.listBrands();
    return buildActiveLookupResponse(
      items.filter(({ status }) => status === 'ACTIVE').map(({ id, code, name }) => ({ id, code, label: name })),
      query,
    );
  }

  async searchActiveCategories(query: ActiveSearchQueryDto): Promise<ActiveLookupResponseDto> {
    const { items } = await this.listCategories();
    return buildActiveLookupResponse(
      items.filter(({ status }) => status === 'ACTIVE').map(({ id, code, name }) => ({ id, code, label: name })),
      query,
    );
  }

  async createBrand(input: CreateBrandDto, context: MutationContext): Promise<BrandDto> {
    try {
      const row = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.brand.create({
          data: { ...input, logoAssetId: toOptionalDatabaseId(input.logoAssetId) },
        });
        await this.audit.write(
          {
            requestId: context.requestId,
            sequenceNo: 1,
            actorType: 'USER',
            actorUserId: context.actorUserId,
            action: 'catalog.brand.create',
            entityType: 'BRAND',
            entityId: toEntityId(created.id),
            after: input as unknown as Prisma.InputJsonValue,
          },
          transaction,
        );
        return created;
      });
      return this.toBrand(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Brand code or slug already exists');
      }
      throw error;
    }
  }

  async createCategory(input: CreateCategoryDto, context: MutationContext): Promise<CategoryDto> {
    try {
      const row = await this.prisma.$transaction(async (transaction) => {
        const parentId = toOptionalDatabaseId(input.parentId);
        const parent = input.parentId
          ? await transaction.category.findFirst({
              where: { id: toDatabaseId(input.parentId), status: 'ACTIVE' },
            })
          : null;
        if (input.parentId && !parent) throw new UnprocessableEntityException('Parent category is not active');
        const created = await transaction.category.create({
          data: {
            parentId,
            code: input.code,
            name: input.name,
            slug: input.slug,
            description: input.description,
            imageAssetId: toOptionalDatabaseId(input.imageAssetId),
            sortOrder: input.sortOrder ?? 0,
            path: 'PENDING',
            depth: parent ? parent.depth + 1 : 0,
          },
        });
        const entityId = toEntityId(created.id);
        const completed = await transaction.category.update({
          where: { id: created.id },
          data: { path: parent ? `${parent.path}/${entityId}` : entityId },
        });
        await this.audit.write(
          {
            requestId: context.requestId,
            sequenceNo: 1,
            actorType: 'USER',
            actorUserId: context.actorUserId,
            action: 'catalog.category.create',
            entityType: 'CATEGORY',
            entityId,
            after: input as unknown as Prisma.InputJsonValue,
          },
          transaction,
        );
        return completed;
      });
      return this.toCategory(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Category code or slug already exists');
      }
      throw error;
    }
  }

  async updateBrand(
    id: string,
    input: UpdateBrandDto,
    context: MutationContext,
  ): Promise<BrandDto> {
    const databaseId = toDatabaseId(id);
    const { expectedVersion, ...fields } = input;
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const current = await transaction.brand.findUnique({ where: { id: databaseId } });
        if (!current) throw new NotFoundException('Brand not found');
        const result = await transaction.brand.updateMany({
          where: { id: databaseId, version: BigInt(expectedVersion) },
          data: {
            ...fields,
            logoAssetId: toOptionalDatabaseId(fields.logoAssetId),
            version: { increment: 1 },
          },
        });
        if (result.count !== 1) throw new ConflictException('Brand version conflict');
        const updated = await transaction.brand.findUniqueOrThrow({ where: { id: databaseId } });
        await this.audit.write(
          {
            requestId: context.requestId,
            sequenceNo: 1,
            actorType: 'USER',
            actorUserId: context.actorUserId,
            action: 'catalog.brand.update',
            entityType: 'BRAND',
            entityId: id,
            before: {
              name: current.name,
              slug: current.slug,
              description: current.description,
              logoAssetId: toOptionalEntityId(current.logoAssetId),
              status: current.status,
              version: Number(current.version),
            },
            after: input as unknown as Prisma.InputJsonValue,
          },
          transaction,
        );
        return this.toBrand(updated);
      });
    } catch (error) {
      this.rethrowUniqueConstraint(error, 'Brand slug already exists');
    }
  }

  async changeBrandStatus(
    id: string,
    status: BrandDto['status'],
    input: ChangeMasterStatusDto,
    context: MutationContext,
  ): Promise<BrandDto> {
    const databaseId = toDatabaseId(id);
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.brand.findUnique({ where: { id: databaseId } });
      if (!current) throw new NotFoundException('Brand not found');
      const result = await transaction.brand.updateMany({
        where: { id: databaseId, version: BigInt(input.expectedVersion) },
        data: { status, version: { increment: 1 } },
      });
      if (result.count !== 1) throw new ConflictException('Brand version conflict');
      const updated = await transaction.brand.findUniqueOrThrow({ where: { id: databaseId } });
      await this.audit.write(
        {
          requestId: context.requestId,
          sequenceNo: 1,
          actorType: 'USER',
          actorUserId: context.actorUserId,
          action: status === 'ACTIVE' ? 'catalog.brand.activate' : 'catalog.brand.deactivate',
          entityType: 'BRAND',
          entityId: id,
          before: { status: current.status, version: Number(current.version) },
          after: { status, version: Number(updated.version) },
        },
        transaction,
      );
      return this.toBrand(updated);
    });
  }

  /**
   * Xoá hẳn một thương hiệu. Chỉ dùng được khi chưa có sản phẩm nào trỏ tới:
   * `Product.brand` là khoá ngoại Restrict, và xoá thương hiệu đang dùng sẽ làm
   * mất thông tin xuất xứ của sản phẩm đã bán. Thương hiệu đang dùng thì chuyển
   * sang Ngừng thay vì xoá.
   */
  async deleteBrand(
    id: string,
    input: ChangeMasterStatusDto,
    context: MutationContext,
  ): Promise<void> {
    const databaseId = toDatabaseId(id);
    await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.brand.findUnique({ where: { id: databaseId } });
      if (!current) throw new NotFoundException('Brand not found');

      const productCount = await transaction.product.count({ where: { brandId: databaseId } });
      if (productCount > 0) {
        throw new ConflictException(
          `Thương hiệu đang gắn với ${productCount} sản phẩm; hãy đổi thương hiệu của các sản phẩm đó hoặc chuyển sang Ngừng dùng`,
        );
      }

      const result = await transaction.brand.deleteMany({
        where: { id: databaseId, version: BigInt(input.expectedVersion) },
      });
      if (result.count !== 1) throw new ConflictException('Brand version conflict');

      await this.audit.write(
        {
          requestId: context.requestId,
          sequenceNo: 1,
          actorType: 'USER',
          actorUserId: context.actorUserId,
          action: 'catalog.brand.delete',
          entityType: 'BRAND',
          entityId: id,
          before: {
            code: current.code,
            name: current.name,
            status: current.status,
            version: Number(current.version),
          },
        },
        transaction,
      );
    });
  }

  async updateCategory(
    id: string,
    input: UpdateCategoryDto,
    context: MutationContext,
  ): Promise<CategoryDto> {
    const databaseId = toDatabaseId(id);
    const { expectedVersion, ...fields } = input;
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const current = await transaction.category.findUnique({ where: { id: databaseId } });
        if (!current) throw new NotFoundException('Category not found');
        const result = await transaction.category.updateMany({
          where: { id: databaseId, version: BigInt(expectedVersion) },
          data: {
            ...fields,
            imageAssetId: toOptionalDatabaseId(fields.imageAssetId),
            version: { increment: 1 },
          },
        });
        if (result.count !== 1) throw new ConflictException('Category version conflict');
        const updated = await transaction.category.findUniqueOrThrow({ where: { id: databaseId } });
        await this.audit.write(
          {
            requestId: context.requestId,
            sequenceNo: 1,
            actorType: 'USER',
            actorUserId: context.actorUserId,
            action: 'catalog.category.update',
            entityType: 'CATEGORY',
            entityId: id,
            before: {
              name: current.name,
              slug: current.slug,
              description: current.description,
              imageAssetId: toOptionalEntityId(current.imageAssetId),
              sortOrder: current.sortOrder,
              status: current.status,
              version: Number(current.version),
            },
            after: input as unknown as Prisma.InputJsonValue,
          },
          transaction,
        );
        return this.toCategory(updated);
      });
    } catch (error) {
      this.rethrowUniqueConstraint(error, 'Category slug already exists');
    }
  }

  /**
   * Nâng các danh mục con lên làm con của `newParentId`.
   *
   * INVARIANT: `path` và `depth` là cây đường dẫn vật chất hoá, nên đổi cha phải viết lại cho CẢ
   * nhánh con chứ không chỉ con trực tiếp; bỏ sót thì cây hiển thị sai và truy vấn theo tiền tố
   * `path` đếm nhầm sản phẩm.
   */
  private async reparentChildren(
    transaction: Prisma.TransactionClient,
    categoryId: bigint,
    newParentId: bigint | null,
  ): Promise<void> {
    const children = await transaction.category.findMany({
      where: { parentId: categoryId },
      select: { id: true, path: true, depth: true },
    });
    if (children.length === 0) return;

    const newParent = newParentId
      ? await transaction.category.findUnique({
          where: { id: newParentId },
          select: { path: true, depth: true },
        })
      : null;

    for (const child of children) {
      const childEntityId = toEntityId(child.id);
      const newPath = newParent ? `${newParent.path}/${childEntityId}` : childEntityId;
      const newDepth = newParent ? newParent.depth + 1 : 0;
      const depthDelta = newDepth - child.depth;

      await transaction.category.update({
        where: { id: child.id },
        data: { parentId: newParentId, version: { increment: 1 } },
      });
      // Một câu lệnh cho cả nhánh: đổi tiền tố path và dịch depth theo cùng một khoảng.
      await transaction.$executeRaw(Prisma.sql`
        UPDATE categories
        SET path = ${newPath} || SUBSTRING(path FROM ${child.path.length + 1}),
            depth = depth + ${depthDelta},
            updated_at = NOW()
        WHERE path = ${child.path} OR path LIKE ${`${child.path}/%`}
      `);
    }
  }

  async changeCategoryStatus(
    id: string,
    status: CategoryDto['status'],
    input: ChangeMasterStatusDto,
    context: MutationContext,
  ): Promise<CategoryDto> {
    const databaseId = toDatabaseId(id);
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.category.findUnique({ where: { id: databaseId } });
      if (!current) throw new NotFoundException('Category not found');
      if (status === 'ACTIVE' && current.parentId) {
        const parent = await transaction.category.findFirst({
          where: { id: current.parentId, status: 'ACTIVE' },
        });
        if (!parent) throw new UnprocessableEntityException('Parent category is not active');
      }
      if (status === 'INACTIVE') {
        // Danh mục con được nâng lên cha của danh mục vừa gỡ. Trước đây thao tác bị chặn hẳn khi
        // còn con, buộc người dùng gỡ thủ công từ dưới lên; làm vậy dễ bỏ sót và có lúc để lại
        // cả nhánh mồ côi. Danh mục gốc bị gỡ thì con của nó trở thành gốc.
        await this.reparentChildren(transaction, databaseId, current.parentId);
      }
      const result = await transaction.category.updateMany({
        where: { id: databaseId, version: BigInt(input.expectedVersion) },
        data: { status, version: { increment: 1 } },
      });
      if (result.count !== 1) throw new ConflictException('Category version conflict');
      const updated = await transaction.category.findUniqueOrThrow({ where: { id: databaseId } });
      await this.audit.write(
        {
          requestId: context.requestId,
          sequenceNo: 1,
          actorType: 'USER',
          actorUserId: context.actorUserId,
          action:
            status === 'ACTIVE' ? 'catalog.category.activate' : 'catalog.category.deactivate',
          entityType: 'CATEGORY',
          entityId: id,
          before: { status: current.status, version: Number(current.version) },
          after: { status, version: Number(updated.version) },
        },
        transaction,
      );
      return this.toCategory(updated);
    });
  }

  private toBrand(row: {
    id: bigint;
    code: string;
    name: string;
    slug: string;
    description: string | null;
    logoAssetId: bigint | null;
    status: string;
    version: bigint;
  }): BrandDto {
    return {
      id: toEntityId(row.id),
      code: row.code,
      name: row.name,
      slug: row.slug,
      ...(row.description ? { description: row.description } : {}),
      ...(row.logoAssetId ? { logoAssetId: toEntityId(row.logoAssetId) } : {}),
      status: row.status as BrandDto['status'],
      version: Number(row.version),
    };
  }

  private toCategory(row: {
    id: bigint; parentId: bigint | null; code: string; name: string; slug: string;
    path: string; depth: number; description: string | null; imageAssetId: bigint | null;
    sortOrder: number; status: string; version: bigint;
  }): CategoryDto {
    return {
      id: toEntityId(row.id),
      ...(row.parentId ? { parentId: toEntityId(row.parentId) } : {}),
      code: row.code,
      name: row.name,
      slug: row.slug,
      path: row.path,
      depth: row.depth,
      ...(row.description ? { description: row.description } : {}),
      ...(row.imageAssetId ? { imageAssetId: toEntityId(row.imageAssetId) } : {}),
      sortOrder: row.sortOrder,
      status: row.status as CategoryDto['status'],
      version: Number(row.version),
    };
  }

  private rethrowUniqueConstraint(error: unknown, message: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException(message);
    }
    throw error;
  }
}
