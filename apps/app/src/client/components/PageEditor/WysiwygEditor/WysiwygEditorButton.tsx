import type { JSX } from 'react';

import { useWysiwygMode } from '~/states/ui/editor';

/**
 * 編集画面下部ナビの「ビジュアル編集 / ソースに戻す」トグルボタン。
 */
export const WysiwygEditorButton = (): JSX.Element => {
  const { isWysiwygMode, setWysiwygMode } = useWysiwygMode();

  return (
    <button
      type="button"
      className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
      onClick={() => setWysiwygMode(!isWysiwygMode)}
      aria-pressed={isWysiwygMode}
    >
      <span className="material-symbols-outlined fs-6">
        {isWysiwygMode ? 'code' : 'edit_note'}
      </span>
      {isWysiwygMode ? 'ソースに戻す' : 'ビジュアル編集'}
    </button>
  );
};
