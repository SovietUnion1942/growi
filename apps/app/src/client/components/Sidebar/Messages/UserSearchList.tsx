import { type JSX, useEffect, useMemo, useState } from 'react';
import { UserPicture } from '@growi/ui/dist/components';
import { debounce } from 'throttle-debounce';

import { type IConversationParticipant, searchUsers } from '~/stores/messages';

type Props = {
  excludeUserIds?: string[];
  onSelectUser: (user: IConversationParticipant) => void;
  disabled?: boolean;
};

export const UserSearchList = (props: Props): JSX.Element => {
  const { excludeUserIds, onSelectUser, disabled } = props;

  const [searchText, setSearchText] = useState('');
  const [results, setResults] = useState<IConversationParticipant[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const excludeSet = useMemo(
    () => new Set(excludeUserIds ?? []),
    [excludeUserIds],
  );

  // an empty searchText matches every user server-side, so this also
  // serves as the "show the full list" fetch when this component mounts
  const runSearch = useMemo(
    () =>
      debounce(300, async (text: string) => {
        try {
          const users = await searchUsers(text);
          setResults(users);
        } finally {
          setIsSearching(false);
        }
      }),
    [],
  );

  useEffect(() => {
    setIsSearching(true);
    runSearch('');
  }, [runSearch]);

  const changeHandler = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setSearchText(text);
    setIsSearching(true);
    runSearch(text);
  };

  const visibleResults = results.filter((u) => !excludeSet.has(u._id));

  return (
    <div>
      <input
        type="text"
        className="form-control mb-3"
        placeholder="ユーザーを検索"
        value={searchText}
        onChange={changeHandler}
        disabled={disabled}
      />

      {isSearching && <div className="text-center py-2">Loading...</div>}

      {!isSearching && visibleResults.length === 0 && (
        <div className="text-muted text-center py-2">該当ユーザーなし</div>
      )}

      <ul className="list-unstyled mb-0">
        {visibleResults.map((user) => (
          <li key={user._id}>
            <button
              type="button"
              className="btn btn-link text-start w-100 d-flex align-items-center py-2 text-decoration-none"
              onClick={() => onSelectUser(user)}
              disabled={disabled}
            >
              <UserPicture user={user} size="sm" noLink noTooltip />
              <span className="ms-2">{user.name ?? user.username}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
