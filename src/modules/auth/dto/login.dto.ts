import { IsEmail, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    description: 'Registered account email',
    example: 'owner@acme.com',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({ description: 'Account password', example: 'S3cure!Pass' })
  @IsString()
  password!: string;
}
