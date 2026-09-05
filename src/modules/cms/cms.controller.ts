import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
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
} from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ErrorResponseDto } from '../../common/exceptions/error-response.dto';
import { CmsService } from './cms.service';
import {
  ArchiveContentPostDto,
  ContentPostDto,
  ContentPostListDto,
  CreateContentPostDto,
} from './cms.dto';

@ApiTags('Storefront Content')
@Controller('content/posts')
export class PublicContentController {
  constructor(private readonly cms: CmsService) {}

  @Get()
  @ApiOperation({ operationId: 'listPublishedPosts', summary: 'List published content posts' })
  @ApiOkResponse({ type: ContentPostListDto })
  listPublishedPosts(): ContentPostListDto {
    return this.cms.listPublished();
  }

  @Get(':slug')
  @ApiOperation({ operationId: 'getPublishedPost', summary: 'Get a published post by slug' })
  @ApiOkResponse({ type: ContentPostDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  getPublishedPost(@Param('slug') slug: string): ContentPostDto {
    return this.cms.getBySlug(slug);
  }
}

@ApiTags('Admin Content')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiForbiddenResponse({ type: ErrorResponseDto })
@Controller('admin/content/posts')
export class AdminContentController {
  constructor(private readonly cms: CmsService) {}

  @Get()
  @RequirePermissions('content.post.view')
  @ApiOperation({ operationId: 'listAdminPosts', summary: 'List posts for administration' })
  @ApiOkResponse({ type: ContentPostListDto })
  listAdminPosts(): ContentPostListDto {
    return this.cms.listAdmin();
  }

  @Post()
  @RequirePermissions('content.post.manage')
  @ApiOperation({ operationId: 'createAdminPost', summary: 'Create and publish a content post' })
  @ApiCreatedResponse({ type: ContentPostDto })
  createAdminPost(@Body() input: CreateContentPostDto): ContentPostDto {
    return this.cms.create(input);
  }

  @Delete(':id')
  @HttpCode(200)
  @RequirePermissions('content.post.manage')
  @ApiOperation({
    operationId: 'deleteAdminPost',
    summary: 'Logically delete a content post by archiving it',
  })
  @ApiOkResponse({ type: ContentPostDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  deleteAdminPost(
    @Param('id') id: string,
    @Body() input: ArchiveContentPostDto,
  ): ContentPostDto {
    return this.cms.archive(id, input);
  }
}
