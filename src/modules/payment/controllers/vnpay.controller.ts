import { Controller, Get, Query } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ReturnQueryFromVNPay } from 'vnpay';
import { VnpayReturnDto } from '../dto/payment.dto';
import { VnpayIpnResult, VnpayService } from '../services/vnpay.service';

@ApiTags('Storefront Payments')
@Controller('payments/vnpay')
export class VnpayController {
  constructor(private readonly vnpay: VnpayService) {}

  /**
   * VNPay gọi thẳng vào endpoint này từ server của họ, không qua trình duyệt khách.
   * Không gắn guard: yêu cầu không mang token, tính xác thực dựa hoàn toàn vào
   * chữ ký HMAC trong query. Không đưa vào contract FE vì FE không bao giờ gọi.
   */
  @Get('ipn')
  @ApiExcludeEndpoint()
  handleIpn(@Query() query: ReturnQueryFromVNPay): Promise<VnpayIpnResult> {
    return this.vnpay.handleIpn(query);
  }

  /**
   * Trình duyệt khách quay về sau khi rời cổng. Chỉ đọc và hiển thị —
   * trạng thái tiền do IPN quyết định.
   */
  @Get('return')
  @ApiOperation({
    operationId: 'verifyVnpayReturn',
    summary: 'Kiểm tra chữ ký khi khách quay về từ VNPay (chỉ để hiển thị)',
  })
  @ApiOkResponse({ type: VnpayReturnDto })
  handleReturn(@Query() query: ReturnQueryFromVNPay): VnpayReturnDto {
    return this.vnpay.handleReturn(query);
  }
}
