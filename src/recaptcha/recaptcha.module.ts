import { Global, Module } from '@nestjs/common';
import { ReCaptchaService } from './recaptcha.service';

@Global()
@Module({
  providers: [ReCaptchaService],
  exports: [ReCaptchaService],
})
export class ReCaptchaModule {}
