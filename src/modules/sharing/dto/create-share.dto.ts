import { IsEmail, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ShareItemType {
  ROOM = 'ROOM',
  FOLDER = 'FOLDER',
  FILE = 'FILE',
}

export class CreateShareDto {
  @ApiProperty({
    description: 'Type of item being shared',
    enum: ShareItemType,
    example: ShareItemType.FOLDER,
  })
  @IsEnum(ShareItemType)
  itemType!: ShareItemType;

  @ApiProperty({
    description: 'ID of the item being shared',
    example: '13ddd3eb-8c3d-46d5-93b4-99cfd0a581da',
  })
  @IsUUID()
  itemId!: string;

  // If provided, share with this specific user (by id, resolved from
  // email in the controller/service). If omitted, create a public link.
  @ApiPropertyOptional({
    description:
      'ID of the user to share with directly (omit to create a public link)',
    example: '8f5368a1-b504-4ce9-b0e5-545776e29211',
  })
  @IsOptional()
  @IsUUID()
  userId?: string;

  // Alternative to userId — resolved to a userId by the service.
  @ApiPropertyOptional({
    description:
      'Email of the user to share with, resolved to a userId (alternative to userId)',
    example: 'viewer@acme.com',
  })
  @IsOptional()
  @IsEmail()
  email?: string;
}
