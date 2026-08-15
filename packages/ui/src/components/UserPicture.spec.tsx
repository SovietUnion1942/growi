import { render, screen } from '@testing-library/react';

/**
 * Unit tests for the refactored UserPicture component.
 *
 * Task 20.3 — UserPicture tooltip refactoring
 * Requirements: 7.1, 7.3, 7.4, 7.5
 *
 * Key structural invariant:
 *   Before refactor: withTooltip HOC returns a Fragment
 *     → two sibling elements in the container (<span> + <Tooltip>)
 *   After refactor: tooltip is a child of the root <span>
 *     → exactly one child element in the container
 */

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

// Mock next/dynamic to return a synchronous stub component.
// This makes the dynamically-loaded UncontrolledTooltip testable without
// async chunk loading or portals in the test environment.
vi.mock('next/dynamic', () => ({
  default: (_importFn: () => Promise<unknown>, _opts?: unknown) => {
    // The stub renders its children inline so we can inspect tooltip content.
    const Stub = ({ children }: { children?: React.ReactNode }) => (
      <span data-testid="mock-tooltip">{children}</span>
    );
    return Stub;
  },
}));

vi.mock('next/router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// Component under test (imported AFTER mocks are in place)
// ---------------------------------------------------------------------------

import { UserPicture, type UserPictureBadge } from './UserPicture.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeUser = (overrides?: object) => ({
  name: 'Alice',
  username: 'alice',
  imageUrlCached: '/avatar.png',
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UserPicture — Task 20.3 (tooltip refactoring, req 7.1, 7.3, 7.4)', () => {
  describe('Req 7.3 / 7.4 — single root element (no Fragment)', () => {
    it('renders exactly one child element in the container when noTooltip is not set', () => {
      const { container } = render(<UserPicture user={makeUser()} noLink />);

      // After HOC removal, exactly ONE root child (the <span>).
      // Before the fix two siblings lived at this level (span + tooltip HOC fragment).
      expect(container.children).toHaveLength(1);
      expect(container.firstElementChild?.tagName).toBe('SPAN');
    });

    it('renders exactly one child element in the container when noTooltip is true', () => {
      const { container } = render(
        <UserPicture user={makeUser()} noLink noTooltip />,
      );

      expect(container.children).toHaveLength(1);
      expect(container.firstElementChild?.tagName).toBe('SPAN');
    });
  });

  describe('Req 7.4 — image rendered inside the root span', () => {
    it('renders the avatar image', () => {
      render(<UserPicture user={makeUser()} noLink />);

      // screen.getByRole throws if not found — implicit assertion of presence
      const img = screen.getByRole('img') as HTMLImageElement;
      expect(img.src).toContain('/avatar.png');
    });

    it('the image is nested inside the root span', () => {
      const { container } = render(<UserPicture user={makeUser()} noLink />);

      const rootSpan = container.firstElementChild;
      expect(rootSpan?.querySelector('img')).not.toBeNull();
    });
  });

  describe('Req 7.1 — tooltip renders when noTooltip is absent', () => {
    it('renders the tooltip stub when noTooltip is not set and user has a name', () => {
      render(<UserPicture user={makeUser()} noLink />);

      expect(screen.queryByTestId('mock-tooltip')).not.toBeNull();
    });

    it('does not render the tooltip stub when noTooltip is true', () => {
      render(<UserPicture user={makeUser()} noLink noTooltip />);

      expect(screen.queryByTestId('mock-tooltip')).toBeNull();
    });

    it('includes @username in tooltip content when username is available', () => {
      render(<UserPicture user={makeUser({ username: 'alice' })} noLink />);

      const tooltip = screen.queryByTestId('mock-tooltip');
      expect(tooltip?.textContent).toContain('@alice');
    });

    it('includes the display name in tooltip content', () => {
      render(<UserPicture user={makeUser({ name: 'Alice' })} noLink />);

      const tooltip = screen.queryByTestId('mock-tooltip');
      expect(tooltip?.textContent).toContain('Alice');
    });
  });

  describe('Req 7.3 — tooltip is nested inside root span (portal child, not sibling)', () => {
    it('tooltip stub is a descendant of the root span (not a sibling)', () => {
      const { container } = render(<UserPicture user={makeUser()} noLink />);

      // Single root child; tooltip stub is inside it
      expect(container.children).toHaveLength(1);
      const rootSpan = container.firstElementChild;
      expect(
        rootSpan?.querySelector('[data-testid="mock-tooltip"]'),
      ).not.toBeNull();
    });
  });
});

