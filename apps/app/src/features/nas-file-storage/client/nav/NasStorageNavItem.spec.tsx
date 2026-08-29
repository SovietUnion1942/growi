import { render, screen } from '@testing-library/react';

import { NasStorageNavItem } from './NasStorageNavItem';

const mocks = vi.hoisted(() => ({
  useAtomValue: vi.fn(),
  useIsGuestUser: vi.fn(),
}));

vi.mock('jotai', () => ({ useAtomValue: mocks.useAtomValue }));
vi.mock('~/states/context', () => ({ useIsGuestUser: mocks.useIsGuestUser }));
vi.mock('~/states/server-configurations', () => ({
  nasStorageEnabledAtom: { debugLabel: 'nasStorageEnabledAtom' },
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

beforeEach(() => {
  mocks.useAtomValue.mockReturnValue(true);
  mocks.useIsGuestUser.mockReturnValue(false);
});

describe('NasStorageNavItem', () => {
  it('renders a link to /nas when NAS storage is enabled and the user is not a guest', () => {
    render(<NasStorageNavItem />);

    const link = screen.getByRole('link', { name: 'nas_storage.nav_label' });
    expect(link).toHaveAttribute('href', '/nas');
  });

  it('renders nothing when NAS storage is disabled', () => {
    mocks.useAtomValue.mockReturnValue(false);

    const { container } = render(<NasStorageNavItem />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a guest user even when NAS storage is enabled', () => {
    mocks.useIsGuestUser.mockReturnValue(true);

    const { container } = render(<NasStorageNavItem />);

    expect(container).toBeEmptyDOMElement();
  });
});
