import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  enabled: process.env.DATABASE_ENABLED === 'true',
  url: process.env.DATABASE_URL,
  directUrl: process.env.DIRECT_URL,
}));
