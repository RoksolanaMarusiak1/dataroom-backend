import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const BUCKET_NAME = 'files';

@Injectable()
export class SupabaseStorageService {
  private client: SupabaseClient;

  constructor(config: ConfigService) {
    this.client = createClient(
      config.get<string>('SUPABASE_URL')!,
      config.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
    );
  }

  async upload(storageKey: string, buffer: Buffer, mimeType: string) {
    const { error } = await this.client.storage
      .from(BUCKET_NAME)
      .upload(storageKey, buffer, { contentType: mimeType });

    if (error) {
      throw new InternalServerErrorException(
        'Failed to upload file to storage',
      );
    }
  }

  async getSignedUrl(storageKey: string, expiresInSeconds = 300) {
    const { data, error } = await this.client.storage
      .from(BUCKET_NAME)
      .createSignedUrl(storageKey, expiresInSeconds);

    if (error) {
      throw new InternalServerErrorException(
        'Failed to generate download link',
      );
    }
    return data.signedUrl;
  }

  async delete(storageKey: string) {
    const { error } = await this.client.storage
      .from(BUCKET_NAME)
      .remove([storageKey]);

    if (error) {
      throw new InternalServerErrorException(
        'Failed to delete file from storage',
      );
    }
  }
}
