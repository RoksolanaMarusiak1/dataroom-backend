import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MoveFileDto {
  @ApiProperty({
    description: 'ID of the destination folder',
    example: '13ddd3eb-8c3d-46d5-93b4-99cfd0a581da',
  })
  @IsUUID()
  folderId!: string;
}
