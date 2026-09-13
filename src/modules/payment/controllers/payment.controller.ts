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
  ApiUnauthorizedResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { RequireAuthentication } from '../../../common/decorators/require-authentication.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { ErrorResponseDto } from '../../../common/exceptions/error-response.dto';
import { AuthenticatedRequest, getAuthPrincipal, getMutationContext, MutationContext } from '../../../common/request/request-context';
import { CART_HEADER } from '../../cart/cart.constants';
import { CreateMediaUploadDto, SignedMediaUploadDto } from '../../media/media.dto';
import {
  AdminPaymentListDto,
  AdminPaymentQueryDto,
  ConfirmPaymentDto,
  PaymentDetailDto,
  RejectPaymentDto,
  SubmitPaymentEvidenceDto,
} from '../dto/payment.dto';
import { PaymentService } from '../services/payment.service';

const IDEMPOTENCY_HEADER = 'idempotency-key';

function guestMutationContext(request: Request): MutationContext {
  const id = typeof request.id === 'string' || typeof request.id === 'number'
    ? String(request.id)
    : (request.header('x-request-id') ?? `payment-${Date.now()}`);
  return { requestId: id, actorUserId: '' };
}

@ApiTags('Storefront Guest Payments')
@Controller('payments/guest/orders')
export class GuestPaymentController {
  constructor(private readonly payments: PaymentService) {}

  @Get(':orderNo')
  @ApiHeader({ name: CART_HEADER.GUEST_TOKEN, required: true })
  @ApiOperation({ operationId: 'getGuestPayment', summary: 'Xem hướng dẫn và trạng thái thanh toán của đơn khách vãng lai' })
  @ApiOkResponse({ type: PaymentDetailDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  get(@Param('orderNo') orderNo: string, @Headers(CART_HEADER.GUEST_TOKEN) token: string) {
    return this.payments.getGuest(token ?? '', orderNo);
  }

  @Post(':orderNo/uploads/signature')
  @ApiHeader({ name: CART_HEADER.GUEST_TOKEN, required: true })
  @ApiOperation({ operationId: 'createGuestPaymentEvidenceUpload', summary: 'Tạo chữ ký upload Cloudinary ngắn hạn cho bằng chứng chuyển khoản' })
  @ApiCreatedResponse({ type: SignedMediaUploadDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  createUpload(
    @Param('orderNo') orderNo: string,
    @Headers(CART_HEADER.GUEST_TOKEN) token: string,
    @Body() input: CreateMediaUploadDto,
  ) {
    return this.payments.createGuestUpload(token ?? '', orderNo, input);
  }

  @Post(':orderNo/evidences')
  @ApiHeader({ name: CART_HEADER.GUEST_TOKEN, required: true })
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true })
  @ApiOperation({ operationId: 'submitGuestPaymentEvidence', summary: 'Xác minh upload và gửi bằng chứng chuyển khoản để Admin duyệt' })
  @ApiCreatedResponse({ type: PaymentDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  submitEvidence(
    @Param('orderNo') orderNo: string,
    @Headers(CART_HEADER.GUEST_TOKEN) token: string,
    @Headers(IDEMPOTENCY_HEADER) idempotencyKey: string,
    @Body() input: SubmitPaymentEvidenceDto,
    @Req() request: Request,
  ) {
    return this.payments.submitGuestEvidence(
      token ?? '', orderNo, input, idempotencyKey ?? '', guestMutationContext(request),
    );
  }
}

@ApiTags('Storefront Account Payments')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@RequireAuthentication()
@Controller('account/payments/orders')
export class AccountPaymentController {
  constructor(private readonly payments: PaymentService) {}

  @Get(':orderNo')
  @ApiOperation({ operationId: 'getAccountPayment', summary: 'Xem hướng dẫn và trạng thái thanh toán của đơn thuộc tài khoản' })
  @ApiOkResponse({ type: PaymentDetailDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  get(@Param('orderNo') orderNo: string, @Req() request: AuthenticatedRequest) {
    return this.payments.getAccount(getAuthPrincipal(request).userId, orderNo);
  }

  @Post(':orderNo/uploads/signature')
  @ApiOperation({ operationId: 'createAccountPaymentEvidenceUpload', summary: 'Tạo chữ ký upload Cloudinary ngắn hạn cho bằng chứng chuyển khoản' })
  @ApiCreatedResponse({ type: SignedMediaUploadDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  createUpload(
    @Param('orderNo') orderNo: string,
    @Body() input: CreateMediaUploadDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.payments.createAccountUpload(getAuthPrincipal(request).userId, orderNo, input);
  }

  @Post(':orderNo/evidences')
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true })
  @ApiOperation({ operationId: 'submitAccountPaymentEvidence', summary: 'Xác minh upload và gửi bằng chứng chuyển khoản để Admin duyệt' })
  @ApiCreatedResponse({ type: PaymentDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  submitEvidence(
    @Param('orderNo') orderNo: string,
    @Headers(IDEMPOTENCY_HEADER) idempotencyKey: string,
    @Body() input: SubmitPaymentEvidenceDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const principal = getAuthPrincipal(request);
    return this.payments.submitAccountEvidence(
      principal.userId, orderNo, input, idempotencyKey ?? '', getMutationContext(request),
    );
  }
}

@ApiTags('Admin Payments')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@Controller('admin/payments')
export class AdminPaymentController {
  constructor(private readonly payments: PaymentService) {}

  @Get()
  @RequirePermissions('payment.view')
  @ApiOperation({ operationId: 'listAdminPayments', summary: 'Danh sách thanh toán theo trạng thái, phương thức, tìm kiếm và phạm vi chi nhánh' })
  @ApiOkResponse({ type: AdminPaymentListDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  list(@Query() query: AdminPaymentQueryDto, @Req() request: AuthenticatedRequest) {
    return this.payments.listAdmin(query, getAuthPrincipal(request));
  }

  @Get(':id')
  @RequirePermissions('payment.view')
  @ApiOperation({ operationId: 'getAdminPayment', summary: 'Chi tiết thanh toán và bằng chứng trong phạm vi chi nhánh' })
  @ApiOkResponse({ type: PaymentDetailDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  get(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.payments.getAdmin(id, getAuthPrincipal(request));
  }

  @Post(':id/confirm')
  @RequirePermissions('payment.confirm')
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true })
  @ApiOperation({ operationId: 'confirmAdminPayment', summary: 'Xác nhận chuyển khoản đủ tiền hoặc thu COD sau giao hàng' })
  @ApiOkResponse({ type: PaymentDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  confirm(
    @Param('id') id: string,
    @Headers(IDEMPOTENCY_HEADER) idempotencyKey: string,
    @Body() input: ConfirmPaymentDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.payments.confirmAdmin(
      id, input, idempotencyKey ?? '', getAuthPrincipal(request), getMutationContext(request),
    );
  }

  @Post(':id/reject')
  @RequirePermissions('payment.confirm')
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true })
  @ApiOperation({ operationId: 'rejectAdminPayment', summary: 'Từ chối bằng chứng thanh toán và lưu lý do/audit' })
  @ApiOkResponse({ type: PaymentDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  reject(
    @Param('id') id: string,
    @Headers(IDEMPOTENCY_HEADER) idempotencyKey: string,
    @Body() input: RejectPaymentDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.payments.rejectAdmin(
      id, input, idempotencyKey ?? '', getAuthPrincipal(request), getMutationContext(request),
    );
  }
}

