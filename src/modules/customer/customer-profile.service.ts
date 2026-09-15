import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { toDatabaseId, toEntityId } from '../../common/identifiers/entity-id';
import { CustomerProfileDto } from './customer-profile.dto';

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
    };
  }
}
