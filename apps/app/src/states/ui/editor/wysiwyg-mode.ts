import { atom, useAtom } from 'jotai';

/**
 * 編集画面の WYSIWYG(ビジュアル)モードのオン/オフ。
 * EditorMode と同様サーバ非永続。編集セッション内のみ有効。
 */
const wysiwygEnabledAtom = atom<boolean>(false);

type UseWysiwygModeReturn = {
  isWysiwygMode: boolean;
  setWysiwygMode: (enabled: boolean) => void;
};

export const useWysiwygMode = (): UseWysiwygModeReturn => {
  const [isWysiwygMode, setWysiwygMode] = useAtom(wysiwygEnabledAtom);
  return { isWysiwygMode, setWysiwygMode };
};
