import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ErrorResponseDto } from '../../../platform/http/error-response.dto';
import { ListProductsQueryDto, ProductDetailDto, ProductListResponseDto } from '../dto/product.dto';
import { ProductsService } from '../products.service';

@ApiTags('Storefront Catalog')
@Controller('catalog/products')
export class CatalogController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @ApiOperation({ operationId: 'listCatalogProducts', summary: 'List published products' })
  @ApiOkResponse({ type: ProductListResponseDto })
  listCatalogProducts(@Query() query: ListProductsQueryDto): ProductListResponseDto {
    return this.products.list(query);
  }

  @Get(':slug')
  @ApiOperation({ operationId: 'getCatalogProduct', summary: 'Get product by slug' })
  @ApiOkResponse({ type: ProductDetailDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  getCatalogProduct(@Param('slug') slug: string): ProductDetailDto {
    return this.products.getBySlug(slug);
  }
}
