import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { GeminiClient } from './gemini-client.service';

@Module({
  imports: [HttpModule],
  providers: [GeminiClient],
  exports: [GeminiClient],
})
export class GeminiModule {}
