import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

function contextWithUser(role: string | undefined) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => (role ? { user: { sub: 'u1', email: 'a@b.com', role } } : {}),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  it('allows any authenticated user when the route has no @Roles restriction', () => {
    const reflector = { getAllAndOverride: jest.fn(() => undefined) } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(contextWithUser('user'))).toBe(true);
  });

  it('allows an admin through an admin-only route', () => {
    const reflector = { getAllAndOverride: jest.fn(() => ['admin']) } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(contextWithUser('admin'))).toBe(true);
  });

  it('blocks a regular user from an admin-only route', () => {
    const reflector = { getAllAndOverride: jest.fn(() => ['admin']) } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(contextWithUser('user'))).toBe(false);
  });

  it('blocks when there is no authenticated user at all', () => {
    const reflector = { getAllAndOverride: jest.fn(() => ['admin']) } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(contextWithUser(undefined))).toBe(false);
  });
});
