import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toDatabaseId, toEntityId } from '../../common/identifiers/entity-id';
import { MutationContext } from '../../common/request/request-context';
import { PrismaService } from '../../database/prisma.service';
import { AuditWriter } from '../audit/audit.writer';
import { OrganizationRepository } from './organization.repository';
import {
  Address,
  Branch,
  BranchWithWarehouse,
  BranchWithWarehouseUpdate,
  NewBranch,
  NewWarehouse,
  OrganizationStatus,
  Warehouse,
} from './organization.types';

class OrganizationVersionConflictError extends Error {}

function toBranch(row: {
  id: bigint;
  code: string;
  name: string;
  status: string;
  phone: string | null;
  email: string | null;
  addressJson: Prisma.JsonValue;
  timezone: string;
  version: bigint;
}): Branch {
  return {
    id: toEntityId(row.id),
    code: row.code,
    name: row.name,
    status: row.status as Branch['status'],
    ...(row.phone ? { phone: row.phone } : {}),
    ...(row.email ? { email: row.email } : {}),
    address: row.addressJson as unknown as Address,
    timezone: row.timezone,
    version: Number(row.version),
  };
}

function toWarehouse(row: {
  id: bigint;
  branchId: bigint;
  code: string;
  name: string;
  status: string;
  isPrimary: boolean;
  version: bigint;
}): Warehouse {
  return {
    id: toEntityId(row.id),
    branchId: toEntityId(row.branchId),
    code: row.code,
    name: row.name,
    status: row.status as Warehouse['status'],
    isPrimary: row.isPrimary,
    version: Number(row.version),
  };
}

