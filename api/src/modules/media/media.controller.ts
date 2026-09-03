import { Body, Controller, Post, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ErrorResponseDto } from '../../common/exceptions/error-response.dto';
import { AuthenticatedRequest, getMutationContext } from '../../common/request/request-context';
import {
  CreateMediaUploadDto,
  FinalizeMediaUploadDto,
  MediaAssetDto,
  SignedMediaUploadDto,
} from './media.dto';
import { MediaService } from './media.service';

@ApiTags('Admin Media')
@ApiBearerAuth()
@Controller('admin/media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('uploads/signature')
  @RequirePermissions('media.asset.upload')
  @ApiOperation({
    operationId: 'createAdminMediaUpload',
    summary: 'Create a short-lived signed Cloudinary image upload',
  })
  @ApiCreatedResponse({ type: SignedMediaUploadDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiServiceUnavailableResponse({
    type: ErrorResponseDto,
    description: 'Cloudinary is not configured',
  })
  createUpload(@Body() input: CreateMediaUploadDto): Promise<SignedMediaUploadDto> {
    return this.media.createUpload(input);
  }

  @Post('uploads/finalize')
  @RequirePermissions('media.asset.upload')
  @ApiOperation({
    operationId: 'finalizeAdminMediaUpload',
    summary: 'Verify a direct Cloudinary upload and return trusted metadata',
  })
  @ApiCreatedResponse({ type: MediaAssetDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'Verified asset exists but is inactive' })
  @ApiServiceUnavailableResponse({
    type: ErrorResponseDto,
    description: 'Cloudinary is not configured',
  })
  finalizeUpload(
    @Body() input: FinalizeMediaUploadDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<MediaAssetDto> {
    return this.media.finalizeUpload(input, getMutationContext(request));
  }
}
