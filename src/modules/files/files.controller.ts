import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FilesService } from './files.service';
import { UpdateFileDto } from './dto/update-file.dto';
import { MoveFileDto } from './dto/move-file.dto';
import { UploadFileDto } from './dto/upload-file.dto';

@ApiTags('files')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('files')
export class FilesController {
  constructor(private filesService: FilesService) {}

  @ApiOperation({
    summary:
      'Upload a file into a data room, optionally into a specific folder',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'dataRoomId'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'The file to upload',
        },
        dataRoomId: {
          type: 'string',
          format: 'uuid',
          description: 'ID of the data room to upload the file into',
          example: '3b4a3722-862d-4fe8-9b8a-24de7debea8c',
        },
        folderId: {
          type: 'string',
          format: 'uuid',
          description:
            'ID of the folder to upload the file into (root of the data room if omitted)',
          example: '13ddd3eb-8c3d-46d5-93b4-99cfd0a581da',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'File uploaded' })
  @ApiResponse({ status: 403, description: 'Not the owner of this data room' })
  @ApiResponse({ status: 404, description: 'Data room or folder not found' })
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @Req() req,
    @Body() dto: UploadFileDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.filesService.upload(
      req.user.sub,
      dto.dataRoomId,
      dto.folderId ?? null,
      file.originalname,
      file.buffer,
      file.mimetype,
      file.size,
    );
  }

  @ApiOperation({
    summary: 'Get a time-limited signed download URL for a file',
  })
  @ApiResponse({ status: 200, description: 'Signed download URL' })
  @ApiResponse({ status: 403, description: 'No access to this file' })
  @ApiResponse({ status: 404, description: 'File not found' })
  @Get(':id/download')
  getDownloadUrl(@Req() req, @Param('id') id: string) {
    return this.filesService.getDownloadUrl(req.user.sub, id);
  }

  @ApiOperation({ summary: 'Rename a file' })
  @ApiResponse({ status: 200, description: 'File renamed' })
  @ApiResponse({ status: 403, description: 'Not the owner of this file' })
  @ApiResponse({ status: 404, description: 'File not found' })
  @Patch(':id')
  rename(@Req() req, @Param('id') id: string, @Body() dto: UpdateFileDto) {
    return this.filesService.rename(req.user.sub, id, dto);
  }

  @ApiOperation({ summary: 'Move a file to a different folder' })
  @ApiResponse({ status: 200, description: 'File moved' })
  @ApiResponse({ status: 403, description: 'Not the owner of this file' })
  @ApiResponse({ status: 404, description: 'File or target folder not found' })
  @Patch(':id/move')
  move(@Req() req, @Param('id') id: string, @Body() dto: MoveFileDto) {
    return this.filesService.move(req.user.sub, id, dto);
  }

  @ApiOperation({ summary: 'Delete a file' })
  @ApiResponse({ status: 200, description: 'File deleted' })
  @ApiResponse({ status: 403, description: 'Not the owner of this file' })
  @ApiResponse({ status: 404, description: 'File not found' })
  @Delete(':id')
  remove(@Req() req, @Param('id') id: string) {
    return this.filesService.remove(req.user.sub, id);
  }
}
