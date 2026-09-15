import { ApiProperty } from '@nestjs/swagger';
import { ENTITY_ID_OPENAPI } from '../../common/identifiers/entity-id';

export class CustomerProfileDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) id: string;

  @ApiProperty({ example: 'KH-000128', description: 'Mã khách, dùng khi liên hệ hỗ trợ' })
  customerNo: string;

  @ApiProperty({ example: 'Nguyễn Minh Anh' }) name: string;

  @ApiProperty({ type: String, nullable: true, example: 'minhanh@example.com' })
  email: string | null;

  @ApiProperty({ type: String, nullable: true, example: '0903456789' })
  phone: string | null;

  @ApiProperty({ description: 'Khách có đồng ý nhận tin khuyến mãi' })
  marketingConsent: boolean;

  @ApiProperty({ description: 'Thời điểm tạo tài khoản' }) createdAt: string;
}
