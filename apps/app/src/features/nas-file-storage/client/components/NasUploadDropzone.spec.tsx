import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CHUNK_UPLOAD_THRESHOLD_BYTES } from '../hooks/use-nas-chunked-upload';
import { NasUploadDropzone, validateNasUploadName } from './NasUploadDropzone';

const mocks = vi.hoisted(() => ({
  uploadFile: vi.fn(),
  uploadLargeFile: vi.fn(),
}));

vi.mock('../hooks/use-nas-entry-actions', () => ({
  useNasEntryActions: () => ({
    uploadFile: mocks.uploadFile,
    createFolder: vi.fn(),
    rename: vi.fn(),
    move: vi.fn(),
    remove: vi.fn(),
  }),
}));

vi.mock('../hooks/use-nas-chunked-upload', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../hooks/use-nas-chunked-upload')>();
  return {
    ...actual,
    useNasChunkedUpload: () => ({ uploadLargeFile: mocks.uploadLargeFile }),
  };
});

const makeLargeFile = (name: string): File => {
  const file = new File(['x'], name, { type: 'application/octet-stream' });
  Object.defineProperty(file, 'size', {
    value: CHUNK_UPLOAD_THRESHOLD_BYTES + 1,
  });
  return file;
};

vi.mock('next-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en_US' },
  }),
}));

const makeFile = (name: string): File =>
  new File(['content'], name, { type: 'text/plain' });

const dropFiles = (files: File[]): void => {
  const input = screen.getByTestId('nas-upload-input');
  fireEvent.change(input, { target: { files } });
};

class NasRequestErrorStub extends Error {
  code: string;
  suggestedName?: string;
  limitBytes?: number;

  constructor(shape: {
    code: string;
    suggestedName?: string;
    limitBytes?: number;
  }) {
    super(shape.code);
    this.code = shape.code;
    this.suggestedName = shape.suggestedName;
    this.limitBytes = shape.limitBytes;
  }
}

beforeEach(() => {
  mocks.uploadFile.mockReset();
  mocks.uploadLargeFile.mockReset();
});

describe('validateNasUploadName', () => {
  it('accepts a normal name and rejects empty / dots / separators / over-length', () => {
    expect(validateNasUploadName('report.pdf')).toBeNull();
    expect(validateNasUploadName('   ')).toMatch(/invalid_name/);
    expect(validateNasUploadName('..')).toMatch(/invalid_name/);
    expect(validateNasUploadName('a/b.txt')).toMatch(/invalid_name_separator/);
    expect(validateNasUploadName('a\\b.txt')).toMatch(/invalid_name_separator/);
    expect(validateNasUploadName(`${'a'.repeat(256)}.txt`)).toMatch(
      /invalid_name_length/,
    );
  });
});

