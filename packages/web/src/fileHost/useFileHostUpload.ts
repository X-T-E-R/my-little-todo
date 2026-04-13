import type { Attachment } from '@my-little-todo/core';
import { useCallback, useRef, useState } from 'react';
import { fileHostAssetToAttachment, fileHostAssetToMarkdown, mergeAttachments, uploadFileWithHost } from './service';
import type { ChangeEvent, DragEvent } from 'react';

interface UseFileHostUploadOptions {
  getAttachments: () => Attachment[];
  onAttachmentsChange: (attachments: Attachment[]) => void | Promise<void>;
  onInsertMarkdown: (markdown: string) => void;
  onUploadError?: (message: string) => void;
}

export function useFileHostUpload({
  getAttachments,
  onAttachmentsChange,
  onInsertMarkdown,
  onUploadError,
}: UseFileHostUploadOptions) {
  const [isUploading, setIsUploading] = useState(false);
  const uploadCounterRef = useRef(0);

  const uploadFiles = useCallback(
    async (input: FileList | File[] | null | undefined) => {
      const files = input ? Array.from(input) : [];
      if (files.length === 0) return;

      uploadCounterRef.current += 1;
      setIsUploading(true);
      try {
        const markdownParts: string[] = [];
        const attachments: Attachment[] = [];

        for (const file of files) {
          const asset = await uploadFileWithHost(file);
          markdownParts.push(fileHostAssetToMarkdown(asset));
          attachments.push(fileHostAssetToAttachment(asset));
        }

        await onAttachmentsChange(mergeAttachments(getAttachments(), attachments));
        if (markdownParts.length > 0) {
          onInsertMarkdown(markdownParts.join('\n'));
        }
      } catch (error) {
        onUploadError?.(error instanceof Error ? error.message : String(error));
      } finally {
        uploadCounterRef.current -= 1;
        if (uploadCounterRef.current <= 0) {
          setIsUploading(false);
          uploadCounterRef.current = 0;
        }
      }
    },
    [getAttachments, onAttachmentsChange, onInsertMarkdown, onUploadError],
  );

  const handlePaste = useCallback(
    (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length === 0) return;
      event.preventDefault();
      void uploadFiles(files);
    },
    [uploadFiles],
  );

  const handleDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      void uploadFiles(event.dataTransfer?.files);
    },
    [uploadFiles],
  );

  const handleDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
  }, []);

  const handleFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      void uploadFiles(event.target.files);
      event.target.value = '';
    },
    [uploadFiles],
  );

  return {
    isUploading,
    uploadFiles,
    handlePaste,
    handleDrop,
    handleDragOver,
    handleFileInputChange,
  };
}
