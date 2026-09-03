import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RequirePermissions } from '../../../../common/decorators/require-permissions.decorator';
import { ErrorResponseDto } from '../../../../common/exceptions/error-response.dto';
import {
  ActiveLookupResponseDto,
  ActiveSearchQueryDto,
} from '../../../../common/pagination/active-search.dto';
import { AuthenticatedRequest, getMutationContext } from '../../../../common/request/request-context';
import {
  ChangeProductStatusDto,
  ChangeProductMediaStatusDto,
  AttachProductMediaDto,
  CreateBundleDto,
  CreatePriceDto,
  CreateProductDto,
  CreateVariantDto,
  ListProductsQueryDto,
  ProductDetailDto,
  ProductListResponseDto,
  ProductMediaDto,
  ReorderProductMediaDto,
  ReplacePriceDto,
  UpdateProductDto,
  UpdateProductMediaDto,
  UpdateVariantDto,
} from '../dto/product.dto';
import { ProductMediaService } from '../services/product-media.service';
import { ProductsService } from '../services/products.service';

@ApiTags('Admin Products')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiForbiddenResponse({ type: ErrorResponseDto })
@Controller('admin/products')
export class AdminProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly productMedia: ProductMediaService,
  ) {}

  @Get()
  @RequirePermissions('catalog.product.view')
  @ApiOperation({ operationId: 'listAdminProducts', summary: 'List products for admin' })
  @ApiOkResponse({ type: ProductListResponseDto })
  listAdminProducts(@Query() query: ListProductsQueryDto): Promise<ProductListResponseDto> {
    return this.products.list(query, false);
  }

  @Get('variants/active')
  @RequirePermissions('catalog.product.view')
  @ApiOperation({
    operationId: 'searchActiveAdminProductVariants',
    summary: 'Search active standard SKU variants for selectors and combo components',
  })
  @ApiOkResponse({ type: ActiveLookupResponseDto })
  searchActiveVariants(
    @Query() query: ActiveSearchQueryDto,
  ): Promise<ActiveLookupResponseDto> {
    return this.products.searchActiveVariants(query);
  }

  @Get(':slug')
  @RequirePermissions('catalog.product.view')
  @ApiOperation({ operationId: 'getAdminProduct', summary: 'Get product detail for admin' })
  @ApiOkResponse({ type: ProductDetailDto })
  getAdminProduct(@Param('slug') slug: string): Promise<ProductDetailDto> {
    return this.products.getBySlug(slug, false);
  }

  @Post()
  @RequirePermissions('catalog.product.manage')
  @ApiOperation({ operationId: 'createAdminProduct', summary: 'Create product' })
  @ApiCreatedResponse({ type: ProductDetailDto })
  createAdminProduct(
    @Body() input: CreateProductDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<ProductDetailDto> {
    return this.products.create(input, getMutationContext(request));
  }

  @Patch(':id')
  @RequirePermissions('catalog.product.manage')
  @ApiOperation({ operationId: 'updateAdminProduct', summary: 'Update product' })
  @ApiOkResponse({ type: ProductDetailDto })
  updateAdminProduct(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: UpdateProductDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<ProductDetailDto> {
    return this.products.update(id, input, getMutationContext(request));
  }


  @Post(':id/variants')
  @RequirePermissions('catalog.product.manage')
  @ApiOperation({ operationId: 'createAdminProductVariant', summary: 'Create a sellable SKU variant' })
  @ApiCreatedResponse({ type: ProductDetailDto })
  createVariant(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: CreateVariantDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<ProductDetailDto> {
    return this.products.createVariant(id, input, getMutationContext(request));
  }

  @Patch('variants/:variantId')
  @RequirePermissions('catalog.product.manage')
  @ApiOperation({ operationId: 'updateAdminProductVariant', summary: 'Update mutable SKU metadata' })
  @ApiOkResponse({ type: ProductDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  updateVariant(
    @Param('variantId', new ParseUUIDPipe()) variantId: string,
    @Body() input: UpdateVariantDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<ProductDetailDto> {
    return this.products.updateVariant(variantId, input, getMutationContext(request));
  }

  @Post(':id/media')
  @RequirePermissions('catalog.product.manage')
  @ApiOperation({ operationId: 'attachAdminProductMedia', summary: 'Attach one finalized media asset to a product or SKU' })
  @ApiCreatedResponse({ type: [ProductMediaDto] })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  attachMedia(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: AttachProductMediaDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<ProductMediaDto[]> {
    return this.productMedia.attach(id, input, getMutationContext(request));
  }

  @Patch(':id/media/reorder')
  @RequirePermissions('catalog.product.manage')
  @ApiOperation({ operationId: 'reorderAdminProductMedia', summary: 'Replace the order of all active product media' })
  @ApiOkResponse({ type: [ProductMediaDto] })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  reorderMedia(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: ReorderProductMediaDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<ProductMediaDto[]> {
    return this.productMedia.reorder(id, input, getMutationContext(request));
  }

  @Patch(':id/media/:mediaId')
  @RequirePermissions('catalog.product.manage')
  @ApiOperation({ operationId: 'updateAdminProductMedia', summary: 'Update product media alt text or primary flag' })
  @ApiOkResponse({ type: [ProductMediaDto] })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  updateMedia(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('mediaId', new ParseUUIDPipe()) mediaId: string,
    @Body() input: UpdateProductMediaDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<ProductMediaDto[]> {
    return this.productMedia.update(id, mediaId, input, getMutationContext(request));
  }

  @Post(':id/media/:mediaId/archive')
  @HttpCode(200)
  @RequirePermissions('catalog.product.manage')
  @ApiOperation({ operationId: 'archiveAdminProductMedia', summary: 'Archive a product media link without deleting its asset' })
  @ApiOkResponse({ type: [ProductMediaDto] })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  archiveMedia(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('mediaId', new ParseUUIDPipe()) mediaId: string,
    @Body() input: ChangeProductMediaStatusDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<ProductMediaDto[]> {
    return this.productMedia.archive(
      id,
      mediaId,
      input.expectedProductVersion,
      getMutationContext(request),
    );
  }

  @Post('variants/:variantId/prices')
  @RequirePermissions('catalog.price.manage')
  @ApiOperation({ operationId: 'createAdminProductPrice', summary: 'Create a global VAT-included price window' })
  @ApiCreatedResponse({ type: ProductDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  createPrice(
    @Param('variantId', new ParseUUIDPipe()) variantId: string,
    @Body() input: CreatePriceDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<ProductDetailDto> {
    return this.products.createPrice(variantId, input, getMutationContext(request));
  }

  @Post('variants/:variantId/prices/replace')
  @RequirePermissions('catalog.price.manage')
  @ApiOperation({
    operationId: 'replaceAdminProductPrice',
    summary: 'Atomically close the current open price and create its replacement',
  })
  @ApiCreatedResponse({ type: ProductDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  replacePrice(
    @Param('variantId', new ParseUUIDPipe()) variantId: string,
    @Body() input: ReplacePriceDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<ProductDetailDto> {
    return this.products.replacePrice(variantId, input, getMutationContext(request));
  }

  @Post(':id/publish')
  @HttpCode(200)
  @RequirePermissions('catalog.product.publish')
  @ApiOperation({ operationId: 'publishAdminProduct', summary: 'Publish a complete draft product' })
  @ApiOkResponse({ type: ProductDetailDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  publish(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: ChangeProductStatusDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<ProductDetailDto> {
    return this.products.publish(id, input, getMutationContext(request));
  }

  @Post(':id/archive')
  @HttpCode(200)
  @RequirePermissions('catalog.product.publish')
  @ApiOperation({
    operationId: 'archiveAdminProduct',
    summary: 'Archive a product or combo and remove it from storefront sales',
  })
  @ApiOkResponse({ type: ProductDetailDto })
  archiveProduct(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: ChangeProductStatusDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<ProductDetailDto> {
    return this.products.archiveProduct(id, input, getMutationContext(request));
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  @RequirePermissions('catalog.product.publish')
  @ApiOperation({
    operationId: 'reactivateAdminProduct',
    summary: 'Reactivate an archived product or combo as DRAFT for review',
  })
  @ApiOkResponse({ type: ProductDetailDto })
  reactivateProduct(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: ChangeProductStatusDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<ProductDetailDto> {
    return this.products.reactivateProduct(id, input, getMutationContext(request));
  }

  @Post('variants/:variantId/archive')
  @HttpCode(200)
  @RequirePermissions('catalog.product.manage')
  @ApiOperation({ operationId: 'archiveAdminProductVariant', summary: 'Archive one sellable SKU variant' })
  @ApiOkResponse({ type: ProductDetailDto })
  archiveVariant(
    @Param('variantId', new ParseUUIDPipe()) variantId: string,
    @Body() input: ChangeProductStatusDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<ProductDetailDto> {
    return this.products.archiveVariant(variantId, input, getMutationContext(request));
  }

  @Post('variants/:variantId/reactivate')
  @HttpCode(200)
  @RequirePermissions('catalog.product.manage')
  @ApiOperation({ operationId: 'reactivateAdminProductVariant', summary: 'Reactivate one archived SKU variant' })
  @ApiOkResponse({ type: ProductDetailDto })
  reactivateVariant(
    @Param('variantId', new ParseUUIDPipe()) variantId: string,
    @Body() input: ChangeProductStatusDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<ProductDetailDto> {
    return this.products.reactivateVariant(variantId, input, getMutationContext(request));
  }

  @Post(':id/bundle')
  @RequirePermissions('catalog.product.manage')
  @ApiOperation({ operationId: 'createAdminProductBundle', summary: 'Create a fixed non-nested virtual combo' })
  @ApiCreatedResponse({ type: ProductDetailDto })
  createBundle(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: CreateBundleDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<ProductDetailDto> {
    return this.products.createBundle(id, input, getMutationContext(request));
  }
}
