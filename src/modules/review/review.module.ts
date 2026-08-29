import { Module } from '@nestjs/common';
import { AdminReviewController, PublicReviewController } from './review.controller';
import { ReviewService } from './review.service';

@Module({
  controllers: [PublicReviewController, AdminReviewController],
  providers: [ReviewService],
})
export class ReviewModule {}
