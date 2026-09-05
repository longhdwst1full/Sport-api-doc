import { sanitizedEnvironment } from './codex-process.runner';

describe('sanitizedEnvironment', () => {
  it('keeps runtime variables but removes credentials from the Codex child process', () => {
    const environment = sanitizedEnvironment({
      PATH: '/usr/bin',
      HOME: '/home/developer',
      NODE_ENV: 'development',
      TELEGRAM_BOT_TOKEN: 'secret',
      DATABASE_URL: 'postgresql://secret',
      DIRECT_URL: 'postgresql://secret',
      CLOUDINARY_URL: 'cloudinary://secret',
      THIRD_PARTY_API_KEY: 'secret',
    });

    expect(environment).toEqual({
      PATH: '/usr/bin',
      HOME: '/home/developer',
      NODE_ENV: 'development',
    });
  });
});
