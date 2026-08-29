import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { ActiveLookupResponseDto, ActiveSearchQueryDto } from '../../../common/pagination/active-search.dto';
import { AuthenticatedRequest, getMutationContext } from '../../../common/request/request-context';
import {
  BrandDto,
  BrandListDto,
  CategoryDto,
  CategoryListDto,
  CreateBrandDto,
  CreateCategoryDto,
} from './catalog-master.dto';
import { CatalogMasterService } from './catalog-master.service';

@ApiTags('Admin Catalog')
@ApiBearerAuth()
@Controller('admin/catalog')
export class CatalogMasterController {
  constructor(private readonly catalog: CatalogMasterService) {}

  @Get('brands') @RequirePermissions('catalog.brand.view')
  @ApiOperation({ operationId: 'listAdminBrands' }) @ApiOkResponse({ type: BrandListDto })
  listBrands(): Promise<BrandListDto> { return this.catalog.listBrands(); }

  @Get('brands/active') @RequirePermissions('catalog.brand.view')
  @ApiOperation({ operationId: 'searchActiveAdminBrands' }) @ApiOkResponse({ type: ActiveLookupResponseDto })
  searchBrands(@Query() query: ActiveSearchQueryDto): Promise<ActiveLookupResponseDto> {
    return this.catalog.searchActiveBrands(query);
  }

  @Post('brands') @RequirePermissions('catalog.brand.manage')
  @ApiOperation({ operationId: 'createAdminBrand' }) @ApiCreatedResponse({ type: BrandDto })
  createBrand(@Body() input: CreateBrandDto, @Req() request: AuthenticatedRequest): Promise<BrandDto> {
    return this.catalog.createBrand(input, getMutationContext(request));
  }

  @Get('categories') @RequirePermissions('catalog.category.view')
  @ApiOperation({ operationId: 'listAdminCategories' }) @ApiOkResponse({ type: CategoryListDto })
  listCategories(): Promise<CategoryListDto> { return this.catalog.listCategories(); }

  @Get('categories/active') @RequirePermissions('catalog.category.view')
  @ApiOperation({ operationId: 'searchActiveAdminCategories' }) @ApiOkResponse({ type: ActiveLookupResponseDto })
  searchCategories(@Query() query: ActiveSearchQueryDto): Promise<ActiveLookupResponseDto> {
    return this.catalog.searchActiveCategories(query);
  }

  @Post('categories') @RequirePermissions('catalog.category.manage')
  @ApiOperation({ operationId: 'createAdminCategory' }) @ApiCreatedResponse({ type: CategoryDto })
  createCategory(@Body() input: CreateCategoryDto, @Req() request: AuthenticatedRequest): Promise<CategoryDto> {
    return this.catalog.createCategory(input, getMutationContext(request));
  }
}
