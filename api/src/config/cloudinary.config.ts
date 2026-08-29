import { registerAs } from '@nestjs/config';

export const CLOUDINARY_DEFAULT_FOLDER = 'sport-sys/sport';
export const CLOUDINARY_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const CLOUDINARY_ALLOWED_IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'webp', 'avif'] as const;

export default registerAs('cloudinary', () => ({
  cloudName: process.env.CLOUDINARY_CLOUD_NAME,
  apiKey: process.env.CLOUDINARY_API_KEY,
  apiSecret: process.env.CLOUDINARY_API_SECRET,
  folder: process.env.CLOUDINARY_FOLDER ?? CLOUDINARY_DEFAULT_FOLDER,
  maxImageBytes: CLOUDINARY_MAX_IMAGE_BYTES,
  allowedImageFormats: [...CLOUDINARY_ALLOWED_IMAGE_FORMATS],
}));
