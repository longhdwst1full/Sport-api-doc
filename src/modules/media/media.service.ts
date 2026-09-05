import { ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { toDatabaseId, toEntityId } from '../../common/identifiers/entity-id';
import { MutationContext } from '../../common/request/request-context';
import { PrismaService } from '../../database/prisma.service';
import { ObjectStorageClient } from '../../integrations/object-storage/object-storage.client';
import { AuditWriter } from '../audit/audit.writer';
import {
  CreateMediaUploadDto,
  FinalizeMediaUploadDto,
  MediaAssetDto,
  SignedMediaUploadDto,
} from './media.dto';

@Injectable()
export class MediaService {
  constructor(
    private readonly objectStorage: ObjectStorageClient,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
  ) {}

  createUpload(input: CreateMediaUploadDto): Promise<SignedMediaUploadDto> {
    const folder = this.config.get<string>('cloudinary.folder') ?? 'sport-sys/sport';
    return this.objectStorage.createSignedImageUpload({
      publicId: randomUUID(),
      folder,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      expiresInSeconds: 60 * 60,
    });
  }

  async finalizeUpload(
    input: FinalizeMediaUploadDto,
    context: MutationContext,
  ): Promise<MediaAssetDto> {
    const verified = await this.objectStorage.verifyImageUpload(input);
    const asset = await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.mediaAsset.findUnique({
        where: {
          provider_providerAssetId: {
            provider: verified.provider,
            providerAssetId: verified.providerAssetId,
          },
        },
      });
      if (existing) {
        if (existing.status !== 'ACTIVE') {
          throw new ConflictException('Media asset exists but is inactive');
        }
        return existing;
      }

      const created = await transaction.mediaAsset.create({
        data: {
          provider: verified.provider,
          providerAssetId: verified.providerAssetId,
          publicId: verified.publicId,
          resourceType: 'IMAGE',
          secureUrl: verified.secureUrl,
          thumbnailUrl: verified.thumbnailUrl,
          format: verified.format,
          mimeType: verified.mimeType,
          width: verified.width,
          height: verified.height,
          sizeBytes: BigInt(verified.sizeBytes),
          folder: verified.publicId.split('/').slice(0, -1).join('/') || null,
          metadataJson: { providerVersion: verified.version },
          status: 'ACTIVE',
          uploadedBy: toDatabaseId(context.actorUserId),
        },
      });
      await this.audit.write(
        {
          requestId: context.requestId,
          sequenceNo: 1,
          actorType: 'USER',
          actorUserId: context.actorUserId,
          action: 'media.asset.finalize',
          entityType: 'MEDIA_ASSET',
          entityId: toEntityId(created.id),
          after: {
            provider: created.provider,
            providerAssetId: created.providerAssetId,
            publicId: created.publicId,
            mimeType: created.mimeType,
            sizeBytes: verified.sizeBytes,
          } satisfies Prisma.InputJsonObject,
        },
        transaction,
      );
      return created;
    }).catch(async (error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const winner = await this.prisma.mediaAsset.findUniqueOrThrow({
          where: {
            provider_providerAssetId: {
              provider: verified.provider,
              providerAssetId: verified.providerAssetId,
            },
          },
        });
        if (winner.status !== 'ACTIVE') {
          throw new ConflictException('Media asset exists but is inactive');
        }
        return winner;
      }
      throw error;
    });

    return {
      id: toEntityId(asset.id),
      provider: 'CLOUDINARY',
      providerAssetId: asset.providerAssetId,
      publicId: asset.publicId,
      secureUrl: asset.secureUrl,
      thumbnailUrl: asset.thumbnailUrl ?? asset.secureUrl,
      mimeType: asset.mimeType ?? verified.mimeType,
      width: asset.width ?? verified.width,
      height: asset.height ?? verified.height,
      sizeBytes: Number(asset.sizeBytes ?? verified.sizeBytes),
      format: asset.format ?? verified.format,
      providerVersion: verified.version,
      status: 'ACTIVE',
    };
  }
}
