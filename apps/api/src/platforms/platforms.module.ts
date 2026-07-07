import { Module } from '@nestjs/common';
import { CodeforcesModule } from '../codeforces/codeforces.module';
import { PlatformsController } from './platforms.controller';
import { PlatformsService } from './platforms.service';

@Module({
  imports: [CodeforcesModule],
  controllers: [PlatformsController],
  providers: [PlatformsService],
  exports: [PlatformsService],
})
export class PlatformsModule {}
