import { type JSX, useCallback, useEffect, useMemo, useState } from 'react';
import { UserPicture } from '@growi/ui/dist/components';
import { Modal, ModalBody, ModalHeader } from 'reactstrap';
import { debounce } from 'throttle-debounce';

import { useCurrentUser } from '~/states/global';
import {
  createConversation,
  type IConversation,
  type IConversationParticipant,
  searchUsers,
} from '~/stores/messages';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onConversationCreated: (conversation: IConversation) => void;
};

export const StartConversationModal = (props: Props): JSX.Element => {
  const { isOpen, onClose, onConversationCreated } = props;

  const currentUser = useCurrentUser();

  const [searchText, setSearchText] = useState('');
  const [results, setResults] = useState<IConversationParticipant[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // an empty searchText matches every user server-side, so this also
  // serves as the "show the full list" fetch when the modal first opens
  const runSearch = useMemo(
    () =>
      debounce(300, async (text: string) => {
        try {
          const users = await searchUsers(text);
          setResults(users.filter((u) => u._id !== currentUser?._id));
        } finally {
          setIsSearching(false);
        }
      }),
    [currentUser?._id],
  );

  useEffect(() => {
    if (isOpen) {
      setSearchText('');
      setIsSearching(true);
      runSearch('');
    }
  }, [isOpen, runSearch]);

  const changeHandler = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const text = e.target.value;
      setSearchText(text);
      setIsSearching(true);
      runSearch(text);
    },
    [runSearch],
  );

  const selectHandler = useCallback(
    async (user: IConversationParticipant) => {
      if (isCreating) {
        return;
      }
      setIsCreating(true);
      try {
        const conversation = await createConversation(user._id);
        onConversationCreated(conversation);
        setSearchText('');
        setResults([]);
      } finally {
        setIsCreating(false);
      }
    },
    [isCreating, onConversationCreated],
  );

  return (
    <Modal isOpen={isOpen} toggle={onClose}>
      <ModalHeader toggle={onClose}>新しい会話を始める</ModalHeader>
      <ModalBody>
        <input
          type="text"
          className="form-control mb-3"
          placeholder="ユーザーを検索"
          value={searchText}
          onChange={changeHandler}
          disabled={isCreating}
        />

        {isSearching && <div className="text-center py-2">Loading...</div>}

        <ul className="list-unstyled mb-0">
          {results.map((user) => (
            <li key={user._id}>
              <button
                type="button"
                className="btn btn-link text-start w-100 d-flex align-items-center py-2 text-decoration-none"
                onClick={() => selectHandler(user)}
                disabled={isCreating}
              >
                <UserPicture user={user} size="sm" noLink noTooltip />
                <span className="ms-2">{user.name ?? user.username}</span>
              </button>
            </li>
          ))}
        </ul>
      </ModalBody>
    </Modal>
  );
};
