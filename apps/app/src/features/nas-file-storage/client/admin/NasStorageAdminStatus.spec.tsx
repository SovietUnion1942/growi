/**
 * NasStorageAdminStatus.spec.tsx
 *
 * Admin status panel for the NAS file storage feature. Covers Req 1.3
 * (misconfigured reason is surfaced) and Req 1.4 (enabled/disabled state and
 * whether the current root resolves are displayed).
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const useNasAdminStatus = vi.fn();
  return { useNasAdminStatus };
});

vi.mock('./use-nas-admin-status', () => ({
  useNasAdminStatus: mocks.useNasAdminStatus,
}));

// Identity translation: assertions match on the raw i18n key so the test also
// pins the key-mapping logic (e.g. reason -> nas_storage.admin.reason.<reason>).
vi.mock('next-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en_US' },
  }),
}));

import { NasStorageAdminStatus } from './NasStorageAdminStatus';

type SwrShape = {
  data?: unknown;
  error?: unknown;
  isLoading?: boolean;
};

const setup = (swr: SwrShape) => {
  mocks.useNasAdminStatus.mockReturnValue({
    data: swr.data,
    error: swr.error,
    isLoading: swr.isLoading ?? false,
  });
  return render(<NasStorageAdminStatus />);
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('NasStorageAdminStatus', () => {
  it('renders the section heading', () => {
    setup({
      data: {
        enabled: true,
        status: { state: 'ready', resolvedRoot: '/mnt/nas' },
        groupRestriction: null,
        maxFileSizeBytes: null,
      },
    });
    expect(screen.getByText('nas_storage.admin.title')).toBeTruthy();
  });

  describe('root status (Req 1.4)', () => {
    it('ready -> shows the enabled indicator and the resolved root path', () => {
      setup({
        data: {
          enabled: true,
          status: { state: 'ready', resolvedRoot: '/mnt/nas/data' },
          groupRestriction: null,
          maxFileSizeBytes: null,
        },
      });
      expect(screen.getByText('nas_storage.admin.enabled')).toBeTruthy();
      expect(screen.getByText('nas_storage.admin.root.ready')).toBeTruthy();
      expect(screen.getByText('/mnt/nas/data')).toBeTruthy();
    });

    it('unconfigured -> shows the not-configured message and the disabled indicator', () => {
      setup({
        data: {
          enabled: false,
          status: { state: 'unconfigured' },
          groupRestriction: null,
          maxFileSizeBytes: null,
        },
      });
      expect(screen.getByText('nas_storage.admin.disabled')).toBeTruthy();
      expect(
        screen.getByText('nas_storage.admin.root.unconfigured'),
      ).toBeTruthy();
    });

    it('disabled -> shows the feature-off message (GROWI_NAS_ENABLED not set)', () => {
      setup({
        data: {
          enabled: false,
          status: { state: 'disabled' },
          groupRestriction: null,
          maxFileSizeBytes: null,
        },
      });
      expect(screen.getByText('nas_storage.admin.root.disabled')).toBeTruthy();
    });

    it('unavailable -> shows the temporary-unavailable message and the resolved root', () => {
      setup({
        data: {
          enabled: false,
          status: { state: 'unavailable', resolvedRoot: '/mnt/nas/data' },
          groupRestriction: null,
          maxFileSizeBytes: null,
        },
      });
      expect(
        screen.getByText('nas_storage.admin.root.unavailable'),
      ).toBeTruthy();
      expect(screen.getByText('/mnt/nas/data')).toBeTruthy();
    });
  });

  describe('misconfigured reason (Req 1.3)', () => {
    it.each([
      ['missing', 'nas_storage.admin.reason.missing'],
      ['not-a-directory', 'nas_storage.admin.reason.not-a-directory'],
      ['not-writable', 'nas_storage.admin.reason.not-writable'],
    ] as const)('%s -> renders the matching reason text', (reason, key) => {
      setup({
        data: {
          enabled: false,
          status: { state: 'misconfigured', reason },
          groupRestriction: null,
          maxFileSizeBytes: null,
        },
      });
      expect(
        screen.getByText('nas_storage.admin.root.misconfigured'),
      ).toBeTruthy();
      expect(screen.getByText(key)).toBeTruthy();
    });
  });

  describe('group restriction', () => {
    it('shows the group name when groupRestriction is set', () => {
      setup({
        data: {
          enabled: true,
          status: { state: 'ready', resolvedRoot: '/mnt/nas' },
          groupRestriction: 'team',
          maxFileSizeBytes: null,
        },
      });
      expect(screen.getByText('team')).toBeTruthy();
    });

    it('shows the no-restriction message when groupRestriction is null', () => {
      setup({
        data: {
          enabled: true,
          status: { state: 'ready', resolvedRoot: '/mnt/nas' },
          groupRestriction: null,
          maxFileSizeBytes: null,
        },
      });
      expect(
        screen.getByText('nas_storage.admin.group_restriction_none'),
      ).toBeTruthy();
    });
  });

  describe('max file size', () => {
    it('formats maxFileSizeBytes with prettyBytes', () => {
      setup({
        data: {
          enabled: true,
          status: { state: 'ready', resolvedRoot: '/mnt/nas' },
          groupRestriction: null,
          maxFileSizeBytes: 1_000_000,
        },
      });
      expect(screen.getByText('1 MB')).toBeTruthy();
    });

    it('shows the unlimited message when maxFileSizeBytes is null', () => {
      setup({
        data: {
          enabled: true,
          status: { state: 'ready', resolvedRoot: '/mnt/nas' },
          groupRestriction: null,
          maxFileSizeBytes: null,
        },
      });
      expect(
        screen.getByText('nas_storage.admin.max_file_size_unlimited'),
      ).toBeTruthy();
    });
  });

  describe('loading / error states', () => {
    it('renders a loading placeholder while fetching', () => {
      setup({ isLoading: true });
      expect(screen.getByTestId('nas-admin-status-loading')).toBeTruthy();
    });

    it('renders an error message when the fetch fails', () => {
      setup({ error: new Error('boom') });
      expect(screen.getByText('nas_storage.admin.fetch_error')).toBeTruthy();
    });
  });
});
