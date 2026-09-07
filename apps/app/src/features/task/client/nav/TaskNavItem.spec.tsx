import { render, screen } from '@testing-library/react';

import { TaskNavItem } from './TaskNavItem';

const mocks = vi.hoisted(() => ({
  useAtomValue: vi.fn(),
  useIsGuestUser: vi.fn(),
}));

vi.mock('jotai', () => ({ useAtomValue: mocks.useAtomValue }));
vi.mock('~/states/context', () => ({ useIsGuestUser: mocks.useIsGuestUser }));
vi.mock('~/states/server-configurations', () => ({
  taskEnabledAtom: { debugLabel: 'taskEnabledAtom' },
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

beforeEach(() => {
  mocks.useAtomValue.mockReturnValue(true);
  mocks.useIsGuestUser.mockReturnValue(false);
});

describe('TaskNavItem', () => {
  it('renders a link to /_tasks when the feature is enabled and the user is not a guest', () => {
    render(<TaskNavItem />);

    const link = screen.getByRole('link', { name: 'task.nav_label' });
    expect(link).toHaveAttribute('href', '/_tasks');
  });

  it('renders nothing when the task feature is disabled', () => {
    mocks.useAtomValue.mockReturnValue(false);

    const { container } = render(<TaskNavItem />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a guest user even when the feature is enabled', () => {
    mocks.useIsGuestUser.mockReturnValue(true);

    const { container } = render(<TaskNavItem />);

    expect(container).toBeEmptyDOMElement();
  });
});
