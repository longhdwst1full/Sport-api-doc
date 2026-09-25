import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { ErrorResponseDto } from '../../../common/exceptions/error-response.dto';
import { ParseEntityIdPipe } from '../../../common/identifiers/entity-id';
import { AuthenticatedRequest, getMutationContext } from '../../../common/request/request-context';
import { AttributeDto, AttributeListDto, CreateAttributeDto, UpdateAttributeDto } from './attribute.dto';
import { AttributesService } from './attributes.service';

/**
 * Từ điển thuộc tính (thông số kỹ thuật). Không có endpoint xoá: ngừng dùng bằng status INACTIVE vì
 * thông số sản phẩm tham chiếu theo code (decision D61). Quyền theo catalog.product.* vì đây là cấu
 * hình sản phẩm, không tạo mã quyền mới.
 */
@ApiTags('Admin Catalog')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiForbiddenResponse({ type: ErrorResponseDto })
@Controller('admin/catalog/attributes')
export class AttributesController {
  constructor(private readonly attributes: AttributesService) {}

  @Get()
  @RequirePermissions('catalog.product.view')
  @ApiOperation({ operationId: 'listAdminAttributes', summary: 'List attribute definitions (active and inactive)' })
  @ApiOkResponse({ type: AttributeListDto })
  listAdminAttributes(): Promise<AttributeListDto> {
    return this.attributes.list();
  }

  @Post()
  @RequirePermissions('catalog.product.manage')
  @ApiOperation({ operationId: 'createAdminAttribute', summary: 'Create an attribute definition; code is immutable' })
  @ApiCreatedResponse({ type: AttributeDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  createAdminAttribute(@Body() input: CreateAttributeDto, @Req() request: AuthenticatedRequest): Promise<AttributeDto> {
    return this.attributes.create(input, getMutationContext(request));
  }

  @Patch(':id')
  @RequirePermissions('catalog.product.manage')
  @ApiOperation({
    operationId: 'updateAdminAttribute',
    summary: 'Update name/unit/options/status; unit and used options are locked once products use them',
  })
  @ApiOkResponse({ type: AttributeDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  updateAdminAttribute(
    @Param('id', new ParseEntityIdPipe()) id: string,
    @Body() input: UpdateAttributeDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<AttributeDto> {
    return this.attributes.update(id, input, getMutationContext(request));
  }
}
