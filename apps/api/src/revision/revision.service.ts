import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { calculateSm2 } from './sm2.util';
import { CreateRevisionItemDto } from './dto/create-revision-item.dto';
import { UpdateRevisionItemDto } from './dto/update-revision-item.dto';

const RAW_SM2_FIELDS = ['sm2Repetition', 'sm2EaseFactor', 'sm2IntervalDays', 'nextReviewAt'] as const;

@Injectable()
export class RevisionService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, dto: CreateRevisionItemDto) {
    return this.prisma.revisionItem.create({
      data: {
        userId,
        problemId: dto.problemId ?? null,
        problemName: dto.problemName,
        selfHint: dto.selfHint ?? null,
        reminderAt: dto.reminderAt ? new Date(dto.reminderAt) : null,
        // sm2Repetition/sm2EaseFactor/sm2IntervalDays use the schema's own
        // defaults (0 / 2.5 / 1) — nothing to set here. nextReviewAt is
        // seeded to "tomorrow" so a brand-new item shows up in a due list
        // right away instead of never, until the user completes a first
        // real review and calculateSm2 takes over.
        nextReviewAt: addDays(new Date(), 1),
      },
    });
  }

  list(userId: string) {
    return this.prisma.revisionItem.findMany({
      where: { userId },
      include: { problem: true },
      orderBy: { nextReviewAt: 'asc' },
    });
  }

  // Same shared ownership-check pattern as MistakesService: one lookup
  // answers "does it exist" and "is it mine," collapsed into a single
  // NotFoundException either way.
  private async findOwned(userId: string, id: string) {
    const item = await this.prisma.revisionItem.findUnique({ where: { id } });
    if (!item || item.userId !== userId) {
      throw new NotFoundException('Revision item not found');
    }
    return item;
  }

  async update(userId: string, id: string, dto: UpdateRevisionItemDto) {
    const existing = await this.findOwned(userId, id);

    const hasGrade = dto.grade !== undefined;
    const presentRawFields = RAW_SM2_FIELDS.filter((f) => dto[f] !== undefined);
    const hasRawSm2 = presentRawFields.length > 0;

    if (hasGrade && hasRawSm2) {
      throw new BadRequestException(
        'Provide either grade (to complete a review) or a full raw SM-2 restore patch (to undo one) — not both in the same request',
      );
    }
    if (hasRawSm2 && presentRawFields.length !== RAW_SM2_FIELDS.length) {
      throw new BadRequestException(
        `Restoring SM-2 state requires all of ${RAW_SM2_FIELDS.join(', ')} together, not a partial set`,
      );
    }

    // grade present => "I just reviewed this item" — recalculate from the
    // row's *own stored* SM-2 state, never from anything the client
    // sends, so a buggy or malicious client can't desynchronize the
    // schedule by passing its own repetition/ease/interval.
    //
    // raw SM-2 fields present (no grade) => "undo my last review" — the
    // client is handing back an exact prior state it already had (it read
    // it from this same API right before the review it's now undoing), so
    // this branch writes it back verbatim instead of running it through
    // calculateSm2 again.
    const sm2Patch = hasGrade
      ? calculateSm2(
          {
            repetition: existing.sm2Repetition,
            easeFactor: existing.sm2EaseFactor,
            intervalDays: existing.sm2IntervalDays,
          },
          dto.grade!,
        )
      : hasRawSm2
        ? {
            repetition: dto.sm2Repetition!,
            easeFactor: dto.sm2EaseFactor!,
            intervalDays: dto.sm2IntervalDays!,
            nextReviewAt: new Date(dto.nextReviewAt!),
          }
        : null;

    return this.prisma.revisionItem.update({
      where: { id },
      data: {
        ...(dto.problemName !== undefined && { problemName: dto.problemName }),
        ...(dto.selfHint !== undefined && { selfHint: dto.selfHint }),
        ...(dto.reminderAt !== undefined && { reminderAt: new Date(dto.reminderAt) }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(sm2Patch && {
          sm2Repetition: sm2Patch.repetition,
          sm2EaseFactor: sm2Patch.easeFactor,
          sm2IntervalDays: sm2Patch.intervalDays,
          nextReviewAt: sm2Patch.nextReviewAt,
        }),
      },
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOwned(userId, id);
    await this.prisma.revisionItem.delete({ where: { id } });
  }
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
