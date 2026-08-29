import { SetMetadata } from '@nestjs/common';

export const AUTHENTICATION_REQUIRED_KEY = 'authentication_required';
export const RequireAuthentication = (): MethodDecorator & ClassDecorator =>
  SetMetadata(AUTHENTICATION_REQUIRED_KEY, true);
