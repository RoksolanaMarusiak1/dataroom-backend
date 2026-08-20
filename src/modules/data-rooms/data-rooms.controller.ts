import {
  Body,
  Controller,
  Get,
  Param,
  Post,
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
import { DataRoomsService } from './data-rooms.service';
import { CreateDataRoomDto } from './dto/create-data-room.dto';

@ApiTags('data-rooms')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('data-rooms')
export class DataRoomsController {
  constructor(private dataRoomsService: DataRoomsService) {}

  @ApiOperation({ summary: 'Create a new data room' })
  @ApiResponse({ status: 201, description: 'Data room created' })
  @Post()
  create(@Req() req, @Body() dto: CreateDataRoomDto) {
    return this.dataRoomsService.create(req.user.sub, dto);
  }

  @ApiOperation({ summary: 'List all data rooms owned by the current user' })
  @ApiResponse({ status: 200, description: 'List of owned data rooms' })
  @Get()
  findAll(@Req() req) {
    return this.dataRoomsService.findAllOwnedBy(req.user.sub);
  }

  @ApiOperation({
    summary: "Get a data room's root-level subfolders and files",
  })
  @ApiResponse({ status: 200, description: 'Data room contents' })
  @ApiResponse({ status: 403, description: 'No access to this data room' })
  @ApiResponse({ status: 404, description: 'Data room not found' })
  @Get(':id')
  getContents(@Req() req, @Param('id') id: string) {
    return this.dataRoomsService.getContents(req.user.sub, id);
  }
}
