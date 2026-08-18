import type { JSX } from 'react';

import { LightBox } from '~/client/components/ReactMarkdownComponents/LightBox';
import { getMessageAttachmentUrl } from '~/stores/messages';

type Props = {
  attachmentId: string;
};

export const MessageImage = (props: Props): JSX.Element => {
  const { attachmentId } = props;

  return (
    <LightBox
      src={getMessageAttachmentUrl(attachmentId)}
      alt="送信された画像"
      style={{
        maxWidth: '240px',
        maxHeight: '240px',
        borderRadius: '8px',
        display: 'block',
      }}
    />
  );
};
