import { Module } from '@nestjs/common';
import { SharingController } from './sharing.controller';
import { PublicSharesController } from './public-shares.controller';
import { SharingService } from './sharing.service';

@Module({
  controllers: [SharingController, PublicSharesController],
  providers: [SharingService],
  exports: [SharingService],
})
export class SharingModule {}
