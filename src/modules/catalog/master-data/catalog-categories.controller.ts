import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CatalogCategoryListDto } from './catalog-master.dto';
import { CatalogMasterService } from './catalog-master.service';

@ApiTags('Storefront Catalog')
@Controller('catalog/categories')
export class CatalogCategoriesController {
  constructor(private readonly master: CatalogMasterService) {}

  @Get()
  @ApiOperation({ operationId: 'listCatalogCategories', summary: 'List active storefront categories' })
  @ApiOkResponse({ type: CatalogCategoryListDto })
  listCatalogCategories(): Promise<CatalogCategoryListDto> {
    return this.master.listStorefrontCategories();
  }
}
