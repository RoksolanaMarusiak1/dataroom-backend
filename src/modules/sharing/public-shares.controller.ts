import { Controller, Get, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SharingService } from './sharing.service';

@ApiTags('public-shares')
@Controller('public/shares')
export class PublicSharesController {
  constructor(private sharingService: SharingService) {}

  @ApiOperation({
    summary:
      'Look up a public share link and return the basic info of the item it points to',
  })
  @ApiResponse({
    status: 200,
    description: 'Share link is valid, returns the item type and basic info',
  })
  @ApiResponse({
    status: 404,
    description: 'Share link not found or the item no longer exists',
  })
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Get(':token')
  getShareInfo(@Param('token') token: string) {
    return this.sharingService.getPublicShareInfo(token);
  }
}
