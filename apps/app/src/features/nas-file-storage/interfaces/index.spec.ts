import { describe, expectTypeOf, it } from 'vitest';

import type {
  BeginChunkedUploadResponse,
  ChunkedUploadSession,
  NasEntry,
  NasEntryType,
  NasError,
  NasErrorCode,
  NasFileStore,
  NasListPage,
  NasListQuery,
  NasResult,
  PutFileInput,
} from './index';

describe('nas-file-storage interfaces barrel', () => {
  it('exposes NasEntry with the documented shape', () => {
    expectTypeOf<NasEntry>().toMatchTypeOf<{
      name: string;
      type: NasEntryType;
      sizeBytes: number;
      modifiedAt: string;
    }>();
    expectTypeOf<NasEntryType>().toEqualTypeOf<'file' | 'directory'>();
  });

  it('exposes NasListQuery and NasListPage', () => {
    expectTypeOf<NasListQuery>().toMatchTypeOf<{
      cursor?: string;
      limit: number;
      includeHidden: boolean;
    }>();
    expectTypeOf<NasListPage>().toMatchTypeOf<{
      entries: NasEntry[];
      nextCursor?: string;
    }>();
  });

  it('includes TOO_MANY_ENTRIES and TOO_LARGE in NasErrorCode', () => {
    expectTypeOf<'TOO_MANY_ENTRIES'>().toMatchTypeOf<NasErrorCode>();
    expectTypeOf<'TOO_LARGE'>().toMatchTypeOf<NasErrorCode>();
  });

  it('includes the chunked-upload error codes in NasErrorCode', () => {
    expectTypeOf<'UPLOAD_SESSION_NOT_FOUND'>().toMatchTypeOf<NasErrorCode>();
    expectTypeOf<'CHUNK_OUT_OF_ORDER'>().toMatchTypeOf<NasErrorCode>();
  });

  it('exposes NasError with optional limit fields', () => {
    expectTypeOf<NasError>().toMatchTypeOf<{
      code: NasErrorCode;
      message: string;
      suggestedName?: string;
      limitBytes?: number;
      limitEntries?: number;
    }>();
  });

  it('exposes NasResult as a discriminated union', () => {
    const ok: NasResult<number> = { ok: true, value: 1 };
    const err: NasResult<number> = {
      ok: false,
      error: { code: 'UNKNOWN', message: 'x' },
    };
    expectTypeOf(ok).toMatchTypeOf<NasResult<number>>();
    expectTypeOf(err).toMatchTypeOf<NasResult<number>>();
  });

  it('exposes chunked-upload types from the barrel', () => {
    expectTypeOf<ChunkedUploadSession>().toMatchTypeOf<{
      uploadId: string;
      userId: string;
      dirLogicalPath: string;
      targetName: string;
      totalBytes: number;
      overwrite: boolean;
      receivedBytes: number;
      partPath: string;
      createdAt: Date;
    }>();
    expectTypeOf<BeginChunkedUploadResponse>().toMatchTypeOf<{
      uploadId: string;
      chunkSize: number;
    }>();
  });

  it('exposes NasFileStore and PutFileInput', () => {
    expectTypeOf<NasFileStore['list']>().toBeFunction();
    expectTypeOf<PutFileInput>().toMatchTypeOf<{
      dirLogicalPath: string;
      targetName: string;
      sourceTmpPath: string;
      overwrite: boolean;
    }>();
  });
});
