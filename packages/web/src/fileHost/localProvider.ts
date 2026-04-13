import { uploadBlob } from '../storage/blobApi';
import type { FileCategory, FileHostProvider } from './types';

export function createLocalFileHostProvider(): FileHostProvider {
  return {
    id: 'local-files',
    async upload(file: File, category: FileCategory) {
      const result = await uploadBlob(file);
      return {
        id: result.id,
        provider: 'local-files',
        category,
        url: result.url,
        fileName: result.filename,
        mimeType: result.mime_type,
        size: result.size,
      };
    },
  };
}
