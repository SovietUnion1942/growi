import { act, renderHook } from '@testing-library/react';

import type { NasEntry } from '~/features/nas-file-storage/interfaces';

import { useNasPreview } from './use-nas-preview';

const fileEntry = (name: string): NasEntry => ({
  name,
  type: 'file',
  sizeBytes: 10,
  modifiedAt: '2026-01-01T00:00:00.000Z',
});

describe('useNasPreview', () => {
  it('starts closed', () => {
    const { result } = renderHook(() => useNasPreview());

    expect(result.current.previewEntry).toBeNull();
    expect(result.current.previewLogicalPath).toBeNull();
    expect(result.current.previewUrl).toBeNull();
    expect(result.current.previewKind).toBeNull();
  });

  it('opens a preview and builds an inline delivery URL', () => {
    const { result } = renderHook(() => useNasPreview());
    const entry = fileEntry('photo.png');

    act(() => {
      result.current.openPreview('/dir/sub/photo.png', entry);
    });

    expect(result.current.previewEntry).toBe(entry);
    expect(result.current.previewLogicalPath).toBe('/dir/sub/photo.png');
    expect(result.current.previewKind).toBe('image');
    expect(result.current.previewUrl).toBe(
      `/_api/v3/nas-storage/file?path=${encodeURIComponent('/dir/sub/photo.png')}&inline=1`,
    );
  });

  it('closes back to the initial state', () => {
    const { result } = renderHook(() => useNasPreview());

    act(() => {
      result.current.openPreview('/a/photo.png', fileEntry('photo.png'));
    });
    act(() => {
      result.current.closePreview();
    });

    expect(result.current.previewEntry).toBeNull();
    expect(result.current.previewUrl).toBeNull();
    expect(result.current.previewKind).toBeNull();
  });

  it('reports a null kind for a non-previewable file without crashing', () => {
    const { result } = renderHook(() => useNasPreview());

    act(() => {
      result.current.openPreview('/a/evil.svg', fileEntry('evil.svg'));
    });

    expect(result.current.previewEntry).not.toBeNull();
    expect(result.current.previewKind).toBeNull();
  });
});
