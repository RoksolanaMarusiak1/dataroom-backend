import { Module } from '@nestjs/common';
import { SharingModule } from '../sharing/sharing.module';
import { FoldersController } from './folders.controller';
import { FoldersService } from './folders.service';

@Module({
  imports: [SharingModule],
  controllers: [FoldersController],
  providers: [FoldersService],
})
export class FoldersModule {}
