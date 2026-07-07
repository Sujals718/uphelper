import { Module } from '@nestjs/common';
import { RevisionController } from './revision.controller';
import { RevisionService } from './revision.service';

@Module({
  controllers: [RevisionController],
  providers: [RevisionService],
})
export class RevisionModule {}
