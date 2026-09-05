import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
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
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { ErrorResponseDto } from '../../../common/exceptions/error-response.dto';
import { ParseEntityIdPipe } from '../../../common/identifiers/entity-id';
import { ActiveLookupResponseDto, ActiveSearchQueryDto } from '../../../common/pagination/active-search.dto';
import { AuthenticatedRequest, getMutationContext } from '../../../common/request/request-context';
import {
  BrandDto,
  BrandListDto,
  CategoryDto,
  CategoryListDto,
  ChangeMasterStatusDto,
  CreateBrandDto,
  CreateCategoryDto,
  UpdateBrandDto,
  UpdateCategoryDto,
} from './catalog-master.dto';
import { CatalogMasterService } from './catalog-master.service';

@ApiTags('Admin Catalog')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiForbiddenResponse({ type: ErrorResponseDto })
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

  @Patch('brands/:id')
  @RequirePermissions('catalog.brand.manage')
  @ApiOperation({ operationId: 'updateAdminBrand', summary: 'Update mutable brand fields' })
  @ApiOkResponse({ type: BrandDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  updateBrand(
    @Param('id') id: string,
    @Body() input: UpdateBrandDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<BrandDto> {
    return this.catalog.updateBrand(id, input, getMutationContext(request));
  }

  @Post('brands/:id/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('catalog.brand.manage')
  @ApiOperation({ operationId: 'deactivateAdminBrand', summary: 'Deactivate a brand' })
  @ApiOkResponse({ type: BrandDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  deactivateBrand(
    @Param('id') id: string,
    @Body() input: ChangeMasterStatusDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<BrandDto> {
    return this.catalog.changeBrandStatus(id, 'INACTIVE', input, getMutationContext(request));
  }

  @Delete('brands/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('catalog.brand.manage')
  @ApiOperation({
    operationId: 'deleteAdminBrand',
    summary: 'Logically delete a brand by changing its status to INACTIVE',
  })
  @ApiOkResponse({ type: BrandDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  deleteBrand(
    @Param('id', new ParseEntityIdPipe()) id: string,
    @Body() input: ChangeMasterStatusDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<BrandDto> {
    return this.catalog.changeBrandStatus(id, 'INACTIVE', input, getMutationContext(request));
  }

  @Post('brands/:id/activate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('catalog.brand.manage')
  @ApiOperation({ operationId: 'activateAdminBrand', summary: 'Reactivate a brand' })
  @ApiOkResponse({ type: BrandDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  activateBrand(
    @Param('id') id: string,
    @Body() input: ChangeMasterStatusDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<BrandDto> {
    return this.catalog.changeBrandStatus(id, 'ACTIVE', input, getMutationContext(request));
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

  @Patch('categories/:id')
  @RequirePermissions('catalog.category.manage')
  @ApiOperation({ operationId: 'updateAdminCategory', summary: 'Update mutable category fields' })
  @ApiOkResponse({ type: CategoryDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  updateCategory(
    @Param('id') id: string,
    @Body() input: UpdateCategoryDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<CategoryDto> {
    return this.catalog.updateCategory(id, input, getMutationContext(request));
  }

  @Post('categories/:id/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('catalog.category.manage')
  @ApiOperation({ operationId: 'deactivateAdminCategory', summary: 'Deactivate a leaf category' })
  @ApiOkResponse({ type: CategoryDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  deactivateCategory(
    @Param('id') id: string,
    @Body() input: ChangeMasterStatusDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<CategoryDto> {
    return this.catalog.changeCategoryStatus(id, 'INACTIVE', input, getMutationContext(request));
  }

  @Delete('categories/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('catalog.category.manage')
  @ApiOperation({
    operationId: 'deleteAdminCategory',
    summary: 'Logically delete a leaf category by changing its status to INACTIVE',
  })
  @ApiOkResponse({ type: CategoryDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  deleteCategory(
    @Param('id', new ParseEntityIdPipe()) id: string,
    @Body() input: ChangeMasterStatusDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<CategoryDto> {
    return this.catalog.changeCategoryStatus(id, 'INACTIVE', input, getMutationContext(request));
  }

  @Post('categories/:id/activate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('catalog.category.manage')
  @ApiOperation({ operationId: 'activateAdminCategory', summary: 'Reactivate a category' })
  @ApiOkResponse({ type: CategoryDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  activateCategory(
    @Param('id') id: string,
    @Body() input: ChangeMasterStatusDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<CategoryDto> {
    return this.catalog.changeCategoryStatus(id, 'ACTIVE', input, getMutationContext(request));
  }
}
