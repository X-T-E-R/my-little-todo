import type { ChangeRecord, PushResult, SyncTarget } from './types';

/**
 * SyncTarget for S3-compatible object storage (AWS S3, Cloudflare R2, MinIO, etc.).
 *
 * Stores data as JSON objects under a configurable prefix:
 *   s3://<bucket>/<prefix>/manifest.json
 *   s3://<bucket>/<prefix>/files/<encoded-path>.json
 *   s3://<bucket>/<prefix>/settings/<key>.json
 *
 * NOTE: This is a placeholder implementation. S3 operations from the browser
 * require pre-signed URLs or a CORS-enabled bucket with direct credentials.
 * For production use, consider routing through the API server or using
 * a service worker.
 */
export class S3SyncTarget implements SyncTarget {
  readonly id: string;
  readonly type = 's3';
  readonly displayName: string;

  private endpoint: string;
  private bucket: string;
  private accessKey: string;
  private secretKey: string;
  private prefix: string;

  constructor(opts: {
    id: string;
    endpoint: string;
    bucket: string;
    accessKey: string;
    secretKey: string;
    prefix?: string;
    displayName?: string;
  }) {
    this.id = opts.id;
    this.endpoint = opts.endpoint;
    this.bucket = opts.bucket;
    this.accessKey = opts.accessKey;
    this.secretKey = opts.secretKey;
    this.prefix = opts.prefix || 'mlt-sync';
    this.displayName = opts.displayName || `S3 (${opts.bucket})`;
  }

  async testConnection(): Promise<boolean> {
    // TODO: Implement S3 ListObjects or HeadBucket check
    console.warn('[S3SyncTarget] testConnection not yet implemented');
    return false;
  }

  async pull(_sinceVersion: number): Promise<{ changes: ChangeRecord[]; currentVersion: number }> {
    // TODO: Implement S3 GetObject for manifest and change files
    console.warn('[S3SyncTarget] pull not yet implemented');
    return { changes: [], currentVersion: 0 };
  }

  async push(_changes: ChangeRecord[]): Promise<PushResult> {
    // TODO: Implement S3 PutObject for change files and manifest
    console.warn('[S3SyncTarget] push not yet implemented');
    return { ok: false, applied: 0, currentVersion: 0 };
  }

  async getRemoteVersion(): Promise<number> {
    // TODO: Implement S3 GetObject for manifest
    console.warn('[S3SyncTarget] getRemoteVersion not yet implemented');
    return 0;
  }
}
