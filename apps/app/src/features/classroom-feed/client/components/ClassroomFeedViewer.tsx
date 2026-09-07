import type { JSX } from 'react';
import Link from 'next/link';
import { format } from 'date-fns/format';

import RevisionRenderer from '~/components/PageView/RevisionRenderer';
import { useTimelineOptions } from '~/stores/renderer';

import { useClassroomFeed } from '../stores/use-classroom-feed';

type Props = {
  prefix: string;
  limit?: string;
};

/**
 * Renders `::classroomfeed{prefix=... limit=...}` — recent descendant pages
 * under `prefix`, newest first, WITH body text (unlike `lsx`, which only
 * lists titles/links). Data comes live from GROWI's own Page/Revision
 * collections via `useClassroomFeed`; nothing is cached outside GROWI.
 */
export const ClassroomFeedViewer = ({ prefix, limit }: Props): JSX.Element => {
  const parsedLimit = limit != null && limit !== '' ? Number(limit) : undefined;
  const {
    data: items,
    error,
    isLoading,
  } = useClassroomFeed(prefix, parsedLimit);
  const { data: rendererOptions } = useTimelineOptions(prefix);

  if (error != null) {
    return (
      <div className="text-warning small">
        classroomfeed: 取得に失敗しました({error.message})
      </div>
    );
  }
  if (isLoading || rendererOptions == null) {
    return <div className="text-muted small">読み込み中...</div>;
  }
  if (items == null || items.length === 0) {
    return <div className="text-muted small">まだ何もありません。</div>;
  }

  return (
    <div className="classroom-feed">
      {items.map((item) => (
        <div key={item.path} className="classroom-feed-item mb-4">
          <div className="d-flex justify-content-between align-items-baseline mb-1">
            <Link href={item.path} prefetch={false}>
              {item.path}
            </Link>
            <span className="text-muted small">
              {format(new Date(item.createdAt), 'yyyy/MM/dd HH:mm')}
            </span>
          </div>
          <RevisionRenderer
            rendererOptions={rendererOptions}
            markdown={item.body}
          />
          <hr />
        </div>
      ))}
    </div>
  );
};
