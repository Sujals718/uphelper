import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { YoutubeClient } from './youtube-client.service';
import { YoutubeQuotaService } from './youtube-quota.service';

@Module({
  imports: [HttpModule],
  providers: [YoutubeClient, YoutubeQuotaService],
  exports: [YoutubeClient, YoutubeQuotaService],
})
export class YoutubeModule {}