describe('NasUploadDropzone', () => {
  it('uploads a selected valid file once and fires onUploaded on success', async () => {
    mocks.uploadFile.mockResolvedValue({ name: 'a.txt', type: 'file' });
    const onUploaded = vi.fn();

    render(
      <NasUploadDropzone currentDirPath="/docs" onUploaded={onUploaded} />,
    );
    dropFiles([makeFile('a.txt')]);

    await waitFor(() => expect(mocks.uploadFile).toHaveBeenCalledTimes(1));
    expect(mocks.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'a.txt' }),
      undefined,
    );
    expect(
      await screen.findByText('nas_storage.upload.status_done'),
    ).toBeInTheDocument();
    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1));
  });

  it('rejects an invalid file name client-side and never uploads it', async () => {
    const onUploaded = vi.fn();
    render(<NasUploadDropzone currentDirPath="/" onUploaded={onUploaded} />);

    // NOTE: a path separator cannot be carried in a File name in this DOM impl
    // (it is sanitised on construction), so the separator branch is exercised by
    // the unit-level rule only; here we cover the constructible invalid cases.
    dropFiles([
      new File([''], '', { type: 'text/plain' }),
      makeFile('..'),
      makeFile(`${'a'.repeat(300)}.txt`),
    ]);

    await screen.findAllByText(/nas_storage\.upload\.invalid_name/);
    expect(mocks.uploadFile).not.toHaveBeenCalled();
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it('uploads multiple files sequentially, one call per file, in order', async () => {
    let active = 0;
    let maxActive = 0;
    mocks.uploadFile.mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      return { name: 'x', type: 'file' };
    });

    render(<NasUploadDropzone currentDirPath="/" />);
    dropFiles([makeFile('a.txt'), makeFile('b.txt'), makeFile('c.txt')]);

    await waitFor(() => expect(mocks.uploadFile).toHaveBeenCalledTimes(3));
    expect(mocks.uploadFile.mock.calls.map((c) => (c[0] as File).name)).toEqual(
      ['a.txt', 'b.txt', 'c.txt'],
    );
    expect(maxActive).toBe(1);
  });

  it('on CONFLICT shows a prompt and never auto-overwrites', async () => {
    mocks.uploadFile.mockRejectedValueOnce(
      new NasRequestErrorStub({ code: 'CONFLICT', suggestedName: 'a (1).txt' }),
    );

    render(<NasUploadDropzone currentDirPath="/" />);
    dropFiles([makeFile('a.txt')]);

    expect(
      await screen.findByRole('button', {
        name: 'nas_storage.upload.overwrite',
      }),
    ).toBeInTheDocument();
    expect(mocks.uploadFile).toHaveBeenCalledTimes(1);
  });

  it('resolves a CONFLICT by overwrite', async () => {
    mocks.uploadFile
      .mockRejectedValueOnce(
        new NasRequestErrorStub({
          code: 'CONFLICT',
          suggestedName: 'a (1).txt',
        }),
      )
      .mockResolvedValueOnce({ name: 'a.txt', type: 'file' });
    const onUploaded = vi.fn();

    render(<NasUploadDropzone currentDirPath="/" onUploaded={onUploaded} />);
    dropFiles([makeFile('a.txt')]);

    await userEvent.click(
      await screen.findByRole('button', {
        name: 'nas_storage.upload.overwrite',
      }),
    );

    await waitFor(() =>
      expect(mocks.uploadFile).toHaveBeenLastCalledWith(
        expect.objectContaining({ name: 'a.txt' }),
        { overwrite: true },
      ),
    );
    await waitFor(() => expect(onUploaded).toHaveBeenCalled());
  });

  it('resolves a CONFLICT by save-as suggestedName', async () => {
    mocks.uploadFile
      .mockRejectedValueOnce(
        new NasRequestErrorStub({
          code: 'CONFLICT',
          suggestedName: 'a (1).txt',
        }),
      )
      .mockResolvedValueOnce({ name: 'a (1).txt', type: 'file' });

    render(<NasUploadDropzone currentDirPath="/" />);
    dropFiles([makeFile('a.txt')]);

    await userEvent.click(
      await screen.findByRole('button', { name: 'nas_storage.upload.save_as' }),
    );

    await waitFor(() =>
      expect(mocks.uploadFile).toHaveBeenLastCalledWith(
        expect.objectContaining({ name: 'a.txt' }),
        { name: 'a (1).txt' },
      ),
    );
  });

  it('resolves a CONFLICT by skip without further upload calls', async () => {
    mocks.uploadFile.mockRejectedValueOnce(
      new NasRequestErrorStub({ code: 'CONFLICT', suggestedName: 'a (1).txt' }),
    );

    render(<NasUploadDropzone currentDirPath="/" />);
    dropFiles([makeFile('a.txt')]);

    await userEvent.click(
      await screen.findByRole('button', { name: 'nas_storage.upload.skip' }),
    );

    expect(
      await screen.findByText('nas_storage.upload.status_skipped'),
    ).toBeInTheDocument();
    expect(mocks.uploadFile).toHaveBeenCalledTimes(1);
  });

  it('on TOO_LARGE shows the limit and does not retry', async () => {
    mocks.uploadFile.mockRejectedValueOnce(
      new NasRequestErrorStub({ code: 'TOO_LARGE', limitBytes: 10485760 }),
    );

    render(<NasUploadDropzone currentDirPath="/" />);
    dropFiles([makeFile('big.txt')]);

    expect(
      await screen.findByText(/nas_storage\.error\.too_large/),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/10\.5 MB|10\.49 MB|10485760/),
    ).toBeInTheDocument();
    expect(mocks.uploadFile).toHaveBeenCalledTimes(1);
  });

  it('does not fire onUploaded when no file succeeds', async () => {
    mocks.uploadFile.mockRejectedValue(
      new NasRequestErrorStub({ code: 'TOO_LARGE', limitBytes: 1 }),
    );
    const onUploaded = vi.fn();

    render(<NasUploadDropzone currentDirPath="/" onUploaded={onUploaded} />);
    dropFiles([makeFile('big.txt')]);

    await screen.findByText(/nas_storage\.error\.too_large/);
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it('routes a file over the threshold through the chunked path', async () => {
    mocks.uploadLargeFile.mockResolvedValue({ name: 'big.bin', type: 'file' });
    const onUploaded = vi.fn();

    render(
      <NasUploadDropzone currentDirPath="/docs" onUploaded={onUploaded} />,
    );
    dropFiles([makeLargeFile('big.bin')]);

    await waitFor(() => expect(mocks.uploadLargeFile).toHaveBeenCalledTimes(1));
    expect(mocks.uploadLargeFile).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'big.bin' }),
      undefined,
    );
    expect(mocks.uploadFile).not.toHaveBeenCalled();
    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1));
  });

  it('keeps a sub-threshold file on the single-shot path', async () => {
    mocks.uploadFile.mockResolvedValue({ name: 'a.txt', type: 'file' });

    render(<NasUploadDropzone currentDirPath="/" />);
    dropFiles([makeFile('a.txt')]);

    await waitFor(() => expect(mocks.uploadFile).toHaveBeenCalledTimes(1));
    expect(mocks.uploadLargeFile).not.toHaveBeenCalled();
  });

  it('surfaces a chunked-upload CONFLICT with the same overwrite/save-as/skip UI', async () => {
    mocks.uploadLargeFile.mockRejectedValueOnce(
      new NasRequestErrorStub({
        code: 'CONFLICT',
        suggestedName: 'big (1).bin',
      }),
    );

    render(<NasUploadDropzone currentDirPath="/" />);
    dropFiles([makeLargeFile('big.bin')]);

    expect(
      await screen.findByRole('button', {
        name: 'nas_storage.upload.overwrite',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'nas_storage.upload.save_as' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'nas_storage.upload.skip' }),
    ).toBeInTheDocument();
  });

  it('shows an error row when a chunked upload fails', async () => {
    mocks.uploadLargeFile.mockRejectedValueOnce(new Error('network lost'));

    render(<NasUploadDropzone currentDirPath="/" />);
    dropFiles([makeLargeFile('big.bin')]);

    expect(
      await screen.findByText('nas_storage.upload.status_error'),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/nas_storage\.error\.upload_failed/),
    ).toBeInTheDocument();
  });

  it('does not render the folder affordance without onFolderSelected', () => {
    render(<NasUploadDropzone currentDirPath="/" />);
    expect(screen.queryByTestId('nas-folder-select')).not.toBeInTheDocument();
  });

  it('forwards a webkitdirectory selection to onFolderSelected', async () => {
    const onFolderSelected = vi.fn();
    const clickSpy = vi
      .spyOn(HTMLInputElement.prototype, 'click')
      .mockImplementation(() => undefined);

    render(
      <NasUploadDropzone
        currentDirPath="/"
        onFolderSelected={onFolderSelected}
      />,
    );

    const button = screen.getByTestId('nas-folder-select');
    const input = screen.getByTestId('nas-folder-input');
    expect(input).toHaveAttribute('webkitdirectory');

    await userEvent.click(button);
    expect(clickSpy).toHaveBeenCalledTimes(1);

    const files = [makeFile('a.txt'), makeFile('b.txt')];
    fireEvent.change(input, { target: { files } });

    expect(onFolderSelected).toHaveBeenCalledTimes(1);
    expect(onFolderSelected).toHaveBeenCalledWith({
      kind: 'input',
      files: expect.arrayContaining([
        expect.objectContaining({ name: 'a.txt' }),
        expect.objectContaining({ name: 'b.txt' }),
      ]),
    });

    clickSpy.mockRestore();
  });

  it('forwards a directory handle when the File System Access API is available', async () => {
    const onFolderSelected = vi.fn();
    const handle = { kind: 'directory', name: 'photos' };
    const showDirectoryPicker = vi.fn().mockResolvedValue(handle);
    vi.stubGlobal('showDirectoryPicker', showDirectoryPicker);

    render(
      <NasUploadDropzone
        currentDirPath="/"
        onFolderSelected={onFolderSelected}
      />,
    );

    await userEvent.click(screen.getByTestId('nas-folder-select'));

    await waitFor(() =>
      expect(onFolderSelected).toHaveBeenCalledWith({ kind: 'handle', handle }),
    );

    vi.unstubAllGlobals();
  });
});
