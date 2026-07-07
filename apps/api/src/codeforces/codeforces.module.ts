import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { CodeforcesClient } from './codeforces-client.service';

@Module({
  imports: [HttpModule],
  providers: [CodeforcesClient],
  exports: [CodeforcesClient],
})
export class CodeforcesModule {}
