import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole, AccessTokenPayload } from '@uphelper/shared-types';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true; // route has no @Roles(...) restriction
    }
    const request = context.switchToHttp().getRequest();
    const user = request.user as AccessTokenPayload | undefined;
    return !!user && requiredRoles.includes(user.role);
  }
}
