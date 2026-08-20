import { IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UploadFileDto {
  @ApiProperty({
    description: 'ID of the data room to upload the file into',
    example: '3b4a3722-862d-4fe8-9b8a-24de7debea8c',
  })
  @IsUUID()
  dataRoomId!: string;

  @ApiPropertyOptional({
    description:
      'ID of the folder to upload the file into (root of the data room if omitted)',
    example: '13ddd3eb-8c3d-46d5-93b4-99cfd0a581da',
  })
  @IsOptional()
  @IsUUID()
  folderId?: string;
}
