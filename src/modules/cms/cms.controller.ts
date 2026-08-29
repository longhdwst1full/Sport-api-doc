import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermissions } from '../../platform/auth/require-permissions.decorator';
import { ErrorResponseDto } from '../../platform/http/error-response.dto';
import { CmsService } from './cms.service';
import { ContentPostDto, ContentPostListDto, CreateContentPostDto } from './cms.dto';

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
@Controller('admin/content/posts')
export class AdminContentController {
  constructor(private readonly cms: CmsService) {}

  @Get()
  @RequirePermissions('content.post.view')
  @ApiOperation({ operationId: 'listAdminPosts', summary: 'List posts for administration' })
  @ApiOkResponse({ type: ContentPostListDto })
  listAdminPosts(): ContentPostListDto {
    return this.cms.listPublished();
  }

  @Post()
  @RequirePermissions('content.post.manage')
  @ApiOperation({ operationId: 'createAdminPost', summary: 'Create and publish a content post' })
  @ApiCreatedResponse({ type: ContentPostDto })
  createAdminPost(@Body() input: CreateContentPostDto): ContentPostDto {
    return this.cms.create(input);
  }
}
