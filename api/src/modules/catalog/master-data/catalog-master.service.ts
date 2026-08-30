import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
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
      const id = uuidv7();
      const row = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.brand.create({ data: { id, ...input } });
        await this.audit.write(
          {
            requestId: context.requestId,
            sequenceNo: 1,
            actorType: 'USER',
            actorUserId: context.actorUserId,
            action: 'catalog.brand.create',
            entityType: 'BRAND',
            entityId: id,
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
      const id = uuidv7();
      const row = await this.prisma.$transaction(async (transaction) => {
        const parent = input.parentId
          ? await transaction.category.findFirst({
              where: { id: input.parentId, status: 'ACTIVE' },
            })
          : null;
        if (input.parentId && !parent) throw new UnprocessableEntityException('Parent category is not active');
        const created = await transaction.category.create({
          data: {
            id,
            parentId: input.parentId,
            code: input.code,
            name: input.name,
            slug: input.slug,
            description: input.description,
            imageAssetId: input.imageAssetId,
            sortOrder: input.sortOrder ?? 0,
            path: parent ? `${parent.path}/${id}` : id,
            depth: parent ? parent.depth + 1 : 0,
          },
        });
        await this.audit.write(
          {
            requestId: context.requestId,
            sequenceNo: 1,
            actorType: 'USER',
            actorUserId: context.actorUserId,
            action: 'catalog.category.create',
            entityType: 'CATEGORY',
            entityId: id,
            after: input as unknown as Prisma.InputJsonValue,
          },
          transaction,
        );
        return created;
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
    const { expectedVersion, ...fields } = input;
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const current = await transaction.brand.findUnique({ where: { id } });
        if (!current) throw new NotFoundException('Brand not found');
        const result = await transaction.brand.updateMany({
          where: { id, version: BigInt(expectedVersion) },
          data: { ...fields, version: { increment: 1 } },
        });
        if (result.count !== 1) throw new ConflictException('Brand version conflict');
        const updated = await transaction.brand.findUniqueOrThrow({ where: { id } });
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
              logoAssetId: current.logoAssetId,
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
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.brand.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Brand not found');
      const result = await transaction.brand.updateMany({
        where: { id, version: BigInt(input.expectedVersion) },
        data: { status, version: { increment: 1 } },
      });
      if (result.count !== 1) throw new ConflictException('Brand version conflict');
      const updated = await transaction.brand.findUniqueOrThrow({ where: { id } });
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
    const { expectedVersion, ...fields } = input;
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const current = await transaction.category.findUnique({ where: { id } });
        if (!current) throw new NotFoundException('Category not found');
        const result = await transaction.category.updateMany({
          where: { id, version: BigInt(expectedVersion) },
          data: { ...fields, version: { increment: 1 } },
        });
        if (result.count !== 1) throw new ConflictException('Category version conflict');
        const updated = await transaction.category.findUniqueOrThrow({ where: { id } });
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
              imageAssetId: current.imageAssetId,
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
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.category.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Category not found');
      if (status === 'ACTIVE' && current.parentId) {
        const parent = await transaction.category.findFirst({
          where: { id: current.parentId, status: 'ACTIVE' },
        });
        if (!parent) throw new UnprocessableEntityException('Parent category is not active');
      }
      if (status === 'INACTIVE') {
        const activeChildren = await transaction.category.count({
          where: { parentId: id, status: 'ACTIVE' },
        });
        if (activeChildren > 0) {
          throw new UnprocessableEntityException(
            'Deactivate active child categories before deactivating this category',
          );
        }
      }
      const result = await transaction.category.updateMany({
        where: { id, version: BigInt(input.expectedVersion) },
        data: { status, version: { increment: 1 } },
      });
      if (result.count !== 1) throw new ConflictException('Category version conflict');
      const updated = await transaction.category.findUniqueOrThrow({ where: { id } });
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
    id: string;
    code: string;
    name: string;
    slug: string;
    description: string | null;
    logoAssetId: string | null;
    status: string;
    version: bigint;
  }): BrandDto {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      slug: row.slug,
      ...(row.description ? { description: row.description } : {}),
      ...(row.logoAssetId ? { logoAssetId: row.logoAssetId } : {}),
      status: row.status as BrandDto['status'],
      version: Number(row.version),
    };
  }

  private toCategory(row: {
    id: string; parentId: string | null; code: string; name: string; slug: string;
    path: string; depth: number; description: string | null; imageAssetId: string | null;
    sortOrder: number; status: string; version: bigint;
  }): CategoryDto {
    return {
      id: row.id,
      ...(row.parentId ? { parentId: row.parentId } : {}),
      code: row.code,
      name: row.name,
      slug: row.slug,
      path: row.path,
      depth: row.depth,
      ...(row.description ? { description: row.description } : {}),
      ...(row.imageAssetId ? { imageAssetId: row.imageAssetId } : {}),
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
