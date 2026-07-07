import { Module } from '@nestjs/common';
import { MistakesController } from './mistakes.controller';
import { MistakesService } from './mistakes.service';

// No imports array beyond Nest defaults — PrismaModule is @Global (see
// how platforms.module.ts never imports it either), so PrismaService is
// injectable here without re-declaring it.
@Module({
  controllers: [MistakesController],
  providers: [MistakesService],
})
export class MistakesModule {}
