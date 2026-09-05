import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SearchWidget } from './SearchWidget';

const setSearchKeywordMock = vi.fn();

vi.mock('~/states/search', () => ({
  useSetSearchKeyword: () => setSearchKeywordMock,
}));

describe('SearchWidget', () => {
  beforeEach(() => {
    setSearchKeywordMock.mockClear();
  });

  it('renders a search input and submit control', () => {
    render(<SearchWidget />);

    expect(screen.getByRole('searchbox')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('navigates to the search results screen with the entered keyword on submit', async () => {
    const user = userEvent.setup();
    render(<SearchWidget />);

    await user.type(screen.getByRole('searchbox'), 'growi');
    await user.click(screen.getByRole('button'));

    expect(setSearchKeywordMock).toHaveBeenCalledTimes(1);
    expect(setSearchKeywordMock).toHaveBeenCalledWith('growi');
  });

  it('does not navigate when submitted with an empty keyword', async () => {
    const user = userEvent.setup();
    render(<SearchWidget />);

    await user.click(screen.getByRole('button'));

    expect(setSearchKeywordMock).not.toHaveBeenCalled();
  });

  it('does not navigate when submitted with a whitespace-only keyword', async () => {
    const user = userEvent.setup();
    render(<SearchWidget />);

    await user.type(screen.getByRole('searchbox'), '   ');
    await user.click(screen.getByRole('button'));

    expect(setSearchKeywordMock).not.toHaveBeenCalled();
  });

  it('does not throw when submitted with an empty keyword', () => {
    render(<SearchWidget />);

    expect(() => {
      screen.getByRole('button').click();
    }).not.toThrow();
  });
});
