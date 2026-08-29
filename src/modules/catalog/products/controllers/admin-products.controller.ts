import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermissions } from '../../../../common/decorators/require-permissions.decorator';
import { AuthenticatedRequest, getMutationContext } from '../../../../common/request/request-context';
import {
  ChangeProductStatusDto,
  CreateBundleDto,
  CreatePriceDto,
  CreateProductDto,
  CreateVariantDto,
  ListProductsQueryDto,
  ProductDetailDto,
  ProductListResponseDto,
  UpdateProductDto,
} from '../dto/product.dto';
import { ProductsService } from '../services/products.service';

@ApiTags('Admin Products')
@ApiBearerAuth()
@Controller('admin/products')
export class AdminProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @RequirePermissions('catalog.product.view')
  @ApiOperation({ operationId: 'listAdminProducts', summary: 'List products for admin' })
  @ApiOkResponse({ type: ProductListResponseDto })
  listAdminProducts(@Query() query: ListProductsQueryDto): Promise<ProductListResponseDto> {
    return this.products.list(query, false);
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

  @Post('variants/:variantId/prices')
  @RequirePermissions('catalog.price.manage')
  @ApiOperation({ operationId: 'createAdminProductPrice', summary: 'Create a global VAT-included price window' })
  @ApiCreatedResponse({ type: ProductDetailDto })
  createPrice(
    @Param('variantId', new ParseUUIDPipe()) variantId: string,
    @Body() input: CreatePriceDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<ProductDetailDto> {
    return this.products.createPrice(variantId, input, getMutationContext(request));
  }

  @Post(':id/publish')
  @HttpCode(200)
  @RequirePermissions('catalog.product.publish')
  @ApiOperation({ operationId: 'publishAdminProduct', summary: 'Publish a complete draft product' })
  @ApiOkResponse({ type: ProductDetailDto })
  publish(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: ChangeProductStatusDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<ProductDetailDto> {
    return this.products.publish(id, input, getMutationContext(request));
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
