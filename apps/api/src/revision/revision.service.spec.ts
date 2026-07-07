import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RevisionService } from './revision.service';
import { PrismaService } from '../prisma/prisma.service';

describe('RevisionService', () => {
  let service: RevisionService;
  let prisma: { revisionItem: Record<string, jest.Mock> };

  beforeEach(async () => {
    prisma = {
      revisionItem: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [RevisionService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(RevisionService);
  });

  describe('create', () => {
    it('seeds a next-day nextReviewAt so a brand-new item is immediately due', async () => {
      prisma.revisionItem.create.mockResolvedValue({ id: 'r1' });

      await service.create('u1', { problemName: 'Two Arrays' });

      const call = prisma.revisionItem.create.mock.calls[0][0];
      expect(call.data.userId).toBe('u1');
      expect(call.data.problemName).toBe('Two Arrays');
      expect(call.data.problemId).toBeNull();
      expect(call.data.nextReviewAt).toBeInstanceOf(Date);
    });
  });

  describe('list', () => {
    it('scopes to the calling user and sorts by nextReviewAt ascending', async () => {
      prisma.revisionItem.findMany.mockResolvedValue([]);

      await service.list('u1');

      expect(prisma.revisionItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u1' }, orderBy: { nextReviewAt: 'asc' } }),
      );
    });
  });

  describe('ownership enforcement', () => {
    it('update() throws NotFoundException for an item owned by someone else', async () => {
      prisma.revisionItem.findUnique.mockResolvedValue({ id: 'r1', userId: 'someone-else' });

      await expect(service.update('u1', 'r1', { problemName: 'x' })).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.revisionItem.update).not.toHaveBeenCalled();
    });
  });

  describe('update — plain edit (no grade, no raw SM-2 fields)', () => {
    it('does not touch any SM-2 field', async () => {
      prisma.revisionItem.findUnique.mockResolvedValue({
        id: 'r1',
        userId: 'u1',
        sm2Repetition: 2,
        sm2EaseFactor: 2.6,
        sm2IntervalDays: 6,
      });
      prisma.revisionItem.update.mockResolvedValue({ id: 'r1' });

      await service.update('u1', 'r1', { selfHint: 'watch the loop bound' });

      expect(prisma.revisionItem.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { selfHint: 'watch the loop bound' },
      });
    });

    it('allows editing problemName and selfHint together', async () => {
      prisma.revisionItem.findUnique.mockResolvedValue({
        id: 'r1',
        userId: 'u1',
        sm2Repetition: 0,
        sm2EaseFactor: 2.5,
        sm2IntervalDays: 1,
      });
      prisma.revisionItem.update.mockResolvedValue({ id: 'r1' });

      await service.update('u1', 'r1', { problemName: 'Renamed Problem', selfHint: 'new hint' });

      expect(prisma.revisionItem.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { problemName: 'Renamed Problem', selfHint: 'new hint' },
      });
    });
  });

  describe('update — completing a review (grade present)', () => {
    it("recalculates SM-2 fields from the row's own stored state, never from client input", async () => {
      prisma.revisionItem.findUnique.mockResolvedValue({
        id: 'r1',
        userId: 'u1',
        sm2Repetition: 1,
        sm2EaseFactor: 2.6,
        sm2IntervalDays: 1,
      });
      prisma.revisionItem.update.mockResolvedValue({ id: 'r1' });

      await service.update('u1', 'r1', { grade: 5 });

      const call = prisma.revisionItem.update.mock.calls[0][0];
      expect(call.data.sm2Repetition).toBe(2);
      expect(call.data.sm2IntervalDays).toBe(6);
      expect(call.data.sm2EaseFactor).toBe(2.7);
      expect(call.data.nextReviewAt).toBeInstanceOf(Date);
    });

    it('allows grade and a metadata edit in the same request', async () => {
      prisma.revisionItem.findUnique.mockResolvedValue({
        id: 'r1',
        userId: 'u1',
        sm2Repetition: 0,
        sm2EaseFactor: 2.5,
        sm2IntervalDays: 1,
      });
      prisma.revisionItem.update.mockResolvedValue({ id: 'r1' });

      await service.update('u1', 'r1', { grade: 2, selfHint: 'missed the edge case again' });

      const call = prisma.revisionItem.update.mock.calls[0][0];
      expect(call.data.selfHint).toBe('missed the edge case again');
      expect(call.data.sm2Repetition).toBe(0); // grade 2 = failed recall
      expect(call.data.sm2IntervalDays).toBe(1);
    });
  });

  describe('update — undoing a review (raw SM-2 restore fields present)', () => {
    it('writes the raw SM-2 fields back verbatim, bypassing calculateSm2 entirely', async () => {
      prisma.revisionItem.findUnique.mockResolvedValue({
        id: 'r1',
        userId: 'u1',
        sm2Repetition: 2, // post-review state, about to be undone
        sm2EaseFactor: 2.7,
        sm2IntervalDays: 6,
      });
      prisma.revisionItem.update.mockResolvedValue({ id: 'r1' });

      await service.update('u1', 'r1', {
        sm2Repetition: 1,
        sm2EaseFactor: 2.6,
        sm2IntervalDays: 1,
        nextReviewAt: '2026-07-05T12:00:00.000Z',
      });

      expect(prisma.revisionItem.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: {
          sm2Repetition: 1,
          sm2EaseFactor: 2.6,
          sm2IntervalDays: 1,
          nextReviewAt: new Date('2026-07-05T12:00:00.000Z'),
        },
      });
    });

    it('rejects a partial raw SM-2 patch (all four fields must travel together)', async () => {
      prisma.revisionItem.findUnique.mockResolvedValue({ id: 'r1', userId: 'u1' });

      await expect(
        service.update('u1', 'r1', { sm2Repetition: 1, sm2EaseFactor: 2.6 }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.revisionItem.update).not.toHaveBeenCalled();
    });

    it('rejects grade and a raw SM-2 patch in the same request', async () => {
      prisma.revisionItem.findUnique.mockResolvedValue({ id: 'r1', userId: 'u1' });

      await expect(
        service.update('u1', 'r1', {
          grade: 4,
          sm2Repetition: 1,
          sm2EaseFactor: 2.6,
          sm2IntervalDays: 1,
          nextReviewAt: '2026-07-05T12:00:00.000Z',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.revisionItem.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when the row does not exist', async () => {
      prisma.revisionItem.findUnique.mockResolvedValue(null);

      await expect(service.remove('u1', 'missing')).rejects.toThrow(NotFoundException);
      expect(prisma.revisionItem.delete).not.toHaveBeenCalled();
    });

    it('deletes regardless of status — a done item can still be deleted', async () => {
      prisma.revisionItem.findUnique.mockResolvedValue({ id: 'r1', userId: 'u1', status: 'done' });
      prisma.revisionItem.delete.mockResolvedValue({});

      await service.remove('u1', 'r1');

      expect(prisma.revisionItem.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
    });
  });
});
