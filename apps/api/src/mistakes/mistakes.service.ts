import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMistakeDto } from './dto/create-mistake.dto';
import { UpdateMistakeDto } from './dto/update-mistake.dto';

@Injectable()
export class MistakesService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, dto: CreateMistakeDto) {
    return this.prisma.mistake.create({
      data: {
        userId,
        problemId: dto.problemId ?? null,
        note: dto.note,
        tags: dto.tags ?? [],
      },
    });
  }

  list(userId: string) {
    return this.prisma.mistake.findMany({
      where: { userId },
      include: { problem: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Shared by update() and remove(). Answers two questions at once: does
  // this row exist, and does it belong to the caller? Either "no" comes
  // back as the same NotFoundException — a stranger's ID shouldn't get a
  // different error than a made-up one, or you've just confirmed to them
  // that ID exists and belongs to someone else.
  private async findOwned(userId: string, id: string) {
    const mistake = await this.prisma.mistake.findUnique({ where: { id } });
    if (!mistake || mistake.userId !== userId) {
      throw new NotFoundException('Mistake not found');
    }
    return mistake;
  }

  async update(userId: string, id: string, dto: UpdateMistakeDto) {
    await this.findOwned(userId, id);
    return this.prisma.mistake.update({
      where: { id },
      data: {
        ...(dto.problemId !== undefined && { problemId: dto.problemId }),
        ...(dto.note !== undefined && { note: dto.note }),
        ...(dto.tags !== undefined && { tags: dto.tags }),
      },
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOwned(userId, id);
    await this.prisma.mistake.delete({ where: { id } });
  }
}
