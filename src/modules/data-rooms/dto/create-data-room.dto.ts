import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateDataRoomDto {
  @ApiProperty({
    description: 'Name of the data room',
    example: 'Project Falcon Due Diligence',
  })
  @IsString()
  @MinLength(1)
  name!: string;
}
