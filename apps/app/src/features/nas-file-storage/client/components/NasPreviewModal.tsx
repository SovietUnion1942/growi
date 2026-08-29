import type { FC } from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'next-i18next';
import {
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Spinner,
} from 'reactstrap';

import type { NasEntry } from '~/features/nas-file-storage/interfaces';
import axios from '~/utils/axios';

import { buildNasFileUrl } from '../hooks/use-nas-preview';
import { getNasPreviewKind } from '../util/nas-preview-kind';

/** First slice fetched for a text preview: 256 KiB. */
const TEXT_PREVIEW_BYTES = 262144;

const MEDIA_STYLE = { maxWidth: '100%', maxHeight: '70vh' } as const;

/**
 * Parse the `Content-Range` response header (`bytes START-END/TOTAL`) and decide
 * whether the fetched slice is only the head of a larger file. Compares the
 * range END against TOTAL (both byte offsets) rather than the decoded string
 * length, so a multibyte file whose byte count exceeds its character count is
 * not falsely flagged as truncated.
 */
const isTextTruncated = (contentRange: string | undefined): boolean => {
  if (contentRange == null) {
    return false;
  }
  const match = /bytes\s+\d+-(\d+)\/(\d+)/i.exec(contentRange);
  if (match == null) {
    return false;
  }
  const end = Number(match[1]);
  const total = Number(match[2]);
  // END is the last byte index delivered; the file is truncated iff more bytes remain.
  return end + 1 < total;
};

type TextState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; text: string; truncated: boolean };

const NasTextPreview: FC<{ url: string }> = ({ url }) => {
  const { t } = useTranslation();
  const [state, setState] = useState<TextState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    axios
      .get<string>(url, {
        responseType: 'text',
        headers: { Range: `bytes=0-${TEXT_PREVIEW_BYTES - 1}` },
        // Bypass the shared instance's date-coercing transform for raw text.
        transformResponse: [(data: unknown) => data],
      })
      .then((res) => {
        if (cancelled) {
          return;
        }
        const text = typeof res.data === 'string' ? res.data : String(res.data);
        setState({
          status: 'ready',
          text,
          truncated: isTextTruncated(
            res.headers?.['content-range'] as string | undefined,
          ),
        });
      })
      .catch(() => {
        if (!cancelled) {
          setState({ status: 'error' });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  if (state.status === 'loading') {
    return (
      <Spinner data-testid="nas-preview-text-loading">
        {t('nas_storage.preview.loading')}
      </Spinner>
    );
  }
  if (state.status === 'error') {
    return (
      <p className="text-danger" data-testid="nas-preview-error">
        {t('nas_storage.preview.error')}
      </p>
    );
  }

  return (
    <>
      {state.truncated && (
        <p
          className="text-body-secondary small"
          data-testid="nas-preview-truncated"
        >
          {t('nas_storage.preview.truncated')}
        </p>
      )}
      <pre
        data-testid="nas-preview-text"
        style={{ maxHeight: '70vh', overflow: 'auto', whiteSpace: 'pre-wrap' }}
      >
        {state.text}
      </pre>
    </>
  );
};

export interface NasPreviewModalProps {
  /** File to preview. `null` closes (unmounts) the modal. */
  entry: NasEntry | null;
  /** Logical path of `entry`; built by the caller like the download control. */
  logicalPath: string | null;
  onClose: () => void;
}

/**
 * Type-aware preview modal for a NAS file (Req 9.1/9.3/9.5). Media is streamed
 * straight from the inline file endpoint (the browser negotiates Range for
 * video/audio seeking); PDF is isolated in a `<iframe sandbox>`; text is
 * range-fetched (first 256 KiB) and flagged as truncated when the file is
 * larger. A plain (attachment) download link is always present as the escape
 * hatch.
 */
export const NasPreviewModal: FC<NasPreviewModalProps> = ({
  entry,
  logicalPath,
  onClose,
}) => {
  const { t } = useTranslation();

  if (entry == null || logicalPath == null) {
    return null;
  }

  const inlineUrl = buildNasFileUrl(logicalPath, { inline: true });
  const downloadUrl = buildNasFileUrl(logicalPath);
  const kind = getNasPreviewKind(entry.name);

  return (
    <Modal
      isOpen
      size="xl"
      scrollable
      toggle={onClose}
      data-testid="nas-preview-modal"
    >
      <ModalHeader tag="h4" toggle={onClose}>
        {entry.name}
      </ModalHeader>
      <ModalBody className="text-center">
        {kind === 'image' && (
          // biome-ignore lint/performance/noImgElement: previewing an arbitrary NAS file, not a bundled asset
          <img
            data-testid="nas-preview-image"
            src={inlineUrl}
            alt={entry.name}
            style={{ ...MEDIA_STYLE, objectFit: 'contain' }}
          />
        )}
        {kind === 'video' && (
          // biome-ignore lint/a11y/useMediaCaption: user-supplied media has no caption track
          <video
            data-testid="nas-preview-video"
            src={inlineUrl}
            controls
            style={MEDIA_STYLE}
          />
        )}
        {kind === 'audio' && (
          // biome-ignore lint/a11y/useMediaCaption: user-supplied media has no caption track
          <audio data-testid="nas-preview-audio" src={inlineUrl} controls />
        )}
        {kind === 'pdf' && (
          <iframe
            data-testid="nas-preview-pdf"
            title={entry.name}
            src={inlineUrl}
            sandbox=""
            style={{ width: '100%', height: '70vh', border: 0 }}
          />
        )}
        {kind === 'text' && (
          <div className="text-start">
            <NasTextPreview url={inlineUrl} />
          </div>
        )}
        {kind == null && (
          <p data-testid="nas-preview-unsupported">
            {t('nas_storage.preview.not_supported')}
          </p>
        )}
      </ModalBody>
      <ModalFooter>
        <a
          data-testid="nas-preview-download"
          className="btn btn-outline-secondary"
          href={downloadUrl}
        >
          {t('nas_storage.preview.download')}
        </a>
      </ModalFooter>
    </Modal>
  );
};
