import { IsString, IsOptional, IsUUID, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFolderDto {
  @ApiProperty({ description: 'Name of the folder', example: 'Financials' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({
    description: 'ID of the data room this folder belongs to',
    example: '3b4a3722-862d-4fe8-9b8a-24de7debea8c',
  })
  @IsUUID()
  dataRoomId!: string;

  @ApiPropertyOptional({
    description: 'ID of the parent folder, if nested',
    example: '13ddd3eb-8c3d-46d5-93b4-99cfd0a581da',
  })
  @IsOptional()
  @IsUUID()
  parentId?: string;
}
