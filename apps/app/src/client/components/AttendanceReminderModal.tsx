import type React from 'react';
import Link from 'next/link';
import { Modal, ModalBody, ModalFooter, ModalHeader } from 'reactstrap';

import {
  ATTENDANCE_PAGE_PATH,
  useAttendanceReminderModal,
} from '~/stores/attendance-status';

export const AttendanceReminderModal = (): React.JSX.Element => {
  const { isOpen, dismiss } = useAttendanceReminderModal();

  return (
    <Modal isOpen={isOpen} toggle={dismiss}>
      <ModalHeader tag="h4" toggle={dismiss}>
        出欠リマインダー
      </ModalHeader>
      <ModalBody>
        今月分の出欠がまだ未投票です。都合の良い日を教えてください。
      </ModalBody>
      <ModalFooter>
        <button
          type="button"
          className="btn btn-outline-secondary"
          onClick={dismiss}
        >
          あとで
        </button>
        <Link
          href={ATTENDANCE_PAGE_PATH}
          className="btn btn-primary"
          onClick={dismiss}
        >
          出欠を入力する
        </Link>
      </ModalFooter>
    </Modal>
  );
};
