export type FileCategory = 'image' | 'document' | 'video' | 'audio' | 'archive' | 'other';

export type FileHostProviderId = 'local-files' | 'mlt-server' | 'webdav';

export interface FileHostAsset {
  id?: string;
  provider: FileHostProviderId;
  category: FileCategory;
  url: string;
  fileName: string;
  mimeType: string;
  size: number;
}

export interface FileRoutingRule {
  category: FileCategory;
  provider: FileHostProviderId;
}

export interface MltServerFileHostConfig {
  endpoint: string;
  authMode: 'session' | 'token' | 'credentials';
  token: string;
  username: string;
  password: string;
}

export interface WebDavFileHostConfig {
  endpoint: string;
  publicBaseUrl: string;
  username: string;
  password: string;
  directory: string;
}

export interface FileHostProviderConfig {
  enabled: boolean;
  maxSize: number;
  allowClipboardImages: boolean;
  routing: FileRoutingRule[];
  extensionOverrides: Record<string, FileCategory>;
  providers: {
    mltServer: MltServerFileHostConfig;
    webdav: WebDavFileHostConfig;
  };
}

export interface FileHostProvider {
  readonly id: FileHostProviderId;
  upload(file: File, category: FileCategory): Promise<FileHostAsset>;
}
