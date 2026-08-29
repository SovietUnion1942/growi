import { PassThrough } from 'node:stream';
import { mock } from 'vitest-mock-extended';

import type { Logger } from '~/utils/logger';

import type {
  BeginChunkedUploadInput,
  NasEntry,
  NasFileStore,
  NasListQuery,
  PutFileInput,
} from '../../interfaces';
import type { NasStorageConfig } from '../config/nas-storage-config';
import type { ChunkedUploadRegistry } from './chunked-upload-registry';
import { createNasStorageService } from './nas-storage-service';
import type { RootHealthChecker } from './root-health-checker';

const fileEntry = (name: string): NasEntry => ({
  name,
  type: 'file',
  sizeBytes: 10,
  modifiedAt: '2026-01-01T00:00:00.000Z',
});

const dirEntry = (name: string): NasEntry => ({
  name,
  type: 'directory',
  sizeBytes: 0,
  modifiedAt: '2026-01-01T00:00:00.000Z',
});

const listQuery: NasListQuery = { limit: 100, includeHidden: false };

const putInput = (overrides?: Partial<PutFileInput>): PutFileInput => ({
  dirLogicalPath: '/docs',
  targetName: 'report.pdf',
  sourceTmpPath: '/tmp/uploads/abc',
  overwrite: false,
  ...overrides,
});

const beginInput = (
  overrides?: Partial<BeginChunkedUploadInput>,
): BeginChunkedUploadInput => ({
  userId: 'user-1',
  dirLogicalPath: '/docs',
  targetName: 'big.zip',
  totalBytes: 42,
  overwrite: false,
  ...overrides,
});

const setup = (rootReady = true, maxFileSize?: number) => {
  const store = mock<NasFileStore>();
  const health = mock<RootHealthChecker>();
  const logger = mock<Logger>();
  const registry = mock<ChunkedUploadRegistry>();
  const config = mock<Pick<NasStorageConfig, 'maxFileSize'>>();

  config.maxFileSize.mockReturnValue(maxFileSize);
  health.ensureReady.mockResolvedValue(
    rootReady
      ? { state: 'ready', resolvedRoot: '/nas' }
      : { state: 'unavailable', resolvedRoot: '/nas' },
  );
  // A resolvable-but-absent destination is the common case for `begin`.
  store.statEntry.mockResolvedValue({
    ok: false,
    error: { code: 'NOT_FOUND', message: 'nas_storage.error.not_found' },
  });

  const service = createNasStorageService({
    store,
    health,
    logger,
    registry,
    config,
  });
  return { store, health, logger, registry, config, service };
};

