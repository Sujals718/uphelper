

import { PrismaClient } from '@prisma/client';
import { HINT_TEMPLATE_V1, DEBUG_TEMPLATE_V1 } from '../src/prompts/templates.constant';

const prisma = new PrismaClient();

async function main() {
  await prisma.promptTemplate.upsert({
    where: { type_version: { type: 'hint', version: 1 } },
    create: { type: 'hint', version: 1, body: HINT_TEMPLATE_V1, isActive: true },
    update: { body: HINT_TEMPLATE_V1 },
  });

  await prisma.promptTemplate.upsert({
    where: { type_version: { type: 'debug', version: 1 } },
    create: { type: 'debug', version: 1, body: DEBUG_TEMPLATE_V1, isActive: true },
    update: { body: DEBUG_TEMPLATE_V1 },
  });

  // eslint-disable-next-line no-console
  console.log('Seeded prompt_templates: hint v1, debug v1 (both active).');
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
