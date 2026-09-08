import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toDatabaseId, toEntityId } from '../../common/identifiers/entity-id';
import { PrismaService } from '../../database/prisma.service';
import { USER_STATUS, USER_TYPE } from '../iam/iam.constants';
import { InvalidVietnamesePhoneNumberError, normalizeVietnamesePhone } from '../auth/phone-normalization';
import { CUSTOMER_ADDRESS_TYPE, CUSTOMER_COUNTRY, CUSTOMER_STATUS } from './customer.constants';
import { CreateCustomerAddressDto, CustomerAddressDto, UpdateCustomerAddressDto } from './customer-address.dto';

@Injectable()
export class CustomerAddressService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<CustomerAddressDto[]> {
    const customer = await this.prisma.customer.findUnique({ where: { userId: toDatabaseId(userId) } });
    if (!customer) return [];
    const rows = await this.prisma.customerAddress.findMany({
      where: { customerId: customer.id, status: CUSTOMER_STATUS.ACTIVE },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((row) => this.toDto(row));
  }

  async create(userId: string, input: CreateCustomerAddressDto): Promise<CustomerAddressDto> {
    const customer = await this.ensureCustomer(userId);
    const phone = this.normalizePhone(input.phone);
    return this.prisma.$transaction(async (transaction) => {
      const activeCount = await transaction.customerAddress.count({
        where: { customerId: customer.id, status: CUSTOMER_STATUS.ACTIVE },
      });
      const makeDefault = input.isDefault === true || activeCount === 0;
      if (makeDefault) {
        await transaction.customerAddress.updateMany({
          where: { customerId: customer.id, status: CUSTOMER_STATUS.ACTIVE, isDefault: true },
          data: { isDefault: false, version: { increment: 1 } },
        });
      }
      const row = await transaction.customerAddress.create({
        data: {
          customerId: customer.id,
          addressType: CUSTOMER_ADDRESS_TYPE.SHIPPING,
          recipient: input.recipient.trim(),
          phone,
          addressLine: input.addressLine.trim(),
          ward: input.ward?.trim() || null,
          district: input.district?.trim() || null,
          provinceCode: input.provinceCode.trim(),
          postalCode: input.postalCode?.trim() || null,
          countryCode: CUSTOMER_COUNTRY.VIETNAM,
          isDefault: makeDefault,
        },
      });
      return this.toDto(row);
    });
  }

  async update(userId: string, addressId: string, input: UpdateCustomerAddressDto): Promise<CustomerAddressDto> {
    const customer = await this.ensureCustomer(userId);
    const id = toDatabaseId(addressId);
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.customerAddress.findFirst({
        where: { id, customerId: customer.id, status: CUSTOMER_STATUS.ACTIVE },
      });
      if (!current) throw new NotFoundException('Customer address was not found');
      if (Number(current.version) !== input.expectedVersion) {
        throw new ConflictException('Address changed; reload and retry');
      }
      if (input.isDefault === true && !current.isDefault) {
        await transaction.customerAddress.updateMany({
          where: { customerId: customer.id, status: CUSTOMER_STATUS.ACTIVE, isDefault: true },
          data: { isDefault: false, version: { increment: 1 } },
        });
      }
      const changed = await transaction.customerAddress.updateMany({
        where: { id, customerId: customer.id, status: CUSTOMER_STATUS.ACTIVE, version: current.version },
        data: {
          recipient: input.recipient?.trim(),
          phone: input.phone ? this.normalizePhone(input.phone) : undefined,
          addressLine: input.addressLine?.trim(),
          ward: input.ward === undefined ? undefined : input.ward.trim() || null,
          district: input.district === undefined ? undefined : input.district.trim() || null,
          provinceCode: input.provinceCode?.trim(),
          postalCode: input.postalCode === undefined ? undefined : input.postalCode.trim() || null,
          isDefault: input.isDefault,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new ConflictException('Address changed; reload and retry');
      return this.toDto(await transaction.customerAddress.findUniqueOrThrow({ where: { id } }));
    });
  }

  async remove(userId: string, addressId: string, expectedVersion: number): Promise<void> {
    const customer = await this.ensureCustomer(userId);
    const id = toDatabaseId(addressId);
    await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.customerAddress.findFirst({
        where: { id, customerId: customer.id, status: CUSTOMER_STATUS.ACTIVE },
      });
      if (!current) throw new NotFoundException('Customer address was not found');
      if (current.isDefault) throw new ConflictException('Choose another default address before removing this one');
      const changed = await transaction.customerAddress.updateMany({
        where: { id, customerId: customer.id, status: CUSTOMER_STATUS.ACTIVE, version: BigInt(expectedVersion) },
        data: { status: CUSTOMER_STATUS.INACTIVE, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictException('Address changed; reload and retry');
    });
  }

  private async ensureCustomer(userId: string) {
    const id = toDatabaseId(userId);
    const existing = await this.prisma.customer.findUnique({ where: { userId: id } });
    if (existing) return existing;
    const user = await this.prisma.user.findFirst({
      where: { id, userType: USER_TYPE.CUSTOMER, status: USER_STATUS.ACTIVE },
    });
    if (!user) throw new NotFoundException('Active customer account was not found');
    try {
      return await this.prisma.customer.create({
        data: {
          userId: user.id,
          customerNo: `CUS-${user.id.toString().padStart(8, '0')}`,
          name: user.displayName,
          email: user.email,
          normalizedEmail: user.normalizedEmail,
          phone: user.phone,
          normalizedPhone: user.normalizedPhone,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return this.prisma.customer.findUniqueOrThrow({ where: { userId: id } });
      }
      throw error;
    }
  }

  private normalizePhone(value: string): string {
    try {
      return normalizeVietnamesePhone(value);
    } catch (error) {
      if (error instanceof InvalidVietnamesePhoneNumberError) {
        throw new BadRequestException({ code: 'INVALID_PHONE', message: 'Vietnamese phone number is invalid' });
      }
      throw error;
    }
  }

  private toDto(row: { id: bigint; recipient: string; phone: string; addressLine: string; ward: string | null; district: string | null; provinceCode: string; postalCode: string | null; countryCode: string; isDefault: boolean; version: bigint }): CustomerAddressDto {
    return { ...row, id: toEntityId(row.id), version: Number(row.version) };
  }
}
