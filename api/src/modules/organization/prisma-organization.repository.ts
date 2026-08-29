import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MutationContext } from '../../common/request/request-context';
import { PrismaService } from '../../database/prisma.service';
import { AuditWriter } from '../audit/audit.writer';
import { OrganizationRepository } from './organization.repository';
import { Address, Branch, BranchWithWarehouse, Warehouse } from './organization.types';

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
      where: { deletedAt: null },
      orderBy: [{ code: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      status: row.status as Branch['status'],
      ...(row.phone ? { phone: row.phone } : {}),
      ...(row.email ? { email: row.email } : {}),
      address: row.addressJson as unknown as Address,
      timezone: row.timezone,
      version: Number(row.version),
    }));
  }

  async listWarehouses(): Promise<Warehouse[]> {
    const rows = await this.prisma.warehouse.findMany({
      where: { deletedAt: null },
      orderBy: [{ code: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      branchId: row.branchId,
      code: row.code,
      name: row.name,
      status: row.status as Warehouse['status'],
      isPrimary: row.isPrimary,
      version: Number(row.version),
    }));
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
        where: { id, status: 'ACTIVE', deletedAt: null },
      })) > 0
    );
  }

  async hasActiveWarehouse(id: string): Promise<boolean> {
    return (
      (await this.prisma.warehouse.count({
        where: { id, status: 'ACTIVE', deletedAt: null },
      })) > 0
    );
  }

  async saveBranchWithWarehouse(
    branch: Branch,
    warehouse: Warehouse,
    context: MutationContext,
  ): Promise<BranchWithWarehouse> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.branch.create({
        data: {
          id: branch.id,
          code: branch.code,
          name: branch.name,
          status: branch.status,
          phone: branch.phone,
          email: branch.email,
          addressJson: branch.address as unknown as Prisma.InputJsonValue,
          timezone: branch.timezone,
          createdBy: context.actorUserId,
          updatedBy: context.actorUserId,
        },
      });
      await transaction.warehouse.create({
        data: {
          id: warehouse.id,
          branchId: branch.id,
          code: warehouse.code,
          name: warehouse.name,
          status: warehouse.status,
          isPrimary: true,
          createdBy: context.actorUserId,
          updatedBy: context.actorUserId,
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
          entityId: branch.id,
          after: { branch, warehouse } as unknown as Prisma.InputJsonValue,
        },
        transaction,
      );
      return { branch, warehouse };
    });
  }
}
