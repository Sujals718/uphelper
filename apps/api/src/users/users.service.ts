import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface GoogleProfileInput {
  googleId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  
  async findOrCreateFromGoogle(profile: GoogleProfileInput): Promise<User> {
    const existing = await this.prisma.user.findUnique({
      where: { googleId: profile.googleId },
    });
    if (existing) {
      return existing;
    }
    return this.prisma.user.create({
      data: {
        googleId: profile.googleId,
        email: profile.email,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
      },
    });
  }

  async setRefreshTokenHash(userId: string, hash: string | null): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: hash },
    });
  }
}
