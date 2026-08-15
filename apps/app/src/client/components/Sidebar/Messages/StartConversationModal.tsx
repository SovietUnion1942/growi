import { type JSX, useCallback, useState } from 'react';
import { Modal, ModalBody, ModalHeader } from 'reactstrap';

import { useCurrentUser } from '~/states/global';
import {
  createConversation,
  createGroupConversation,
  type IConversation,
  type IConversationParticipant,
} from '~/stores/messages';

import { UserSearchList } from './UserSearchList';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onConversationCreated: (conversation: IConversation) => void;
};

type Mode = 'direct' | 'group';

export const StartConversationModal = (props: Props): JSX.Element => {
  const { isOpen, onClose, onConversationCreated } = props;

  const currentUser = useCurrentUser();

  const [mode, setMode] = useState<Mode>('direct');
  const [selectedMembers, setSelectedMembers] = useState<
    IConversationParticipant[]
  >([]);
  const [groupName, setGroupName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const reset = useCallback(() => {
    setMode('direct');
    setSelectedMembers([]);
    setGroupName('');
  }, []);

  const closeHandler = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const selectDirectHandler = useCallback(
    async (user: IConversationParticipant) => {
      if (isCreating) return;
      setIsCreating(true);
      try {
        const conversation = await createConversation(user._id);
        onConversationCreated(conversation);
        reset();
      } finally {
        setIsCreating(false);
      }
    },
    [isCreating, onConversationCreated, reset],
  );

  const addMemberHandler = useCallback((user: IConversationParticipant) => {
    setSelectedMembers((prev) => [...prev, user]);
  }, []);

  const removeMemberHandler = useCallback((userId: string) => {
    setSelectedMembers((prev) => prev.filter((m) => m._id !== userId));
  }, []);

  const createGroupHandler = useCallback(async () => {
    if (isCreating || groupName.trim() === '' || selectedMembers.length === 0) {
      return;
    }
    setIsCreating(true);
    try {
      const conversation = await createGroupConversation(
        selectedMembers.map((m) => m._id),
        groupName.trim(),
      );
      onConversationCreated(conversation);
      reset();
    } finally {
      setIsCreating(false);
    }
  }, [groupName, isCreating, onConversationCreated, reset, selectedMembers]);

  const excludeUserIds = [
    currentUser?._id,
    ...selectedMembers.map((m) => m._id),
  ].filter((id): id is string => id != null);

  return (
    <Modal isOpen={isOpen} toggle={closeHandler}>
      <ModalHeader toggle={closeHandler}>新しい会話を始める</ModalHeader>
      <ModalBody>
        <fieldset className="btn-group w-100 mb-3">
          <button
            type="button"
            className={`btn btn-sm ${mode === 'direct' ? 'btn-primary' : 'btn-outline-primary'}`}
            onClick={() => setMode('direct')}
          >
            1対1
          </button>
          <button
            type="button"
            className={`btn btn-sm ${mode === 'group' ? 'btn-primary' : 'btn-outline-primary'}`}
            onClick={() => setMode('group')}
          >
            グループ
          </button>
        </fieldset>

        {mode === 'direct' && (
          <UserSearchList
            excludeUserIds={excludeUserIds}
            onSelectUser={selectDirectHandler}
            disabled={isCreating}
          />
        )}

        {mode === 'group' && (
          <>
            <input
              type="text"
              className="form-control mb-3"
              placeholder="グループ名"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              disabled={isCreating}
            />

            {selectedMembers.length > 0 && (
              <div className="d-flex flex-wrap gap-1 mb-3">
                {selectedMembers.map((member) => (
                  <span
                    key={member._id}
                    className="badge bg-body-tertiary border text-body d-flex align-items-center"
                  >
                    {member.name ?? member.username}
                    <button
                      type="button"
                      className="btn-close btn-close-sm ms-1"
                      style={{ fontSize: '0.6rem' }}
                      onClick={() => removeMemberHandler(member._id)}
                      disabled={isCreating}
                      aria-label="remove"
                    />
                  </span>
                ))}
              </div>
            )}

            <UserSearchList
              excludeUserIds={excludeUserIds}
              onSelectUser={addMemberHandler}
              disabled={isCreating}
            />

            <button
              type="button"
              className="btn btn-primary w-100 mt-3"
              onClick={createGroupHandler}
              disabled={
                isCreating ||
                groupName.trim() === '' ||
                selectedMembers.length === 0
              }
            >
              作成
            </button>
          </>
        )}
      </ModalBody>
    </Modal>
  );
};
