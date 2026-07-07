import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PlatformsModule } from '../platforms/platforms.module';
import { VideosModule } from '../videos/videos.module';
import { YoutubeModule } from '../youtube/youtube.module';


@Module({
  imports: [PlatformsModule, VideosModule, YoutubeModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
