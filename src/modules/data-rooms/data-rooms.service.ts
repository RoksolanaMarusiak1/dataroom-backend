import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SharingService } from '../sharing/sharing.service';
import { CreateDataRoomDto } from './dto/create-data-room.dto';

@Injectable()
export class DataRoomsService {
  constructor(
    private prisma: PrismaService,
    private sharing: SharingService,
  ) {}

  create(userId: string, dto: CreateDataRoomDto) {
    return this.prisma.dataRoom.create({
      data: { name: dto.name, ownerId: userId },
    });
  }

  findAllOwnedBy(userId: string) {
    return this.prisma.dataRoom.findMany({ where: { ownerId: userId } });
  }

  async getContents(userId: string, roomId: string) {
    const room = await this.prisma.dataRoom.findUnique({
      where: { id: roomId },
    });
    if (!room) throw new NotFoundException('Data room not found');

    const isOwner = room.ownerId === userId;
    if (!isOwner) {
      const access = await this.sharing.checkAccess(userId, 'ROOM', {
        id: room.id,
        dataRoomId: room.id,
      });
      if (!access) {
        throw new ForbiddenException(
          'You do not have access to this data room',
        );
      }
    }

    const [subfolders, files] = await Promise.all([
      this.prisma.folder.findMany({
        where: { dataRoomId: roomId, parentId: null },
      }),
      this.prisma.file.findMany({
        where: { dataRoomId: roomId, folderId: null },
      }),
    ]);

    return { room, subfolders, files };
  }
}
