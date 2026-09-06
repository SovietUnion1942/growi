import type { FC } from 'react';
import { useTranslation } from 'react-i18next';

type Props = {
  /** The wiki name (app title). */
  appTitle: string;
};

/**
 * The `/home` hero region (Requirement 7.1): page chrome shown to every
 * visitor — logged-in users and anonymous guests alike — presenting the wiki
 * name prominently with a short description line beneath it. Pure presentation:
 * no fetching, no state.
 */
export const HomeHero: FC<Props> = ({ appTitle }) => {
  const { t } = useTranslation();

  return (
    <section className="grw-home-hero my-4">
      <h1 className="mb-2">{appTitle}</h1>
      <p className="text-muted mb-0">{t('home.welcome')}</p>
    </section>
  );
};
