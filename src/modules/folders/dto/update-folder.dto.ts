import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateFolderDto {
  @ApiProperty({
    description: 'New name for the folder',
    example: '2025 Financials',
  })
  @IsString()
  @MinLength(1)
  name!: string;
}
