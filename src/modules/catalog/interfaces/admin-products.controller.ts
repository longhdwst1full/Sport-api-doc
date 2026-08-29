import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermissions } from '../../../platform/auth/require-permissions.decorator';
import {
  CreateProductDto,
  ListProductsQueryDto,
  ProductDetailDto,
  ProductListResponseDto,
  UpdateProductDto,
} from '../dto/product.dto';
import { ProductsService } from '../products.service';

@ApiTags('Admin Products')
@ApiBearerAuth()
@Controller('admin/products')
export class AdminProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @RequirePermissions('catalog.product.view')
  @ApiOperation({ operationId: 'listAdminProducts', summary: 'List products for admin' })
  @ApiOkResponse({ type: ProductListResponseDto })
  listAdminProducts(@Query() query: ListProductsQueryDto): ProductListResponseDto {
    return this.products.list(query);
  }

  @Post()
  @RequirePermissions('catalog.product.manage')
  @ApiOperation({ operationId: 'createAdminProduct', summary: 'Create product' })
  @ApiCreatedResponse({ type: ProductDetailDto })
  createAdminProduct(@Body() input: CreateProductDto): ProductDetailDto {
    return this.products.create(input);
  }

  @Patch(':id')
  @RequirePermissions('catalog.product.manage')
  @ApiOperation({ operationId: 'updateAdminProduct', summary: 'Update product' })
  @ApiOkResponse({ type: ProductDetailDto })
  updateAdminProduct(@Param('id') id: string, @Body() input: UpdateProductDto): ProductDetailDto {
    return this.products.update(id, input);
  }
}
