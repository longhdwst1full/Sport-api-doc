import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ModerateReviewDto, ProductReviewDto, ProductReviewListDto } from './review.dto';
import { ReviewService } from './review.service';

@ApiTags('Storefront Reviews')
@Controller('catalog/products/:slug/reviews')
export class PublicReviewController {
  constructor(private readonly reviews: ReviewService) {}

  @Get()
  @ApiOperation({ operationId: 'listProductReviews', summary: 'List approved product reviews' })
  @ApiOkResponse({ type: ProductReviewListDto })
  listProductReviews(@Param('slug') slug: string): ProductReviewListDto {
    return this.reviews.listApproved(slug);
  }
}

@ApiTags('Admin Reviews')
@ApiBearerAuth()
@Controller('admin/reviews')
export class AdminReviewController {
  constructor(private readonly reviews: ReviewService) {}

  @Get()
  @RequirePermissions('review.moderate')
  @ApiOperation({ operationId: 'listAdminReviews', summary: 'List reviews for moderation' })
  @ApiOkResponse({ type: ProductReviewListDto })
  listAdminReviews(): ProductReviewListDto {
    return this.reviews.listAdmin();
  }

  @Patch(':id/moderation')
  @RequirePermissions('review.moderate')
  @ApiOperation({ operationId: 'moderateAdminReview', summary: 'Approve or reject a review' })
  @ApiOkResponse({ type: ProductReviewDto })
  moderateAdminReview(@Param('id') id: string, @Body() input: ModerateReviewDto): ProductReviewDto {
    return this.reviews.moderate(id, input);
  }
}
