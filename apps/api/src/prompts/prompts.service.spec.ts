import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PromptsService } from './prompts.service';
import { PrismaService } from '../prisma/prisma.service';
import { HINT_TEMPLATE_V1, DEBUG_TEMPLATE_V1 } from './templates.constant';

describe('PromptsService', () => {
  let service: PromptsService;
  let prisma: { promptTemplate: Record<string, jest.Mock> };

  beforeEach(async () => {
    prisma = {
      promptTemplate: {
        findFirst: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [PromptsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(PromptsService);
  });

  describe('getHintPrompt', () => {
    it('fetches the newest active hint template and fills it, defaulting a missing problem statement to blank', async () => {
      prisma.promptTemplate.findFirst.mockResolvedValue({
        type: 'hint',
        version: 1,
        body: HINT_TEMPLATE_V1,
        isActive: true,
      });

      const result = await service.getHintPrompt({
        problemName: 'Two Arrays',
        platform: 'Codeforces',
        contestName: 'Codeforces Round 1002',
      });

      expect(prisma.promptTemplate.findFirst).toHaveBeenCalledWith({
        where: { type: 'hint', isActive: true },
        orderBy: { version: 'desc' },
      });
      expect(result.type).toBe('hint');
      expect(result.version).toBe(1);
      expect(result.filledText).toContain(
        'I am stuck on: Two Arrays (Codeforces, contest: Codeforces Round 1002).',
      );
      expect(result.filledText).toContain('Problem statement (if provided): \n');
    });

    it('throws NotFoundException when no active hint template exists (unseeded DB)', async () => {
      prisma.promptTemplate.findFirst.mockResolvedValue(null);

      await expect(
        service.getHintPrompt({ problemName: 'X', platform: 'Codeforces', contestName: 'Y' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getDebugPrompt', () => {
    it('fetches the newest active debug template and fills it, including the user code block', async () => {
      prisma.promptTemplate.findFirst.mockResolvedValue({
        type: 'debug',
        version: 1,
        body: DEBUG_TEMPLATE_V1,
        isActive: true,
      });

      const result = await service.getDebugPrompt({
        problemName: 'Two Arrays',
        platform: 'Codeforces',
        contestName: 'Codeforces Round 1002',
        userCode: 'int x = 0;',
      });

      expect(prisma.promptTemplate.findFirst).toHaveBeenCalledWith({
        where: { type: 'debug', isActive: true },
        orderBy: { version: 'desc' },
      });
      expect(result.type).toBe('debug');
      expect(result.filledText).toContain('My current code:\nint x = 0;');
    });

    it('throws NotFoundException when no active debug template exists', async () => {
      prisma.promptTemplate.findFirst.mockResolvedValue(null);

      await expect(
        service.getDebugPrompt({
          problemName: 'X',
          platform: 'Codeforces',
          contestName: 'Y',
          userCode: 'code',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