describe('createNasStorageService', () => {
  describe('ensureReady gate', () => {
    it('returns STORAGE_UNAVAILABLE and does not touch the store when the root is unavailable', async () => {
      const { store, service } = setup(false);

      const results = await Promise.all([
        service.listFolder('/docs', listQuery),
        service.download('/docs/a.pdf'),
        service.resolveContent('/docs/a.pdf'),
        service.putFile(putInput()),
        service.createFolder('/docs', 'sub'),
        service.rename('/docs/a.pdf', '/docs/b.pdf', false),
        service.deleteEntry('/docs/a.pdf', false),
      ]);

      for (const result of results) {
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.code).toBe('STORAGE_UNAVAILABLE');
          expect(result.error.message).toBe(
            'nas_storage.error.storage_unavailable',
          );
        }
      }

      expect(store.list).not.toHaveBeenCalled();
      expect(store.openRead).not.toHaveBeenCalled();
      expect(store.resolveContentPath).not.toHaveBeenCalled();
      expect(store.moveIntoRoot).not.toHaveBeenCalled();
      expect(store.mkdir).not.toHaveBeenCalled();
      expect(store.move).not.toHaveBeenCalled();
      expect(store.remove).not.toHaveBeenCalled();
    });

    it('returns STORAGE_UNAVAILABLE when the root is unconfigured', async () => {
      const { store, health, service } = setup();
      health.ensureReady.mockResolvedValue({ state: 'unconfigured' });

      const result = await service.listFolder('/docs', listQuery);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('STORAGE_UNAVAILABLE');
      }
      expect(store.list).not.toHaveBeenCalled();
    });

    it('returns STORAGE_UNAVAILABLE when the root is misconfigured', async () => {
      const { health, service } = setup();
      health.ensureReady.mockResolvedValue({
        state: 'misconfigured',
        reason: 'not-writable',
      });

      const result = await service.putFile(putInput());

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('STORAGE_UNAVAILABLE');
      }
    });
  });

  describe('listFolder', () => {
    it('passes the store result through on success', async () => {
      const { store, service } = setup();
      const page = { entries: [fileEntry('a.pdf')] };
      store.list.mockResolvedValue({ ok: true, value: page });

      const result = await service.listFolder('/docs', listQuery);

      expect(store.list).toHaveBeenCalledWith('/docs', listQuery);
      expect(result).toEqual({ ok: true, value: page });
    });
  });

  describe('download', () => {
    it('returns the stream and entry on success', async () => {
      const { store, service } = setup();
      const stream = new PassThrough();
      const entry = fileEntry('a.pdf');
      store.openRead.mockResolvedValue({ ok: true, value: { stream, entry } });

      const result = await service.download('/docs/a.pdf');

      expect(store.openRead).toHaveBeenCalledWith('/docs/a.pdf');
      expect(result).toEqual({ ok: true, value: { stream, entry } });
    });

    it('passes an IS_DIRECTORY error through', async () => {
      const { store, service } = setup();
      store.openRead.mockResolvedValue({
        ok: false,
        error: {
          code: 'IS_DIRECTORY',
          message: 'nas_storage.error.is_directory',
        },
      });

      const result = await service.download('/docs');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('IS_DIRECTORY');
      }
    });

    it('passes a NOT_FOUND error through', async () => {
      const { store, service } = setup();
      store.openRead.mockResolvedValue({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'nas_storage.error.not_found' },
      });

      const result = await service.download('/docs/missing.pdf');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('resolveContent', () => {
    it('returns the absolute path and entry from the store on success', async () => {
      const { store, service } = setup();
      const entry = fileEntry('a.pdf');
      store.resolveContentPath.mockResolvedValue({
        ok: true,
        value: { absolutePath: '/nas/docs/a.pdf', entry },
      });

      const result = await service.resolveContent('/docs/a.pdf');

      expect(store.resolveContentPath).toHaveBeenCalledWith('/docs/a.pdf');
      expect(result).toEqual({
        ok: true,
        value: { absolutePath: '/nas/docs/a.pdf', entry },
      });
    });

    it('passes an IS_DIRECTORY error through', async () => {
      const { store, service } = setup();
      store.resolveContentPath.mockResolvedValue({
        ok: false,
        error: {
          code: 'IS_DIRECTORY',
          message: 'nas_storage.error.is_directory',
        },
      });

      const result = await service.resolveContent('/docs');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('IS_DIRECTORY');
      }
    });

    it('passes a NOT_FOUND error through', async () => {
      const { store, service } = setup();
      store.resolveContentPath.mockResolvedValue({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'nas_storage.error.not_found' },
      });

      const result = await service.resolveContent('/docs/missing.pdf');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });

    it('passes an OUT_OF_ROOT error through', async () => {
      const { store, service } = setup();
      store.resolveContentPath.mockResolvedValue({
        ok: false,
        error: {
          code: 'OUT_OF_ROOT',
          message: 'nas_storage.error.out_of_root',
        },
      });

      const result = await service.resolveContent('/../etc/passwd');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('OUT_OF_ROOT');
      }
    });

    it('returns STORAGE_UNAVAILABLE without touching the store when the root is not ready', async () => {
      const { store, service } = setup(false);

      const result = await service.resolveContent('/docs/a.pdf');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('STORAGE_UNAVAILABLE');
      }
      expect(store.resolveContentPath).not.toHaveBeenCalled();
    });

    it('logs an error when the store returns a failure', async () => {
      const { store, logger, service } = setup();
      store.resolveContentPath.mockResolvedValue({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'nas_storage.error.not_found' },
      });

      await service.resolveContent('/docs/missing.pdf');

      expect(logger.error).toHaveBeenCalled();
      const [detail, message] = logger.error.mock.calls[0];
      expect(String(message)).toContain('resolveContent');
      expect(detail).toMatchObject({ errorCode: 'NOT_FOUND' });
    });
  });

  describe('putFile', () => {
    it('passes a successful store result through', async () => {
      const { store, service } = setup();
      const entry = fileEntry('report.pdf');
      store.moveIntoRoot.mockResolvedValue({ ok: true, value: entry });

      const result = await service.putFile(putInput());

      expect(store.moveIntoRoot).toHaveBeenCalledWith(putInput());
      expect(result).toEqual({ ok: true, value: entry });
    });

    it('on CONFLICT with overwrite=false, suggests "report (1).pdf" when it is free', async () => {
      const { store, service } = setup();
      store.moveIntoRoot.mockResolvedValue({
        ok: false,
        error: { code: 'CONFLICT', message: 'nas_storage.error.conflict' },
      });
      store.statEntry.mockResolvedValue({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'nas_storage.error.not_found' },
      });

      const result = await service.putFile(putInput());

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CONFLICT');
        expect(result.error.suggestedName).toBe('report (1).pdf');
      }
      expect(store.statEntry).toHaveBeenCalledWith('/docs/report (1).pdf');
    });

    it('on CONFLICT, skips taken candidates and suggests "report (2).pdf"', async () => {
      const { store, service } = setup();
      store.moveIntoRoot.mockResolvedValue({
        ok: false,
        error: { code: 'CONFLICT', message: 'nas_storage.error.conflict' },
      });
      store.statEntry.mockImplementation((logicalPath: string) => {
        if (logicalPath === '/docs/report (1).pdf') {
          return Promise.resolve({
            ok: true,
            value: fileEntry('report (1).pdf'),
          });
        }
        return Promise.resolve({
          ok: false,
          error: { code: 'NOT_FOUND', message: 'nas_storage.error.not_found' },
        });
      });

      const result = await service.putFile(putInput());

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.suggestedName).toBe('report (2).pdf');
      }
    });

    it('handles a dotfile target with no extension', async () => {
      const { store, service } = setup();
      store.moveIntoRoot.mockResolvedValue({
        ok: false,
        error: { code: 'CONFLICT', message: 'nas_storage.error.conflict' },
      });
      store.statEntry.mockResolvedValue({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'nas_storage.error.not_found' },
      });

      const result = await service.putFile(
        putInput({ targetName: 'README', dirLogicalPath: '/' }),
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.suggestedName).toBe('README (1)');
      }
      expect(store.statEntry).toHaveBeenCalledWith('/README (1)');
    });

    it('does not run suggestion logic when overwrite=true', async () => {
      const { store, service } = setup();
      store.moveIntoRoot.mockResolvedValue({
        ok: false,
        error: { code: 'CONFLICT', message: 'nas_storage.error.conflict' },
      });

      const result = await service.putFile(putInput({ overwrite: true }));

      expect(store.statEntry).not.toHaveBeenCalled();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CONFLICT');
        expect(result.error.suggestedName).toBeUndefined();
      }
    });

    it('returns CONFLICT without a suggestion when no free name is found', async () => {
      const { store, service } = setup();
      store.moveIntoRoot.mockResolvedValue({
        ok: false,
        error: { code: 'CONFLICT', message: 'nas_storage.error.conflict' },
      });
      store.statEntry.mockResolvedValue({ ok: true, value: fileEntry('x') });

      const result = await service.putFile(putInput());

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CONFLICT');
        expect(result.error.suggestedName).toBeUndefined();
      }
    });

    it('passes a non-CONFLICT store error through', async () => {
      const { store, service } = setup();
      store.moveIntoRoot.mockResolvedValue({
        ok: false,
        error: {
          code: 'OUT_OF_ROOT',
          message: 'nas_storage.error.out_of_root',
        },
      });

      const result = await service.putFile(putInput());

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('OUT_OF_ROOT');
      }
      expect(store.statEntry).not.toHaveBeenCalled();
    });
  });

  describe('createFolder / rename / deleteEntry pass-through', () => {
    it('createFolder delegates to store.mkdir', async () => {
      const { store, service } = setup();
      const entry = dirEntry('sub');
      store.mkdir.mockResolvedValue({ ok: true, value: entry });

      const result = await service.createFolder('/docs', 'sub');

      expect(store.mkdir).toHaveBeenCalledWith('/docs', 'sub');
      expect(result).toEqual({ ok: true, value: entry });
    });

    it('rename delegates to store.move', async () => {
      const { store, service } = setup();
      const entry = fileEntry('b.pdf');
      store.move.mockResolvedValue({ ok: true, value: entry });

      const result = await service.rename('/docs/a.pdf', '/docs/b.pdf', true);

      expect(store.move).toHaveBeenCalledWith(
        '/docs/a.pdf',
        '/docs/b.pdf',
        true,
      );
      expect(result).toEqual({ ok: true, value: entry });
    });

    it('deleteEntry delegates to store.remove', async () => {
      const { store, service } = setup();
      store.remove.mockResolvedValue({ ok: true, value: undefined });

      const result = await service.deleteEntry('/docs/a.pdf', true);

      expect(store.remove).toHaveBeenCalledWith('/docs/a.pdf', true);
      expect(result.ok).toBe(true);
    });
  });

  describe('beginChunkedUpload', () => {
    it('delegates to registry.begin with the mapped session args and returns its result', async () => {
      const { registry, store, service } = setup();
      registry.begin.mockResolvedValue({
        ok: true,
        value: { uploadId: 'up-1', chunkSize: 8 * 1024 * 1024 },
      });

      const result = await service.beginChunkedUpload(beginInput());

      expect(store.statEntry).toHaveBeenCalledWith('/docs/big.zip');
      expect(registry.begin).toHaveBeenCalledWith({
        userId: 'user-1',
        dirLogicalPath: '/docs',
        targetName: 'big.zip',
        totalBytes: 42,
        overwrite: false,
      });
      expect(result).toEqual({
        ok: true,
        value: { uploadId: 'up-1', chunkSize: 8 * 1024 * 1024 },
      });
    });

    it('rejects a declared size over the configured limit with TOO_LARGE + limitBytes and never calls the registry', async () => {
      const { registry, service } = setup(true, 100);

      const result = await service.beginChunkedUpload(
        beginInput({ totalBytes: 200 }),
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('TOO_LARGE');
        expect(result.error.limitBytes).toBe(100);
      }
      expect(registry.begin).not.toHaveBeenCalled();
    });

    it('allows a declared size exactly at the limit', async () => {
      const { registry, service } = setup(true, 100);
      registry.begin.mockResolvedValue({
        ok: true,
        value: { uploadId: 'up-1', chunkSize: 1 },
      });

      const result = await service.beginChunkedUpload(
        beginInput({ totalBytes: 100 }),
      );

      expect(result.ok).toBe(true);
      expect(registry.begin).toHaveBeenCalled();
    });

    it('rejects a destination path that escapes the root and never calls the registry', async () => {
      const { registry, store, service } = setup();
      store.statEntry.mockResolvedValue({
        ok: false,
        error: {
          code: 'OUT_OF_ROOT',
          message: 'nas_storage.error.out_of_root',
        },
      });

      const result = await service.beginChunkedUpload(
        beginInput({ dirLogicalPath: '/../etc', targetName: 'passwd' }),
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('OUT_OF_ROOT');
      }
      expect(registry.begin).not.toHaveBeenCalled();
    });

    it('proceeds when the destination already exists (conflict is handled on complete)', async () => {
      const { registry, store, service } = setup();
      store.statEntry.mockResolvedValue({
        ok: true,
        value: fileEntry('big.zip'),
      });
      registry.begin.mockResolvedValue({
        ok: true,
        value: { uploadId: 'up-1', chunkSize: 1 },
      });

      const result = await service.beginChunkedUpload(beginInput());

      expect(result.ok).toBe(true);
      expect(registry.begin).toHaveBeenCalled();
    });

    it('returns STORAGE_UNAVAILABLE without touching the registry when the root is not ready', async () => {
      const { registry, store, service } = setup(false);

      const result = await service.beginChunkedUpload(beginInput());

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('STORAGE_UNAVAILABLE');
      }
      expect(store.statEntry).not.toHaveBeenCalled();
      expect(registry.begin).not.toHaveBeenCalled();
    });
  });

  describe('appendChunk', () => {
    it('delegates to registry.append with the same args', async () => {
      const { registry, service } = setup();
      const chunk = new PassThrough();
      registry.append.mockResolvedValue({
        ok: true,
        value: { receivedBytes: 16 },
      });

      const result = await service.appendChunk('up-1', 'user-1', 0, chunk);

      expect(registry.append).toHaveBeenCalledWith('up-1', 'user-1', 0, chunk);
      expect(result).toEqual({ ok: true, value: { receivedBytes: 16 } });
    });

    it('returns STORAGE_UNAVAILABLE without touching the registry when the root is not ready', async () => {
      const { registry, service } = setup(false);

      const result = await service.appendChunk(
        'up-1',
        'user-1',
        0,
        new PassThrough(),
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('STORAGE_UNAVAILABLE');
      }
      expect(registry.append).not.toHaveBeenCalled();
    });
  });

  describe('completeChunkedUpload', () => {
    it('passes a successful finalized entry through', async () => {
      const { registry, service } = setup();
      const entry = fileEntry('big.zip');
      registry.complete.mockResolvedValue({ ok: true, value: entry });

      const result = await service.completeChunkedUpload('up-1', 'user-1');

      expect(registry.complete).toHaveBeenCalledWith('up-1', 'user-1');
      expect(result).toEqual({ ok: true, value: entry });
    });

    it('passes a CONFLICT from the registry through', async () => {
      const { registry, service } = setup();
      registry.complete.mockResolvedValue({
        ok: false,
        error: { code: 'CONFLICT', message: 'nas_storage.error.conflict' },
      });

      const result = await service.completeChunkedUpload('up-1', 'user-1');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CONFLICT');
      }
    });

    it('returns STORAGE_UNAVAILABLE without touching the registry when the root is not ready', async () => {
      const { registry, service } = setup(false);

      const result = await service.completeChunkedUpload('up-1', 'user-1');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('STORAGE_UNAVAILABLE');
      }
      expect(registry.complete).not.toHaveBeenCalled();
    });

    it('logs an error when the registry returns a failure', async () => {
      const { registry, logger, service } = setup();
      registry.complete.mockResolvedValue({
        ok: false,
        error: {
          code: 'UPLOAD_SESSION_NOT_FOUND',
          message: 'nas_storage.error.upload_session_not_found',
        },
      });

      await service.completeChunkedUpload('up-1', 'user-1');

      expect(logger.error).toHaveBeenCalled();
      const [detail, message] = logger.error.mock.calls[0];
      expect(String(message)).toContain('completeChunkedUpload');
      expect(detail).toMatchObject({ errorCode: 'UPLOAD_SESSION_NOT_FOUND' });
    });
  });

  describe('abortChunkedUpload', () => {
    it('delegates to registry.abort with the same args', async () => {
      const { registry, service } = setup();
      registry.abort.mockResolvedValue({ ok: true, value: undefined });

      const result = await service.abortChunkedUpload('up-1', 'user-1');

      expect(registry.abort).toHaveBeenCalledWith('up-1', 'user-1');
      expect(result.ok).toBe(true);
    });

    it('returns STORAGE_UNAVAILABLE without touching the registry when the root is not ready', async () => {
      const { registry, service } = setup(false);

      const result = await service.abortChunkedUpload('up-1', 'user-1');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('STORAGE_UNAVAILABLE');
      }
      expect(registry.abort).not.toHaveBeenCalled();
    });
  });

  describe('error logging', () => {
    it('logs an error with the op name and detail when the store returns a failure', async () => {
      const { store, logger, service } = setup();
      store.list.mockResolvedValue({
        ok: false,
        error: {
          code: 'PERMISSION_DENIED',
          message: 'nas_storage.error.permission_denied',
        },
      });

      await service.listFolder('/docs', listQuery);

      expect(logger.error).toHaveBeenCalled();
      const [detail, message] = logger.error.mock.calls[0];
      expect(String(message)).toContain('listFolder');
      expect(detail).toMatchObject({ errorCode: 'PERMISSION_DENIED' });
    });

    it('logs and returns a normalized error when the store rejects, never throwing', async () => {
      const { store, logger, service } = setup();
      store.remove.mockRejectedValue(
        Object.assign(new Error('boom'), { code: 'EACCES' }),
      );

      const result = await service.deleteEntry('/docs/a.pdf', false);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PERMISSION_DENIED');
        expect(result.error.message).toBe(
          'nas_storage.error.permission_denied',
        );
      }
      expect(logger.error).toHaveBeenCalled();
    });

    it('does not leak raw detail into the returned error message', async () => {
      const { store, service } = setup();
      store.openRead.mockRejectedValue(
        Object.assign(new Error('/absolute/nas/path ENOENT'), {
          code: 'ENOENT',
        }),
      );

      const result = await service.download('/docs/a.pdf');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe('nas_storage.error.not_found');
      }
    });
  });
});
