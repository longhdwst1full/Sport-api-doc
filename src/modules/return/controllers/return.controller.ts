import { Body, Controller, Get, Headers, Param, Post, Query, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RequireAuthentication } from '../../../common/decorators/require-authentication.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { ErrorResponseDto } from '../../../common/exceptions/error-response.dto';
import { AuthenticatedRequest, getAuthPrincipal, getMutationContext } from '../../../common/request/request-context';
import {
  AccountReturnQueryDto,
  AdminReturnQueryDto,
  ApproveReturnDto,
  ConfirmRefundDto,
  CreateAccountReturnDto,
  CreateAdminReturnDto,
  CreateRefundDto,
  InspectReturnDto,
  ReturnCommandDto,
  ReturnDetailDto,
  ReturnListDto,
  ReturnReasonCommandDto,
} from '../dto/return.dto';
import { RETURN_PERMISSION } from '../return.constants';
import { RefundService } from '../services/refund.service';
import { ReturnService } from '../services/return.service';

const IDEMPOTENCY_HEADER = 'idempotency-key';

@ApiTags('Storefront Account Returns')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@RequireAuthentication()
@Controller('account/returns')
export class AccountReturnController {
  constructor(private readonly returns: ReturnService) {}

  @Post()
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true })
  @ApiOperation({
    operationId: 'createAccountReturn',
    summary: 'Khách đăng nhập tạo yêu cầu trả hàng cho đơn đã giao, trong hạn đổi trả',
  })
  @ApiCreatedResponse({ type: ReturnDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'Quá hạn, vượt số lượng, combo trả lẻ hoặc đã có phiếu mở' })
  create(@Body() input: CreateAccountReturnDto, @Headers(IDEMPOTENCY_HEADER) key: string, @Req() request: AuthenticatedRequest) {
    const context = getMutationContext(request);
    return this.returns.createAccount(context.actorUserId, input, key ?? '', context.requestId);
  }

  @Get()
  @ApiOperation({ operationId: 'listAccountReturns', summary: 'Danh sách phiếu trả hàng của khách đang đăng nhập' })
  @ApiOkResponse({ type: ReturnListDto })
  list(@Query() query: AccountReturnQueryDto, @Req() request: AuthenticatedRequest) {
    return this.returns.listAccount(getAuthPrincipal(request).userId, query);
  }

  @Get(':returnNo')
  @ApiOperation({ operationId: 'getAccountReturn', summary: 'Chi tiết phiếu trả hàng thuộc khách đang đăng nhập' })
  @ApiOkResponse({ type: ReturnDetailDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  get(@Param('returnNo') returnNo: string, @Req() request: AuthenticatedRequest) {
    return this.returns.getAccount(getAuthPrincipal(request).userId, returnNo);
  }

  @Post(':returnNo/cancel')
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true })
  @ApiOperation({ operationId: 'cancelAccountReturn', summary: 'Khách huỷ phiếu trả chưa gửi hàng về' })
  @ApiOkResponse({ type: ReturnDetailDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  cancel(
    @Param('returnNo') returnNo: string,
    @Body() input: ReturnReasonCommandDto,
    @Headers(IDEMPOTENCY_HEADER) key: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const context = getMutationContext(request);
    return this.returns.cancelAccount(context.actorUserId, returnNo, input, key ?? '', context.requestId);
  }
}

@ApiTags('Admin Returns')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiForbiddenResponse({ type: ErrorResponseDto })
@Controller('admin/returns')
export class AdminReturnController {
  constructor(
    private readonly returns: ReturnService,
    private readonly refunds: RefundService,
  ) {}

  @Get()
  @RequirePermissions(RETURN_PERMISSION.VIEW)
  @ApiOperation({ operationId: 'listAdminReturns', summary: 'Danh sách phiếu trả hàng theo trạng thái và phạm vi chi nhánh' })
  @ApiOkResponse({ type: ReturnListDto })
  list(@Query() query: AdminReturnQueryDto, @Req() request: AuthenticatedRequest) {
    return this.returns.listAdmin(query, getAuthPrincipal(request));
  }

  @Get(':id')
  @RequirePermissions(RETURN_PERMISSION.VIEW)
  @ApiOperation({ operationId: 'getAdminReturn', summary: 'Chi tiết phiếu trả, kết quả kiểm hàng, lượt hoàn tiền và lịch sử' })
  @ApiOkResponse({ type: ReturnDetailDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  get(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.returns.getAdmin(id, getAuthPrincipal(request));
  }

  @Post()
  @RequirePermissions(RETURN_PERMISSION.CREATE)
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true })
  @ApiOperation({
    operationId: 'createAdminReturn',
    summary: 'Nhân viên tạo phiếu trả hộ khách; người có quyền duyệt tạo thì phiếu được duyệt ngay (D56)',
  })
  @ApiCreatedResponse({ type: ReturnDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  create(@Body() input: CreateAdminReturnDto, @Headers(IDEMPOTENCY_HEADER) key: string, @Req() request: AuthenticatedRequest) {
    const context = getMutationContext(request);
    return this.returns.createAdmin(input, key ?? '', context.requestId, getAuthPrincipal(request));
  }

  @Post(':id/approve')
  @RequirePermissions(RETURN_PERMISSION.DECIDE)
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true })
  @ApiOperation({ operationId: 'approveAdminReturn', summary: 'Duyệt phiếu trả và chốt lỗi thuộc shop hay khách' })
  @ApiOkResponse({ type: ReturnDetailDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  approve(@Param('id') id: string, @Body() input: ApproveReturnDto, @Headers(IDEMPOTENCY_HEADER) key: string, @Req() request: AuthenticatedRequest) {
    const context = getMutationContext(request);
    return this.returns.approve(id, input, key ?? '', context.requestId, getAuthPrincipal(request));
  }

  @Post(':id/reject')
  @RequirePermissions(RETURN_PERMISSION.DECIDE)
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true })
  @ApiOperation({ operationId: 'rejectAdminReturn', summary: 'Từ chối phiếu trả kèm lý do' })
  @ApiOkResponse({ type: ReturnDetailDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  reject(@Param('id') id: string, @Body() input: ReturnReasonCommandDto, @Headers(IDEMPOTENCY_HEADER) key: string, @Req() request: AuthenticatedRequest) {
    const context = getMutationContext(request);
    return this.returns.reject(id, input, key ?? '', context.requestId, getAuthPrincipal(request));
  }

  @Post(':id/cancel')
  @RequirePermissions(RETURN_PERMISSION.DECIDE)
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true })
  @ApiOperation({ operationId: 'cancelAdminReturn', summary: 'Huỷ phiếu trả chưa nhận hàng' })
  @ApiOkResponse({ type: ReturnDetailDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  cancel(@Param('id') id: string, @Body() input: ReturnReasonCommandDto, @Headers(IDEMPOTENCY_HEADER) key: string, @Req() request: AuthenticatedRequest) {
    const context = getMutationContext(request);
    return this.returns.cancelAdmin(id, input, key ?? '', context.requestId, getAuthPrincipal(request));
  }

  @Post(':id/receive')
  @RequirePermissions(RETURN_PERMISSION.RECEIVE)
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true })
  @ApiOperation({
    operationId: 'receiveAdminReturn',
    summary: 'Nhận và kiểm hàng trả; chỉ SELLABLE được nhập lại tồn bán, chốt trần tiền hoàn',
  })
  @ApiOkResponse({ type: ReturnDetailDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  receive(@Param('id') id: string, @Body() input: InspectReturnDto, @Headers(IDEMPOTENCY_HEADER) key: string, @Req() request: AuthenticatedRequest) {
    const context = getMutationContext(request);
    return this.returns.receive(id, input, key ?? '', context.requestId, getAuthPrincipal(request));
  }

  @Post(':id/refunds')
  @RequirePermissions(RETURN_PERMISSION.REFUND_REQUEST)
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true })
  @ApiOperation({
    operationId: 'requestAdminReturnRefund',
    summary: 'Tạo lượt hoàn tiền (tiền mặt/chuyển khoản), không vượt số tiền còn được hoàn',
  })
  @ApiOkResponse({ type: ReturnDetailDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  requestRefund(@Param('id') id: string, @Body() input: CreateRefundDto, @Headers(IDEMPOTENCY_HEADER) key: string, @Req() request: AuthenticatedRequest) {
    const context = getMutationContext(request);
    return this.refunds.request(id, input, key ?? '', context.requestId, getAuthPrincipal(request));
  }

  @Post(':id/refunds/:refundId/confirm')
  @RequirePermissions(RETURN_PERMISSION.REFUND_APPROVE)
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true })
  @ApiOperation({
    operationId: 'confirmAdminReturnRefund',
    summary: 'Xác nhận đã trả tiền cho khách; chuyển khoản bắt buộc mã giao dịch',
  })
  @ApiOkResponse({ type: ReturnDetailDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  confirmRefund(
    @Param('id') id: string,
    @Param('refundId') refundId: string,
    @Body() input: ConfirmRefundDto,
    @Headers(IDEMPOTENCY_HEADER) key: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const context = getMutationContext(request);
    return this.refunds.confirm(id, refundId, input, key ?? '', context.requestId, getAuthPrincipal(request));
  }

  @Post(':id/refunds/:refundId/fail')
  @RequirePermissions(RETURN_PERMISSION.REFUND_APPROVE)
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true })
  @ApiOperation({ operationId: 'failAdminReturnRefund', summary: 'Đánh lượt hoàn không thực hiện được để tạo lượt khác' })
  @ApiOkResponse({ type: ReturnDetailDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  failRefund(
    @Param('id') id: string,
    @Param('refundId') refundId: string,
    @Body() input: ReturnReasonCommandDto,
    @Headers(IDEMPOTENCY_HEADER) key: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const context = getMutationContext(request);
    return this.refunds.fail(id, refundId, input, key ?? '', context.requestId, getAuthPrincipal(request));
  }

  @Post(':id/close')
  @RequirePermissions(RETURN_PERMISSION.DECIDE)
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true })
  @ApiOperation({ operationId: 'closeAdminReturn', summary: 'Đóng phiếu trả đã nhận hàng khi không còn lượt hoàn chờ' })
  @ApiOkResponse({ type: ReturnDetailDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  close(@Param('id') id: string, @Body() input: ReturnCommandDto, @Headers(IDEMPOTENCY_HEADER) key: string, @Req() request: AuthenticatedRequest) {
    const context = getMutationContext(request);
    return this.returns.close(id, input, key ?? '', context.requestId, getAuthPrincipal(request));
  }
}
