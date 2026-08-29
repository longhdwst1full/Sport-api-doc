import { Prisma } from '@prisma/client';

export interface WriteAuditLogInput {
  requestId: string;
  sequenceNo: number;
  actorType: 'USER' | 'SYSTEM' | 'GUEST';
  actorUserId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  reason?: string;
  ipHash?: string;
  userAgentHash?: string;
}

export interface WrittenAuditLog {
  id: string;
  createdAt: string;
}
