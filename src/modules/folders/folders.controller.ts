import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
import { FoldersService } from './folders.service';
import { CreateFolderDto } from './dto/create-folder.dto';
import { UpdateFolderDto } from './dto/update-folder.dto';

@ApiTags('folders')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('folders')
export class FoldersController {
  constructor(private foldersService: FoldersService) {}

  @ApiOperation({
    summary: 'Create a folder, optionally nested under a parent folder',
  })
  @ApiResponse({ status: 201, description: 'Folder created' })
  @ApiResponse({ status: 403, description: 'Not the owner of this data room' })
  @ApiResponse({
    status: 404,
    description: 'Data room or parent folder not found',
  })
  @Post()
  create(@Req() req, @Body() dto: CreateFolderDto) {
    return this.foldersService.create(req.user.sub, dto);
  }

  @ApiOperation({
    summary: "Get a folder's subfolders, files, and breadcrumb trail",
  })
  @ApiResponse({ status: 200, description: 'Folder contents' })
  @ApiResponse({ status: 403, description: 'No access to this folder' })
  @ApiResponse({ status: 404, description: 'Folder not found' })
  @Get(':id')
  getContents(@Req() req, @Param('id') id: string) {
    return this.foldersService.getContents(req.user.sub, id);
  }

  @ApiOperation({ summary: 'Rename a folder' })
  @ApiResponse({ status: 200, description: 'Folder renamed' })
  @ApiResponse({ status: 403, description: 'Not the owner of this folder' })
  @ApiResponse({ status: 404, description: 'Folder not found' })
  @Patch(':id')
  rename(@Req() req, @Param('id') id: string, @Body() dto: UpdateFolderDto) {
    return this.foldersService.rename(req.user.sub, id, dto);
  }

  @ApiOperation({ summary: 'Delete a folder' })
  @ApiResponse({ status: 200, description: 'Folder deleted' })
  @ApiResponse({ status: 403, description: 'Not the owner of this folder' })
  @ApiResponse({ status: 404, description: 'Folder not found' })
  @Delete(':id')
  remove(@Req() req, @Param('id') id: string) {
    return this.foldersService.remove(req.user.sub, id);
  }
}
