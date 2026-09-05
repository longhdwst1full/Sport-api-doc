import { Body, Controller, Delete, Get, HttpCode, Param, Patch } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../common/exceptions/error-response.dto';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import {
  DeleteReviewDto,
  ModerateReviewDto,
  ProductReviewDto,
  ProductReviewListDto,
} from './review.dto';
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
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiForbiddenResponse({ type: ErrorResponseDto })
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

  @Delete(':id')
  @HttpCode(200)
  @RequirePermissions('review.moderate')
  @ApiOperation({
    operationId: 'deleteAdminReview',
    summary: 'Logically delete a review by hiding it from the storefront',
  })
  @ApiOkResponse({ type: ProductReviewDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  deleteAdminReview(
    @Param('id') id: string,
    @Body() input: DeleteReviewDto,
  ): ProductReviewDto {
    return this.reviews.archive(id, input);
  }
}
