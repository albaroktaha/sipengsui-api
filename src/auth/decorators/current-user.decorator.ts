import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: string;
  roles: string[];
  permissions: string[];
}

/**
 * Meng-extract user dari request (set oleh JwtAuthGuard).
 * Contoh: @CurrentUser() user: AuthenticatedUser
 *         @CurrentUser('email') email: string
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser;
    return data ? user?.[data] : user;
  },
);
