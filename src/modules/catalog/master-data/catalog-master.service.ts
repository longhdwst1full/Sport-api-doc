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
        const activeChildren = await transaction.category.count({
          where: { parentId: databaseId, status: 'ACTIVE' },
        });
        if (activeChildren > 0) {
          throw new UnprocessableEntityException(
            'Deactivate active child categories before deactivating this category',
          );
        }
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
