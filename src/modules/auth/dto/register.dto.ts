import {
  IsEmail,
  IsString,
  IsStrongPassword,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({
    description: 'Email to register the account with',
    example: 'owner@acme.com',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    description: 'Full name of the account holder',
    example: 'Jane Owner',
  })
  @IsString()
  @MinLength(2)
  fullName!: string;

  @ApiProperty({
    description:
      'Password (min 8 chars, at least one uppercase, one lowercase, one number)',
    example: 'S3cure!Pass',
  })
  @IsStrongPassword({
    minLength: 8,
    minLowercase: 1,
    minUppercase: 1,
    minNumbers: 1,
    minSymbols: 0,
  })
  password!: string;
}
