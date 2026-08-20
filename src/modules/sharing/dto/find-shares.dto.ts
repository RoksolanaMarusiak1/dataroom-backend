import { IsEnum, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ShareItemType } from './create-share.dto';

export class FindSharesDto {
  @ApiProperty({
    description: 'Type of item to find shares for',
    enum: ShareItemType,
    example: ShareItemType.FOLDER,
  })
  @IsEnum(ShareItemType)
  itemType!: ShareItemType;

  @ApiProperty({
    description: 'ID of the item to find shares for',
    example: '13ddd3eb-8c3d-46d5-93b4-99cfd0a581da',
  })
  @IsUUID()
  itemId!: string;
}