@Injectable()
export class PrismaOrganizationRepository extends OrganizationRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
  ) {
    super();
  }

  async listBranches(): Promise<Branch[]> {
    const rows = await this.prisma.branch.findMany({
      orderBy: [{ code: 'asc' }],
    });
    return rows.map(toBranch);
  }

  async listWarehouses(): Promise<Warehouse[]> {
    const rows = await this.prisma.warehouse.findMany({
      orderBy: [{ code: 'asc' }],
    });
    return rows.map(toWarehouse);
  }

  async hasBranchCode(code: string): Promise<boolean> {
    return (await this.prisma.branch.count({ where: { code } })) > 0;
  }

  async hasWarehouseCode(code: string): Promise<boolean> {
    return (await this.prisma.warehouse.count({ where: { code } })) > 0;
  }

  async hasActiveBranch(id: string): Promise<boolean> {
    return (
      (await this.prisma.branch.count({
        where: { id: toDatabaseId(id), status: 'ACTIVE' },
      })) > 0
    );
  }

  async hasActiveWarehouse(id: string): Promise<boolean> {
    return (
      (await this.prisma.warehouse.count({
        where: { id: toDatabaseId(id), status: 'ACTIVE' },
      })) > 0
    );
  }

  async saveBranchWithWarehouse(
    branch: NewBranch,
    warehouse: NewWarehouse,
    context: MutationContext,
  ): Promise<BranchWithWarehouse> {
    return this.prisma.$transaction(async (transaction) => {
      const createdBranch = await transaction.branch.create({
        data: {
          code: branch.code,
          name: branch.name,
          status: branch.status,
          phone: branch.phone,
          email: branch.email,
          addressJson: branch.address as unknown as Prisma.InputJsonValue,
          timezone: branch.timezone,
          createdBy: toDatabaseId(context.actorUserId),
          updatedBy: toDatabaseId(context.actorUserId),
        },
      });
      const createdWarehouse = await transaction.warehouse.create({
        data: {
          branchId: createdBranch.id,
          code: warehouse.code,
          name: warehouse.name,
          status: warehouse.status,
          isPrimary: true,
          createdBy: toDatabaseId(context.actorUserId),
          updatedBy: toDatabaseId(context.actorUserId),
        },
      });
      await this.audit.write(
        {
          requestId: context.requestId,
          sequenceNo: 1,
          actorType: 'USER',
          actorUserId: context.actorUserId,
          action: 'organization.branch.create',
          entityType: 'BRANCH',
          entityId: toEntityId(createdBranch.id),
          after: {
            branch: toBranch(createdBranch),
            warehouse: toWarehouse(createdWarehouse),
          } as unknown as Prisma.InputJsonValue,
        },
        transaction,
      );
      return { branch: toBranch(createdBranch), warehouse: toWarehouse(createdWarehouse) };
    });
  }

  async updateBranchWithWarehouse(
    branchId: string,
    input: BranchWithWarehouseUpdate,
    expectedVersion: number,
    warehouseExpectedVersion: number,
    context: MutationContext,
  ): Promise<BranchWithWarehouse | null> {
    const databaseBranchId = toDatabaseId(branchId);
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const currentBranch = await transaction.branch.findUnique({ where: { id: databaseBranchId } });
        const currentWarehouse = await transaction.warehouse.findUnique({
          where: { branchId: databaseBranchId },
        });
        if (
          !currentBranch ||
          !currentWarehouse ||
          currentBranch.version !== BigInt(expectedVersion) ||
          currentWarehouse.version !== BigInt(warehouseExpectedVersion)
        ) {
          throw new OrganizationVersionConflictError();
        }
        const branchResult = await transaction.branch.updateMany({
          where: { id: databaseBranchId, version: BigInt(expectedVersion) },
          data: {
            name: input.name,
            phone: input.phone,
            email: input.email,
            addressJson: input.address as unknown as Prisma.InputJsonValue,
            version: { increment: 1 },
            updatedBy: toDatabaseId(context.actorUserId),
          },
        });
        const warehouseResult = await transaction.warehouse.updateMany({
          where: {
            id: currentWarehouse.id,
            version: BigInt(warehouseExpectedVersion),
          },
          data: {
            name: input.warehouseName,
            version: { increment: 1 },
            updatedBy: toDatabaseId(context.actorUserId),
          },
        });
        if (branchResult.count !== 1 || warehouseResult.count !== 1) {
          throw new OrganizationVersionConflictError();
        }
        const [updatedBranch, updatedWarehouse] = await Promise.all([
          transaction.branch.findUniqueOrThrow({ where: { id: databaseBranchId } }),
          transaction.warehouse.findUniqueOrThrow({ where: { id: currentWarehouse.id } }),
        ]);
        await this.audit.write(
          {
            requestId: context.requestId,
            sequenceNo: 1,
            actorType: 'USER',
            actorUserId: context.actorUserId,
            action: 'organization.branch.update',
            entityType: 'BRANCH',
            entityId: branchId,
            before: {
              branchName: currentBranch.name,
              warehouseName: currentWarehouse.name,
              branchVersion: Number(currentBranch.version),
              warehouseVersion: Number(currentWarehouse.version),
            },
            after: {
              branchName: updatedBranch.name,
              warehouseName: updatedWarehouse.name,
              branchVersion: Number(updatedBranch.version),
              warehouseVersion: Number(updatedWarehouse.version),
            },
          },
          transaction,
        );
        return { branch: toBranch(updatedBranch), warehouse: toWarehouse(updatedWarehouse) };
      });
    } catch (error) {
      if (error instanceof OrganizationVersionConflictError) return null;
      throw error;
    }
  }

  async changeBranchStatus(
    branchId: string,
    status: OrganizationStatus,
    expectedVersion: number,
    warehouseExpectedVersion: number,
    context: MutationContext,
  ): Promise<BranchWithWarehouse | null> {
    const databaseBranchId = toDatabaseId(branchId);
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const currentBranch = await transaction.branch.findUnique({ where: { id: databaseBranchId } });
        const currentWarehouse = await transaction.warehouse.findUnique({
          where: { branchId: databaseBranchId },
        });
        if (
          !currentBranch ||
          !currentWarehouse ||
          currentBranch.version !== BigInt(expectedVersion) ||
          currentWarehouse.version !== BigInt(warehouseExpectedVersion)
        ) {
          throw new OrganizationVersionConflictError();
        }
        const branchResult = await transaction.branch.updateMany({
          where: { id: databaseBranchId, version: BigInt(expectedVersion) },
          data: {
            status,
            version: { increment: 1 },
            updatedBy: toDatabaseId(context.actorUserId),
          },
        });
        const warehouseResult = await transaction.warehouse.updateMany({
          where: {
            id: currentWarehouse.id,
            version: BigInt(warehouseExpectedVersion),
          },
          data: {
            status,
            version: { increment: 1 },
            updatedBy: toDatabaseId(context.actorUserId),
          },
        });
        if (branchResult.count !== 1 || warehouseResult.count !== 1) {
          throw new OrganizationVersionConflictError();
        }
        const [updatedBranch, updatedWarehouse] = await Promise.all([
          transaction.branch.findUniqueOrThrow({ where: { id: databaseBranchId } }),
          transaction.warehouse.findUniqueOrThrow({ where: { id: currentWarehouse.id } }),
        ]);
        await this.audit.write(
          {
            requestId: context.requestId,
            sequenceNo: 1,
            actorType: 'USER',
            actorUserId: context.actorUserId,
            action:
              status === 'ACTIVE'
                ? 'organization.branch.activate'
                : 'organization.branch.deactivate',
            entityType: 'BRANCH',
            entityId: branchId,
            before: {
              branchStatus: currentBranch.status,
              warehouseStatus: currentWarehouse.status,
            },
            after: { branchStatus: status, warehouseStatus: status },
          },
          transaction,
        );
        return { branch: toBranch(updatedBranch), warehouse: toWarehouse(updatedWarehouse) };
      });
    } catch (error) {
      if (error instanceof OrganizationVersionConflictError) return null;
      throw error;
    }
  }
}
