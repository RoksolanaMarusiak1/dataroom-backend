import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SharingService } from '../sharing/sharing.service';
import { CreateFolderDto } from './dto/create-folder.dto';
import { UpdateFolderDto } from './dto/update-folder.dto';

@Injectable()
export class FoldersService {
  constructor(
    private prisma: PrismaService,
    private sharing: SharingService,
  ) {}

  async create(userId: string, dto: CreateFolderDto) {
    await this.assertRoomOwner(userId, dto.dataRoomId);

    if (dto.parentId) {
      const parent = await this.prisma.folder.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent || parent.dataRoomId !== dto.dataRoomId) {
        throw new NotFoundException(
          'Parent folder not found in this data room',
        );
      }
    }

    return this.prisma.folder.create({
      data: {
        name: dto.name,
        dataRoomId: dto.dataRoomId,
        parentId: dto.parentId,
      },
    });
  }

  async getContents(userId: string, folderId: string) {
    const folder = await this.findWithAccessCheck(userId, folderId);

    const [subfolders, files, breadcrumbs] = await Promise.all([
      this.prisma.folder.findMany({ where: { parentId: folderId } }),
      this.prisma.file.findMany({ where: { folderId } }),
      this.buildBreadcrumbs(folderId),
    ]);

    return { folder, subfolders, files, breadcrumbs };
  }

  async rename(userId: string, folderId: string, dto: UpdateFolderDto) {
    const folder = await this.findWithAccessCheck(userId, folderId);
    await this.assertRoomOwner(userId, folder.dataRoomId);

    return this.prisma.folder.update({
      where: { id: folderId },
      data: { name: dto.name },
    });
  }

  async remove(userId: string, folderId: string) {
    const folder = await this.findWithAccessCheck(userId, folderId);
    await this.assertRoomOwner(userId, folder.dataRoomId);

    return this.prisma.folder.delete({ where: { id: folderId } });
  }

  private async findWithAccessCheck(userId: string, folderId: string) {
    const folder = await this.prisma.folder.findUnique({
      where: { id: folderId },
      include: { dataRoom: true },
    });

    if (!folder) throw new NotFoundException('Folder not found');

    const isOwner = folder.dataRoom.ownerId === userId;
    if (!isOwner) {
      const access = await this.sharing.checkAccess(userId, 'FOLDER', {
        id: folder.id,
        dataRoomId: folder.dataRoomId,
        folderId: folder.parentId,
      });
      if (!access) {
        throw new ForbiddenException('You do not have access to this folder');
      }
    }

    return folder;
  }

  private async assertRoomOwner(userId: string, dataRoomId: string) {
    const room = await this.prisma.dataRoom.findUnique({
      where: { id: dataRoomId },
    });
    if (!room) throw new NotFoundException('Data room not found');
    if (room.ownerId !== userId)
      throw new ForbiddenException('Only the owner can modify this room');
  }

  private async buildBreadcrumbs(folderId: string) {
    const trail: { id: string; name: string }[] = [];
    let currentId: string | null = folderId;

    while (currentId) {
      const current = await this.prisma.folder.findUnique({
        where: { id: currentId },
        select: { id: true, name: true, parentId: true },
      });
      if (!current) break;
      trail.unshift({ id: current.id, name: current.name });
      currentId = current.parentId;
    }

    return trail;
  }
}
