import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuditModule } from '../audit/audit.module';
import { AuthController, StorefrontAuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthTokenTransportService } from './auth-token-transport.service';

@Module({
  imports: [
    AuditModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('app.jwt.accessSecret'),
        signOptions: { algorithm: 'HS256' },
      }),
    }),
  ],
  controllers: [AuthController, StorefrontAuthController],
  providers: [AuthService, AuthTokenTransportService],
  exports: [AuthService],
})
export class AuthModule {}
