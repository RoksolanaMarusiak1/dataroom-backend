import { Module } from '@nestjs/common';
import { SharingModule } from '../sharing/sharing.module';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { SupabaseStorageService } from './supabase-storage.service';

@Module({
  imports: [SharingModule],
  controllers: [FilesController],
  providers: [FilesService, SupabaseStorageService],
})
export class FilesModule {}
