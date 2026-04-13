import { describe, expect, it } from 'vitest';
import { categorizeFile, pickProviderForCategory } from './classification';
import type { FileCategory, FileRoutingRule } from './types';

describe('categorizeFile', () => {
  it('classifies images from mime type', () => {
    expect(categorizeFile({ name: 'cover.png', type: 'image/png' })).toBe('image');
  });

  it('classifies documents from extension when mime is generic', () => {
    expect(categorizeFile({ name: 'spec.pdf', type: 'application/octet-stream' })).toBe(
      'document',
    );
  });

  it('lets extension overrides win over mime detection', () => {
    expect(
      categorizeFile(
        { name: 'screenshot.bin', type: 'application/octet-stream' },
        { bin: 'image' },
      ),
    ).toBe('image');
  });

  it('falls back to other when nothing matches', () => {
    expect(categorizeFile({ name: 'payload.unknown', type: '' })).toBe('other');
  });
});

describe('pickProviderForCategory', () => {
  it('returns category specific provider when configured', () => {
    const routing: FileRoutingRule[] = [
      { category: 'image', provider: 'webdav' },
      { category: 'other', provider: 'local-files' },
    ];
    expect(pickProviderForCategory('image', routing)).toBe('webdav');
  });

  it('falls back to other provider when category is missing', () => {
    const routing: FileRoutingRule[] = [{ category: 'other', provider: 'local-files' }];
    expect(pickProviderForCategory('document', routing)).toBe('local-files');
  });

  it('uses built-in default fallback when no rules are present', () => {
    const categories: FileCategory[] = ['image', 'document', 'video', 'audio', 'archive', 'other'];
    for (const category of categories) {
      expect(pickProviderForCategory(category, [])).toBe('local-files');
    }
  });
});
