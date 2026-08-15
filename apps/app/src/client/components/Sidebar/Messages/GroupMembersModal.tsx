import { type JSX, useCallback, useState } from 'react';
import { UserPicture } from '@growi/ui/dist/components';
import { Modal, ModalBody, ModalHeader } from 'reactstrap';

import {
  addParticipant,
  type IConversation,
  type IConversationParticipant,
  removeParticipant,
} from '~/stores/messages';

import { UserSearchList } from './UserSearchList';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  conversation: IConversation;
  onUpdated: (conversation: IConversation) => void;
};

export const GroupMembersModal = (props: Props): JSX.Element => {
  const { isOpen, onClose, conversation, onUpdated } = props;

  const [isBusy, setIsBusy] = useState(false);

  const addHandler = useCallback(
    async (user: IConversationParticipant) => {
      if (isBusy) return;
      setIsBusy(true);
      try {
        const updated = await addParticipant(conversation._id, user._id);
        onUpdated(updated);
      } finally {
        setIsBusy(false);
      }
    },
    [conversation._id, isBusy, onUpdated],
  );

  const removeHandler = useCallback(
    async (userId: string) => {
      if (isBusy) return;
      setIsBusy(true);
      try {
        const updated = await removeParticipant(conversation._id, userId);
        onUpdated(updated);
      } finally {
        setIsBusy(false);
      }
    },
    [conversation._id, isBusy, onUpdated],
  );

  return (
    <Modal isOpen={isOpen} toggle={onClose}>
      <ModalHeader toggle={onClose}>メンバー管理</ModalHeader>
      <ModalBody>
        <h6 className="fs-6 fw-bold">
          メンバー ({conversation.participants.length})
        </h6>
        <ul className="list-unstyled mb-3">
          {conversation.participants.map((member) => (
            <li
              key={member._id}
              className="d-flex align-items-center justify-content-between py-1"
            >
              <span className="d-flex align-items-center">
                <UserPicture user={member} size="sm" noLink noTooltip />
                <span className="ms-2">{member.name ?? member.username}</span>
              </span>
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                onClick={() => removeHandler(member._id)}
                disabled={isBusy}
              >
                削除
              </button>
            </li>
          ))}
        </ul>

        <hr />

        <h6 className="fs-6 fw-bold">メンバーを追加</h6>
        <UserSearchList
          excludeUserIds={conversation.participants.map((p) => p._id)}
          onSelectUser={addHandler}
          disabled={isBusy}
        />
      </ModalBody>
    </Modal>
  );
};
