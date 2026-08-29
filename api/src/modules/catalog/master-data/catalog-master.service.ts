import { ConflictException, Injectable, UnprocessableEntityException } from '@nestjs/common';
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
  CreateBrandDto,
  CreateCategoryDto,
} from './catalog-master.dto';

@Injectable()
export class CatalogMasterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
  ) {}

  async listBrands(): Promise<BrandListDto> {
    const rows = await this.prisma.brand.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' } });
    const items = rows.map((row) => this.toBrand(row));
    return { items, total: items.length };
  }

  async listCategories(): Promise<CategoryListDto> {
    const rows = await this.prisma.category.findMany({
      where: { deletedAt: null },
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
              where: { id: input.parentId, status: 'ACTIVE', deletedAt: null },
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

  private toBrand(row: { id: string; code: string; name: string; slug: string; status: string; version: bigint }): BrandDto {
    return { ...row, status: row.status as BrandDto['status'], version: Number(row.version) };
  }

  private toCategory(row: {
    id: string; parentId: string | null; code: string; name: string; slug: string;
    path: string; depth: number; status: string; version: bigint;
  }): CategoryDto {
    return {
      id: row.id,
      ...(row.parentId ? { parentId: row.parentId } : {}),
      code: row.code,
      name: row.name,
      slug: row.slug,
      path: row.path,
      depth: row.depth,
      status: row.status as CategoryDto['status'],
      version: Number(row.version),
    };
  }
}
