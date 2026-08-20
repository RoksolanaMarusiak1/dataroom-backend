import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SharingService } from '../sharing/sharing.service';
import { SupabaseStorageService } from './supabase-storage.service';
import { UpdateFileDto } from './dto/update-file.dto';
import { MoveFileDto } from './dto/move-file.dto';

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private prisma: PrismaService,
    private storage: SupabaseStorageService,
    private sharing: SharingService,
  ) {}

  async upload(
    userId: string,
    dataRoomId: string,
    folderId: string | null,
    originalFilename: string,
    buffer: Buffer,
    mimeType: string,
    size: number,
  ) {
    await this.assertRoomOwner(userId, dataRoomId);

    if (folderId) {
      const folder = await this.prisma.folder.findUnique({
        where: { id: folderId },
      });
      if (!folder || folder.dataRoomId !== dataRoomId) {
        throw new NotFoundException('Folder not found in this data room');
      }
    }

    const name = await this.resolveNameConflict(
      folderId,
      dataRoomId,
      originalFilename,
    );
    const storageKey = `${dataRoomId}/${randomUUID()}-${originalFilename}`;

    await this.storage.upload(storageKey, buffer, mimeType);

    return this.prisma.file.create({
      data: {
        name,
        storageKey,
        size,
        folderId,
        dataRoomId,
      },
    });
  }

  async getDownloadUrl(userId: string, fileId: string) {
    const file = await this.findWithAccessCheck(userId, fileId);
    const url = await this.storage.getSignedUrl(file.storageKey);
    return { url };
  }

  async rename(userId: string, fileId: string, dto: UpdateFileDto) {
    const file = await this.findWithAccessCheck(userId, fileId);
    await this.assertRoomOwner(userId, file.dataRoomId);

    const name = await this.resolveNameConflict(
      file.folderId,
      file.dataRoomId,
      dto.name,
      file.id,
    );

    return this.prisma.file.update({
      where: { id: fileId },
      data: { name },
    });
  }

  async move(userId: string, fileId: string, dto: MoveFileDto) {
    const file = await this.findWithAccessCheck(userId, fileId);
    await this.assertRoomOwner(userId, file.dataRoomId);

    const targetFolder = await this.prisma.folder.findUnique({
      where: { id: dto.folderId },
    });
    if (!targetFolder || targetFolder.dataRoomId !== file.dataRoomId) {
      throw new NotFoundException('Target folder not found in this data room');
    }

    const name = await this.resolveNameConflict(
      dto.folderId,
      file.dataRoomId,
      file.name,
      file.id,
    );

    return this.prisma.file.update({
      where: { id: fileId },
      data: { folderId: dto.folderId, name },
    });
  }

  async remove(userId: string, fileId: string) {
    const file = await this.findWithAccessCheck(userId, fileId);
    await this.assertRoomOwner(userId, file.dataRoomId);

    await this.prisma.file.delete({ where: { id: fileId } });

    try {
      await this.storage.delete(file.storageKey);
    } catch (error) {
      this.logger.error(
        `Failed to delete storage object ${file.storageKey}`,
        error as Error,
      );
    }
  }

  private async resolveNameConflict(
    folderId: string | null,
    dataRoomId: string,
    desiredName: string,
    excludeFileId?: string,
  ) {
    const existing = await this.prisma.file.findMany({
      where: { folderId, dataRoomId },
      select: { id: true, name: true },
    });

    const takenNames = new Set(
      existing.filter((f) => f.id !== excludeFileId).map((f) => f.name),
    );

    if (!takenNames.has(desiredName)) {
      return desiredName;
    }

    let counter = 1;
    let candidate = `${desiredName} (${counter})`;
    while (takenNames.has(candidate)) {
      counter += 1;
      candidate = `${desiredName} (${counter})`;
    }

    return candidate;
  }

  private async findWithAccessCheck(userId: string, fileId: string) {
    const file = await this.prisma.file.findUnique({
      where: { id: fileId },
      include: { dataRoom: true },
    });

    if (!file) throw new NotFoundException('File not found');

    const isOwner = file.dataRoom.ownerId === userId;
    if (!isOwner) {
      const access = await this.sharing.checkAccess(userId, 'FILE', {
        id: file.id,
        dataRoomId: file.dataRoomId,
        folderId: file.folderId,
      });
      if (!access) {
        throw new ForbiddenException('You do not have access to this file');
      }
    }

    return file;
  }

  private async assertRoomOwner(userId: string, dataRoomId: string) {
    const room = await this.prisma.dataRoom.findUnique({
      where: { id: dataRoomId },
    });
    if (!room) throw new NotFoundException('Data room not found');
    if (room.ownerId !== userId)
      throw new ForbiddenException('Only the owner can modify this room');
  }
}
