import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateFileDto {
  @ApiProperty({
    description: 'New name for the file',
    example: 'Q4-Report-Final.pdf',
  })
  @IsString()
  @MinLength(1)
  name!: string;
}