describe('UserPicture — Task 4 (badges prop, req 4.1, 4.2)', () => {
  describe('Req 4.2 — no visual change when badges is undefined/empty', () => {
    it('renders no badge elements when badges is not passed', () => {
      const { container } = render(<UserPicture user={makeUser()} noLink />);

      expect(
        container.querySelectorAll('[data-testid="user-picture-badge"]'),
      ).toHaveLength(0);
    });

    it('renders no badge elements when badges is an empty array', () => {
      const { container } = render(
        <UserPicture user={makeUser()} noLink badges={[]} />,
      );

      expect(
        container.querySelectorAll('[data-testid="user-picture-badge"]'),
      ).toHaveLength(0);
    });

    it('still renders exactly one root child and the avatar image when badges is undefined', () => {
      const { container } = render(<UserPicture user={makeUser()} noLink />);

      expect(container.children).toHaveLength(1);
      expect(container.firstElementChild?.tagName).toBe('SPAN');
      expect(screen.getByRole('img')).not.toBeNull();
    });
  });

  describe('Req 4.1 — badge icons rendered when badges has 1+ items', () => {
    const badges: UserPictureBadge[] = [
      { iconKey: 'star', name: 'Top Contributor', level: 3 },
      { iconKey: '🏆', name: 'Champion', level: null },
    ];

    it('renders one badge element per badge entry', () => {
      const { container } = render(
        <UserPicture user={makeUser()} noLink badges={badges} />,
      );

      expect(
        container.querySelectorAll('[data-testid="user-picture-badge"]'),
      ).toHaveLength(2);
    });

    it('exposes an accessible label derived from each badge name', () => {
      render(<UserPicture user={makeUser()} noLink badges={badges} />);

      expect(screen.getByLabelText('Top Contributor')).not.toBeNull();
      expect(screen.getByLabelText('Champion')).not.toBeNull();
    });

    it('renders a Material Symbols span for icon-name badges', () => {
      const { container } = render(
        <UserPicture user={makeUser()} noLink badges={badges} />,
      );

      const materialIcon = container.querySelector(
        '.material-symbols-outlined',
      );
      expect(materialIcon).not.toBeNull();
      expect(materialIcon?.textContent).toBe('star');
    });

    it('renders emoji badges as plain text', () => {
      render(<UserPicture user={makeUser()} noLink badges={badges} />);

      expect(screen.getByLabelText('Champion').textContent).toContain('🏆');
    });

    it('keeps badges nested inside the root span', () => {
      const { container } = render(
        <UserPicture user={makeUser()} noLink badges={badges} />,
      );

      expect(container.children).toHaveLength(1);
      const rootSpan = container.firstElementChild;
      expect(
        rootSpan?.querySelectorAll('[data-testid="user-picture-badge"]'),
      ).toHaveLength(2);
    });
  });
});

describe('UserPicture — Task 11.5 (display-pattern boundary audit, req 4.4)', () => {
  it('renders every entry it is given as-is, performing no highest-level-per-series reduction of its own', () => {
    // Req 4.4 splits responsibility across layers: the avatar-adjacent
    // location shows only the highest level per badge series, but that
    // reduction is the CALLER's job (server-side `badgeSummaryCached`
    // generation, see badge-grant-service.ts `updateBadgeSummaryCached`),
    // not UserPicture's. This pins that boundary: if two levels of the same
    // series were ever passed in by mistake, UserPicture must not silently
    // hide the redundant one -- it just renders what it receives.
    const sameSeriesBadges: UserPictureBadge[] = [
      { iconKey: 'edit', name: 'Bronze Contributor', level: 1 },
      { iconKey: 'star', name: 'Gold Contributor', level: 3 },
    ];
    const { container } = render(
      <UserPicture user={makeUser()} noLink badges={sameSeriesBadges} />,
    );

    expect(
      container.querySelectorAll('[data-testid="user-picture-badge"]'),
    ).toHaveLength(2);
    expect(screen.getByLabelText('Bronze Contributor')).not.toBeNull();
    expect(screen.getByLabelText('Gold Contributor')).not.toBeNull();
  });
});

