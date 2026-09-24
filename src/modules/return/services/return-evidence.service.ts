import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CLOUDINARY_DEFAULT_FOLDER } from '../../../config/cloudinary.config';
import { ObjectStorageClient } from '../../../integrations/object-storage/object-storage.client';
import type { CreateMediaUploadDto, SignedMediaUploadDto } from '../../media/media.dto';
import type { ReturnEvidenceInputDto } from '../dto/return.dto';
import { RETURN_ERROR_CODE, RETURN_EVIDENCE } from '../return.constants';

/**
 * Một ảnh đã xác minh, đúng hình dạng lưu trong `return_requests.evidence_images` (ảnh khách chụp
 * món hàng) và `refunds.proof_images` (ảnh chứng từ chuyển/trả tiền, để đối chiếu về sau).
 */
export interface StoredReturnEvidence {
  publicId: string;
  url: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  sizeBytes: number;
  uploaderType: 'CUSTOMER' | 'USER';
  uploadedBy: string;
}

/** Ảnh khách/nhân viên chụp món hàng thuộc thư mục của ĐƠN; chứng từ hoàn tiền thuộc thư mục của PHIẾU. */
export type EvidenceScope = { kind: 'ORDER'; orderId: bigint } | { kind: 'REFUND_PROOF'; returnId: bigint };

/**
 * Ảnh minh chứng của phiếu trả: cấp chữ ký upload và xác minh ảnh trước khi gắn vào phiếu.
 *
 * Luồng giống bằng chứng chuyển khoản: trình duyệt tải ảnh THẲNG lên Cloudinary bằng chữ ký ngắn hạn
 * (file không đi qua API), rồi gửi `publicId/version/signature` kèm lệnh tạo phiếu để server kiểm.
 */
@Injectable()
export class ReturnEvidenceService {
  constructor(
    private readonly storage: ObjectStorageClient,
    private readonly config: ConfigService,
  ) {}

  createUpload(scope: EvidenceScope, input: CreateMediaUploadDto): Promise<SignedMediaUploadDto> {
    return this.storage.createSignedImageUpload({
      publicId: randomUUID(),
      folder: this.folderFor(scope),
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      expiresInSeconds: RETURN_EVIDENCE.UPLOAD_TTL_SECONDS,
    });
  }

  /**
   * PROVIDER: gọi Cloudinary NGOÀI transaction — một provider chậm không được giữ khoá đơn hàng.
   *
   * SECURITY: kiểm thư mục TRƯỚC khi gọi provider. Cloudinary client chỉ kiểm thư mục gốc của shop,
   * nên không có bước này thì khách gắn được ảnh sản phẩm hoặc ảnh phiếu của đơn khác vào phiếu mình.
   */
  async verify(
    scope: EvidenceScope,
    inputs: readonly ReturnEvidenceInputDto[],
    uploader: { type: 'CUSTOMER' | 'USER'; userId: string },
  ): Promise<StoredReturnEvidence[]> {
    const prefix = `${this.folderFor(scope)}/`;
    const seen = new Set<string>();
    for (const input of inputs) {
      if (!input.publicId.startsWith(prefix) || seen.has(input.publicId)) {
        throw new BadRequestException({
          code: RETURN_ERROR_CODE.EVIDENCE_INVALID,
          message: 'Ảnh không hợp lệ hoặc không thuộc đúng phiếu/đơn này. Vui lòng tải ảnh lên lại.',
        });
      }
      seen.add(input.publicId);
    }
    const verified = await Promise.all(
      inputs.map((input) =>
        this.storage.verifyImageUpload({
          publicId: input.publicId,
          version: input.providerVersion,
          signature: input.providerSignature,
        }),
      ),
    );
    return verified.map((asset) => ({
      publicId: asset.publicId,
      url: asset.secureUrl,
      thumbnailUrl: asset.thumbnailUrl,
      width: asset.width,
      height: asset.height,
      sizeBytes: asset.sizeBytes,
      uploaderType: uploader.type,
      uploadedBy: uploader.userId,
    }));
  }

  private folderFor(scope: EvidenceScope): string {
    const root = this.config.get<string>('cloudinary.folder') ?? CLOUDINARY_DEFAULT_FOLDER;
    return scope.kind === 'ORDER'
      ? `${root}/${RETURN_EVIDENCE.FOLDER}/o${scope.orderId}`
      : `${root}/${RETURN_EVIDENCE.REFUND_PROOF_FOLDER}/r${scope.returnId}`;
  }
}
