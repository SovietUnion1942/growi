// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { HomeHero } from './HomeHero';

describe('HomeHero', () => {
  it('renders the wiki name as a heading', () => {
    render(<HomeHero appTitle="My Wiki" />);

    expect(
      screen.getByRole('heading', { name: 'My Wiki' }),
    ).toBeInTheDocument();
  });

  it('renders a short description line under the name', () => {
    render(<HomeHero appTitle="My Wiki" />);

    // the i18n mock echoes the key back
    expect(screen.getByText('home.welcome')).toBeInTheDocument();
  });
});
