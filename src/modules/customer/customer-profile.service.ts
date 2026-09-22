import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { toDatabaseId, toEntityId } from '../../common/identifiers/entity-id';
import { normalizeVietnamesePhone } from '../auth/phone-normalization';
import { CustomerProfileDto, UpdateCustomerProfileDto } from './customer-profile.dto';

@Injectable()
export class CustomerProfileService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Hồ sơ của chính khách đang đăng nhập.
   *
   * `/auth/me` chỉ trả `displayName` và quyền — đủ cho thanh điều hướng nhưng không đủ cho
   * trang tài khoản, nơi khách cần thấy email và số điện thoại của mình. Trước đây trang đó
   * hiển thị tên và email viết cứng trong mã nguồn.
   */
  async get(userId: string): Promise<CustomerProfileDto> {
    const customer = await this.prisma.customer.findUnique({
      where: { userId: toDatabaseId(userId) },
      select: {
        id: true,
        customerNo: true,
        name: true,
        email: true,
        phone: true,
        marketingConsent: true,
        createdAt: true,
        version: true,
      },
    });
    // Tài khoản đăng nhập được nhưng chưa gắn hồ sơ khách là dữ liệu lệch, không phải
    // trạng thái bình thường; báo rõ thay vì trả hồ sơ rỗng.
    if (!customer) throw new NotFoundException('Không tìm thấy hồ sơ khách hàng của tài khoản này');

    return {
      id: toEntityId(customer.id),
      customerNo: customer.customerNo,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      marketingConsent: customer.marketingConsent,
      createdAt: customer.createdAt.toISOString(),
      version: Number(customer.version),
    };
  }

  /**
   * Khách tự sửa hồ sơ của mình.
   *
   * TRANSACTION: email/SĐT nằm ở **hai bảng** — `users` dùng để đăng nhập, `customers` dùng cho
   * nghiệp vụ bán hàng. Ghi lệch nhau thì khách đăng nhập bằng email cũ nhưng đơn hàng gắn email
   * mới, nên hai bản ghi phải đổi trong cùng một transaction.
   *
   * INVARIANT: hồ sơ luôn còn ít nhất một kênh liên hệ, và một email/SĐT chỉ thuộc về một người.
   */
  async update(userId: string, input: UpdateCustomerProfileDto): Promise<CustomerProfileDto> {
    const databaseUserId = toDatabaseId(userId);
    const current = await this.prisma.customer.findUnique({
      where: { userId: databaseUserId },
      select: { id: true, email: true, phone: true, version: true },
    });
    if (!current) throw new NotFoundException('Không tìm thấy hồ sơ khách hàng của tài khoản này');

    const name = input.name?.trim();
    if (input.name !== undefined && !name) {
      throw new BadRequestException('Tên không được để trống');
    }
    const phone = input.phone === undefined ? undefined : this.normalizePhone(input.phone);
    const email = input.email === undefined ? undefined : this.normalizeEmail(input.email);
    const effectivePhone = phone === undefined ? current.phone : phone.value;
    const effectiveEmail = email === undefined ? current.email : email.value;
    if (!effectivePhone && !effectiveEmail) {
      throw new BadRequestException('Cần giữ lại ít nhất số điện thoại hoặc email');
    }
    await this.assertContactNotTaken(phone, email, databaseUserId, current.id);

    await this.prisma.$transaction(async (transaction) => {
      // TRANSACTION: `expectedVersion` nằm trong điều kiện WHERE chứ không kiểm sau khi ghi. Kiểm
      // sau là đã ghi rồi mới phát hiện xung đột, và hai người sửa cùng lúc vẫn có thể cùng thắng.
      const changed = await transaction.customer.updateMany({
        where: { id: current.id, version: BigInt(input.expectedVersion) },
        data: {
          ...(input.name !== undefined ? { name } : {}),
          ...(phone !== undefined
            ? { phone: phone.value, normalizedPhone: phone.normalized }
            : {}),
          ...(email !== undefined
            ? { email: email.value, normalizedEmail: email.normalized }
            : {}),
          ...(input.marketingConsent !== undefined
            ? { marketingConsent: input.marketingConsent }
            : {}),
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException('Hồ sơ vừa thay đổi ở nơi khác. Tải lại rồi thử lại.');
      }

      // Định danh đăng nhập nằm ở `users`; đổi ở hồ sơ mà quên ở đây thì khách không đăng nhập
      // được bằng thông tin họ vừa nhìn thấy trên màn hình.
      if (phone !== undefined || email !== undefined || input.name !== undefined) {
        await transaction.user.update({
          where: { id: databaseUserId },
          data: {
            ...(input.name !== undefined ? { displayName: name } : {}),
            ...(phone !== undefined
              ? { phone: phone.value, normalizedPhone: phone.normalized }
              : {}),
            ...(email !== undefined
              ? { email: email.value, normalizedEmail: email.normalized }
              : {}),
          },
        });
      }
    });

    return this.get(userId);
  }

  private normalizePhone(raw: string): { value: string; normalized: string } {
    const value = raw.trim();
    try {
      return { value, normalized: normalizeVietnamesePhone(value) };
    } catch {
      throw new BadRequestException('Số điện thoại không hợp lệ');
    }
  }

  private normalizeEmail(raw: string): { value: string; normalized: string } {
    const value = raw.trim();
    return { value, normalized: value.toLowerCase() };
  }

  /**
   * INVARIANT: một email/SĐT chỉ thuộc về một người — kiểm cả `users` lẫn `customers`.
   *
   * Chỉ kiểm một bảng là chưa đủ: khách vãng lai có hồ sơ `customers` mà không có tài khoản, còn
   * nhân viên có tài khoản mà không có hồ sơ khách. Bỏ sót bảng nào thì hai người cùng nhận được
   * một định danh và lần đăng nhập sau không biết là của ai.
   */
  private async assertContactNotTaken(
    phone: { normalized: string } | undefined,
    email: { normalized: string } | undefined,
    exceptUserId: bigint,
    exceptCustomerId: bigint,
  ): Promise<void> {
    const customerConditions: Prisma.CustomerWhereInput[] = [];
    const userConditions: Prisma.UserWhereInput[] = [];
    if (phone) {
      customerConditions.push({ normalizedPhone: phone.normalized });
      userConditions.push({ normalizedPhone: phone.normalized });
    }
    if (email) {
      customerConditions.push({ normalizedEmail: email.normalized });
      userConditions.push({ normalizedEmail: email.normalized });
    }
    if (customerConditions.length === 0) return;

    const [takenByCustomer, takenByUser] = await Promise.all([
      this.prisma.customer.findFirst({
        where: { OR: customerConditions, id: { not: exceptCustomerId } },
        select: { normalizedPhone: true },
      }),
      this.prisma.user.findFirst({
        where: { OR: userConditions, id: { not: exceptUserId } },
        select: { normalizedPhone: true },
      }),
    ]);
    const taken = takenByCustomer ?? takenByUser;
    if (!taken) return;
    throw new ConflictException(
      taken.normalizedPhone === phone?.normalized
        ? 'Số điện thoại đã thuộc về một tài khoản khác'
        : 'Email đã thuộc về một tài khoản khác',
    );
  }
}
