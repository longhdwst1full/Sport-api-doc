import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';
import { CLOUDINARY_MAX_IMAGE_BYTES } from '../../config/cloudinary.config';

export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
] as const;

export class CreateMediaUploadDto {
  @ApiProperty({ example: 'product-front.webp' })
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @ApiProperty({ enum: ALLOWED_IMAGE_MIME_TYPES, example: 'image/webp' })
  @IsIn(ALLOWED_IMAGE_MIME_TYPES)
  contentType: (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

  @ApiProperty({ minimum: 1, maximum: CLOUDINARY_MAX_IMAGE_BYTES, example: 245760 })
  @IsInt()
  @Min(1)
  @Max(CLOUDINARY_MAX_IMAGE_BYTES)
  sizeBytes: number;
}

export class SignedMediaUploadDto {
  @ApiProperty({ enum: ['CLOUDINARY'] }) provider: 'CLOUDINARY';
  @ApiProperty({ format: 'uri' }) uploadUrl: string;
  @ApiProperty() cloudName: string;
  @ApiProperty() apiKey: string;
  @ApiProperty() timestamp: number;
  @ApiProperty() signature: string;
  @ApiProperty() folder: string;
  @ApiProperty() publicId: string;
  @ApiProperty({ type: [String] }) allowedFormats: string[];
  @ApiProperty() maxBytes: number;
  @ApiProperty({ enum: [false] }) overwrite: false;
  @ApiProperty({ enum: [false] }) uniqueFilename: false;
  @ApiProperty({ format: 'date-time' }) expiresAt: string;
}

export class FinalizeMediaUploadDto {
  @ApiProperty({ example: 'sport-sys/sport/8ece7be0-b7da-4ff1-a37e-fdd473b08d5e' })
  @IsString()
  @IsNotEmpty()
  publicId: string;

  @ApiProperty({ example: 1787999000 })
  @IsInt()
  @Min(1)
  version: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  signature: string;
}

export class MediaAssetDto {
  @ApiProperty({ enum: ['CLOUDINARY'] }) provider: 'CLOUDINARY';
  @ApiProperty() providerAssetId: string;
  @ApiProperty() publicId: string;
  @ApiProperty({ format: 'uri' }) secureUrl: string;
  @ApiProperty({ format: 'uri' }) thumbnailUrl: string;
  @ApiProperty({ example: 'image/webp' }) mimeType: string;
  @ApiProperty() width: number;
  @ApiProperty() height: number;
  @ApiProperty() sizeBytes: number;
  @ApiProperty() format: string;
  @ApiProperty() version: number;
}
