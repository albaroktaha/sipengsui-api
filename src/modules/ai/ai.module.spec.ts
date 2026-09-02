import { MODULE_METADATA } from '@nestjs/common/constants';
import { ThrottlerModule } from '@nestjs/throttler';
import { AiModule } from './ai.module';

describe('AiModule rate limiting', () => {
  it('does not register a second ThrottlerModule for the global guard', () => {
    const imports = (Reflect.getMetadata(MODULE_METADATA.IMPORTS, AiModule) ??
      []) as unknown[];

    const throttlerImports = imports.filter(
      (entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        'module' in entry &&
        (entry as { module?: unknown }).module === ThrottlerModule,
    );

    expect(throttlerImports).toHaveLength(0);
  });
});
