import { useCallback, useEffect, useState } from 'react';

type UseImageAttachmentResult = {
  file: File | null;
  previewUrl: string | null;
  select: (file: File) => void;
  clear: () => void;
};

export const useImageAttachment = (): UseImageAttachmentResult => {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Revoke the previous object URL whenever it's replaced or the component
  // unmounts, so picking several images in a row doesn't leak blob URLs.
  useEffect(() => {
    return () => {
      if (previewUrl != null) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const select = useCallback((selected: File) => {
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
  }, []);

  const clear = useCallback(() => {
    setFile(null);
    setPreviewUrl(null);
  }, []);

  return {
    file,
    previewUrl,
    select,
    clear,
  };
};