describe('UserPicture — Task 10.3 (badge tooltip catalog resolution, req 4.5)', () => {
  it('shows the badge name in its own tooltip when hovered/focused, even without a description', () => {
    const badges: UserPictureBadge[] = [
      { iconKey: 'star', name: 'Top Contributor', level: 3 },
    ];
    const { container } = render(
      <UserPicture user={makeUser()} noLink badges={badges} />,
    );

    const badgeEl = container.querySelector(
      '[data-testid="user-picture-badge"]',
    );
    const tooltip = badgeEl?.querySelector('[data-testid="mock-tooltip"]');
    expect(tooltip?.textContent).toContain('Top Contributor');
  });

  it('shows both the name and description when the badge has a resolved description', () => {
    const badges: UserPictureBadge[] = [
      {
        iconKey: 'star',
        name: 'Top Contributor',
        level: 3,
        description: 'Awarded for outstanding contributions',
      },
    ];
    const { container } = render(
      <UserPicture user={makeUser()} noLink badges={badges} />,
    );

    const badgeEl = container.querySelector(
      '[data-testid="user-picture-badge"]',
    );
    const tooltip = badgeEl?.querySelector('[data-testid="mock-tooltip"]');
    expect(tooltip?.textContent).toContain('Top Contributor');
    expect(tooltip?.textContent).toContain(
      'Awarded for outstanding contributions',
    );
  });

  it('gives each badge its own independent tooltip, not the avatar/username one', () => {
    const badges: UserPictureBadge[] = [
      {
        iconKey: 'star',
        name: 'Top Contributor',
        description: 'First description',
        level: 3,
      },
      {
        iconKey: '🏆',
        name: 'Champion',
        description: 'Second description',
        level: null,
      },
    ];
    render(
      <UserPicture user={makeUser({ name: 'Alice' })} noLink badges={badges} />,
    );

    const tooltips = screen.getAllByTestId('mock-tooltip');
    // One for the avatar/username tooltip + one per badge.
    expect(tooltips).toHaveLength(3);

    const badgeTooltipTexts = tooltips
      .map((tooltip) => tooltip.textContent)
      .filter((text) => text != null && !text.includes('Alice'));
    expect(badgeTooltipTexts).toContainEqual(
      expect.stringContaining('First description'),
    );
    expect(badgeTooltipTexts).toContainEqual(
      expect.stringContaining('Second description'),
    );
  });

  it('makes each badge keyboard-focusable so the tooltip can be reached without a mouse', () => {
    const badges: UserPictureBadge[] = [
      { iconKey: 'star', name: 'Top Contributor', level: 3 },
    ];
    const { container } = render(
      <UserPicture user={makeUser()} noLink badges={badges} />,
    );

    const badgeEl = container.querySelector(
      '[data-testid="user-picture-badge"]',
    );
    expect(badgeEl?.getAttribute('tabindex')).toBe('0');
  });

  it('gives each badge a unique DOM id even when two UserPicture instances render the same badge', () => {
    const badges: UserPictureBadge[] = [
      { iconKey: 'star', name: 'Top Contributor', level: 3 },
    ];
    const { container: containerA } = render(
      <UserPicture user={makeUser()} noLink badges={badges} />,
    );
    const { container: containerB } = render(
      <UserPicture user={makeUser()} noLink badges={badges} />,
    );

    const idA = containerA.querySelector(
      '[data-testid="user-picture-badge"]',
    )?.id;
    const idB = containerB.querySelector(
      '[data-testid="user-picture-badge"]',
    )?.id;
    expect(idA).toBeTruthy();
    expect(idB).toBeTruthy();
    expect(idA).not.toBe(idB);
  });
});
