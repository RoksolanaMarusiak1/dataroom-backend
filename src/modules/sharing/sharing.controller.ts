import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SharingService } from './sharing.service';
import { CreateShareDto } from './dto/create-share.dto';
import { FindSharesDto } from './dto/find-shares.dto';

@ApiTags('sharing')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('shares')
export class SharingController {
  constructor(private sharingService: SharingService) {}

  @ApiOperation({
    summary:
      'Share an item with a specific user (by id or email), or create a public link',
  })
  @ApiResponse({ status: 201, description: 'Share created' })
  @ApiResponse({ status: 403, description: 'Not the owner of this item' })
  @ApiResponse({
    status: 404,
    description: 'Item or user (by email) not found',
  })
  @Post()
  create(@Req() req, @Body() dto: CreateShareDto) {
    return this.sharingService.create(req.user.sub, dto);
  }

  @ApiOperation({ summary: 'List all shares for an item, owner only' })
  @ApiResponse({ status: 200, description: 'List of shares for the item' })
  @ApiResponse({ status: 403, description: 'Not the owner of this item' })
  @ApiResponse({ status: 404, description: 'Item not found' })
  @Get()
  findForItem(@Req() req, @Query() query: FindSharesDto) {
    return this.sharingService.findForItem(
      req.user.sub,
      query.itemType,
      query.itemId,
    );
  }

  @ApiOperation({ summary: 'List all shares received by the current user' })
  @ApiResponse({
    status: 200,
    description: 'List of shares received by the current user',
  })
  @Get('received')
  getReceivedShares(@Req() req) {
    return this.sharingService.getReceivedShares(req.user.sub);
  }

  @ApiOperation({ summary: 'Revoke a share' })
  @ApiResponse({ status: 200, description: 'Share revoked' })
  @ApiResponse({ status: 403, description: 'Not the owner of the shared item' })
  @ApiResponse({ status: 404, description: 'Share not found' })
  @Delete(':id')
  revoke(@Req() req, @Param('id') id: string) {
    return this.sharingService.revoke(req.user.sub, id);
  }
}
