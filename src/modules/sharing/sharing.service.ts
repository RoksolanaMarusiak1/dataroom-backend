import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { Share, ShareTarget } from 'generated/prisma/client';
import { CreateShareDto, ShareItemType } from './dto/create-share.dto';

type AccessLevel = 'OWNER' | 'VIEWER';

interface AccessCheckItem {
  id: string;
  dataRoomId: string;
  folderId?: string | null;
}

const FK_FIELD_BY_ITEM_TYPE: Record<
  ShareItemType,
  'dataRoomId' | 'folderId' | 'fileId'
> = {
  [ShareItemType.ROOM]: 'dataRoomId',
  [ShareItemType.FOLDER]: 'folderId',
  [ShareItemType.FILE]: 'fileId',
};

@Injectable()
export class SharingService {
  constructor(private prisma: PrismaService) {}

  async create(ownerId: string, dto: CreateShareDto) {
    await this.resolveItemAndCheckOwner(ownerId, dto.itemType, dto.itemId);

    let userId = dto.userId;
    if (!userId && dto.email) {
      const user = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (!user) throw new NotFoundException('User not found');
      userId = user.id;
    }

    const fkField = FK_FIELD_BY_ITEM_TYPE[dto.itemType];

    return this.prisma.share.create({
      data: {
        targetType: dto.itemType as unknown as ShareTarget,
        [fkField]: dto.itemId,
        ...(userId ? { userId } : { publicToken: randomUUID() }),
      },
    });
  }

  async findForItem(ownerId: string, itemType: ShareItemType, itemId: string) {
    await this.resolveItemAndCheckOwner(ownerId, itemType, itemId);

    const fkField = FK_FIELD_BY_ITEM_TYPE[itemType];
    return this.prisma.share.findMany({
      where: { [fkField]: itemId },
      include: { user: { select: { email: true } } },
    });
  }

  async getPublicShareInfo(publicToken: string) {
    const share = await this.prisma.share.findUnique({
      where: { publicToken },
    });
    if (!share) throw new NotFoundException('Share link not found');

    const { itemType, itemId } = this.itemFromShare(share);
    const { id, name } = await this.resolveItemInfo(itemType, itemId);
    return { itemType, item: { id, name } };
  }

  async getReceivedShares(userId: string) {
    const shares = await this.prisma.share.findMany({ where: { userId } });

    return Promise.all(
      shares.map(async (share) => {
        const { itemType, itemId } = this.itemFromShare(share);
        const { id, name } = await this.resolveItemInfo(itemType, itemId);
        return { shareId: share.id, itemType, item: { id, name } };
      }),
    );
  }

  async revoke(ownerId: string, shareId: string) {
    const share = await this.prisma.share.findUnique({
      where: { id: shareId },
    });
    if (!share) throw new NotFoundException('Share not found');

    const { itemType, itemId } = this.itemFromShare(share);
    await this.resolveItemAndCheckOwner(ownerId, itemType, itemId);

    await this.prisma.share.delete({ where: { id: shareId } });
  }

  async checkAccess(
    userId: string | null,
    itemType: 'ROOM' | 'FOLDER' | 'FILE',
    item: AccessCheckItem,
    publicToken?: string,
  ): Promise<AccessLevel | null> {
    const room = await this.prisma.dataRoom.findUnique({
      where: { id: item.dataRoomId },
      select: { ownerId: true },
    });
    if (!room) return null;

    if (userId && room.ownerId === userId) return 'OWNER';

    const ancestorFolderIds = await this.getFolderChainIds(
      itemType === 'FILE' ? (item.folderId ?? null) : item.id,
    );

    if (publicToken) {
      const share = await this.prisma.share.findUnique({
        where: { publicToken },
      });
      if (
        share &&
        this.shareMatchesItem(share, itemType, item, ancestorFolderIds)
      ) {
        return 'VIEWER';
      }
    }

    if (userId) {
      const share = await this.prisma.share.findFirst({
        where: {
          userId,
          OR: [
            { dataRoomId: item.dataRoomId },
            ...(ancestorFolderIds.length
              ? [{ folderId: { in: ancestorFolderIds } }]
              : []),
            ...(itemType === 'FILE' ? [{ fileId: item.id }] : []),
          ],
        },
      });
      if (share) return 'VIEWER';
    }

    return null;
  }

