import { registerAs } from '@nestjs/config';

export default registerAs('mailtrap', () => ({
  token: process.env.MAILTRAP_API_TOKEN,
  senderEmail: process.env.MAILTRAP_SENDER_EMAIL,
  senderName: process.env.MAILTRAP_SENDER_NAME ?? 'Bảo An Sport',
  redirectAllTo: process.env.MAILTRAP_REDIRECT_ALL_TO,
}));
