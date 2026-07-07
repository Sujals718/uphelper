import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MistakesService } from './mistakes.service';
import { PrismaService } from '../prisma/prisma.service';

describe('MistakesService', () => {
  let service: MistakesService;
  let prisma: { mistake: Record<string, jest.Mock> };

  beforeEach(async () => {
    prisma = {
      mistake: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [MistakesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(MistakesService);
  });

  describe('create', () => {
    it('defaults tags to an empty array and problemId to null when omitted', async () => {
      prisma.mistake.create.mockResolvedValue({ id: 'm1' });

      await service.create('u1', { note: 'off by one' });

      expect(prisma.mistake.create).toHaveBeenCalledWith({
        data: { userId: 'u1', problemId: null, note: 'off by one', tags: [] },
      });
    });

    it('passes through problemId and tags when provided', async () => {
      prisma.mistake.create.mockResolvedValue({ id: 'm1' });

      await service.create('u1', { note: 'TLE', problemId: 'p1', tags: ['tle', 'brute-force'] });

      expect(prisma.mistake.create).toHaveBeenCalledWith({
        data: { userId: 'u1', problemId: 'p1', note: 'TLE', tags: ['tle', 'brute-force'] },
      });
    });
  });

  describe('list', () => {
    it('scopes to the calling user only', async () => {
      prisma.mistake.findMany.mockResolvedValue([]);

      await service.list('u1');

      expect(prisma.mistake.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u1' } }),
      );
    });
  });

  describe('ownership enforcement', () => {
    it('update() throws NotFoundException for a mistake owned by someone else', async () => {
      prisma.mistake.findUnique.mockResolvedValue({ id: 'm1', userId: 'someone-else' });

      await expect(service.update('u1', 'm1', { note: 'x' })).rejects.toThrow(NotFoundException);
      expect(prisma.mistake.update).not.toHaveBeenCalled();
    });

    it('remove() throws NotFoundException when the row does not exist at all', async () => {
      prisma.mistake.findUnique.mockResolvedValue(null);

      await expect(service.remove('u1', 'missing')).rejects.toThrow(NotFoundException);
      expect(prisma.mistake.delete).not.toHaveBeenCalled();
    });

    it('update() proceeds and only writes the fields actually present in the DTO', async () => {
      prisma.mistake.findUnique.mockResolvedValue({ id: 'm1', userId: 'u1' });
      prisma.mistake.update.mockResolvedValue({ id: 'm1' });

      await service.update('u1', 'm1', { note: 'fixed note' });

      expect(prisma.mistake.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { note: 'fixed note' },
      });
    });
  });
});