  private shareMatchesItem(
    share: Share,
    itemType: 'ROOM' | 'FOLDER' | 'FILE',
    item: AccessCheckItem,
    ancestorFolderIds: string[],
  ) {
    if (share.dataRoomId && share.dataRoomId === item.dataRoomId) return true;
    if (share.folderId && ancestorFolderIds.includes(share.folderId))
      return true;
    if (itemType === 'FILE' && share.fileId && share.fileId === item.id)
      return true;
    return false;
  }

  // Returns [startFolderId, ...ancestors] up to (and not including) the room root.
  private async getFolderChainIds(
    startFolderId: string | null,
  ): Promise<string[]> {
    const ids: string[] = [];
    let currentId = startFolderId;

    while (currentId) {
      ids.push(currentId);
      const folder: { parentId: string | null } | null =
        await this.prisma.folder.findUnique({
          where: { id: currentId },
          select: { parentId: true },
        });
      if (!folder) break;
      currentId = folder.parentId;
    }

    return ids;
  }

  private itemFromShare(share: Share): {
    itemType: ShareItemType;
    itemId: string;
  } {
    if (share.targetType === ShareTarget.ROOM) {
      return { itemType: ShareItemType.ROOM, itemId: share.dataRoomId! };
    }
    if (share.targetType === ShareTarget.FOLDER) {
      return { itemType: ShareItemType.FOLDER, itemId: share.folderId! };
    }
    return { itemType: ShareItemType.FILE, itemId: share.fileId! };
  }

  private async resolveItemInfo(
    itemType: ShareItemType,
    itemId: string,
  ): Promise<{ id: string; name: string; itemType: ShareItemType }> {
    if (itemType === ShareItemType.ROOM) {
      const room = await this.prisma.dataRoom.findUnique({
        where: { id: itemId },
      });
      if (!room) throw new NotFoundException('Data room not found');
      return { id: room.id, name: room.name, itemType };
    }

    if (itemType === ShareItemType.FOLDER) {
      const folder = await this.prisma.folder.findUnique({
        where: { id: itemId },
      });
      if (!folder) throw new NotFoundException('Folder not found');
      return { id: folder.id, name: folder.name, itemType };
    }

    const file = await this.prisma.file.findUnique({ where: { id: itemId } });
    if (!file) throw new NotFoundException('File not found');
    return { id: file.id, name: file.name, itemType };
  }

  private async resolveItemAndCheckOwner(
    ownerId: string,
    itemType: ShareItemType,
    itemId: string,
  ): Promise<{ dataRoomId: string }> {
    if (itemType === ShareItemType.ROOM) {
      const room = await this.prisma.dataRoom.findUnique({
        where: { id: itemId },
      });
      if (!room) throw new NotFoundException('Data room not found');
      if (room.ownerId !== ownerId)
        throw new ForbiddenException(
          'Only the owner can manage sharing for this room',
        );
      return { dataRoomId: room.id };
    }

    if (itemType === ShareItemType.FOLDER) {
      const folder = await this.prisma.folder.findUnique({
        where: { id: itemId },
        include: { dataRoom: true },
      });
      if (!folder) throw new NotFoundException('Folder not found');
      if (folder.dataRoom.ownerId !== ownerId) {
        throw new ForbiddenException(
          'Only the owner can manage sharing for this folder',
        );
      }
      return { dataRoomId: folder.dataRoomId };
    }

    const file = await this.prisma.file.findUnique({
      where: { id: itemId },
      include: { dataRoom: true },
    });
    if (!file) throw new NotFoundException('File not found');
    if (file.dataRoom.ownerId !== ownerId) {
      throw new ForbiddenException(
        'Only the owner can manage sharing for this file',
      );
    }
    return { dataRoomId: file.dataRoomId };
  }
}
