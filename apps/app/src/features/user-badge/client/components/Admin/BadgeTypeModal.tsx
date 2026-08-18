import type { FC } from 'react';
import { useTranslation } from 'next-i18next';
import { Modal, ModalBody, ModalHeader } from 'reactstrap';

import type { IBadgeTypeHasId } from '../../stores/badge-type';
import type { BadgeTypeFormValues } from './BadgeTypeForm';
import { BadgeTypeForm } from './BadgeTypeForm';

type Props = {
  badgeType?: IBadgeTypeHasId;
  buttonLabel?: string;
  onClickSubmit?: (values: BadgeTypeFormValues) => Promise<void> | void;
  isShow?: boolean;
  onHide?: () => void;
};

const BadgeTypeModalSubstance: FC<Props> = (props: Props) => {
  const { t } = useTranslation('admin');

  const { badgeType, buttonLabel, onClickSubmit, onHide } = props;

  return (
    <>
      <ModalHeader tag="h4" toggle={onHide}>
        {t('badge_management.badge_type_basic_info')}
      </ModalHeader>

      <ModalBody>
        <BadgeTypeForm
          badgeType={badgeType}
          submitButtonLabel={buttonLabel ?? t('Create')}
          onSubmit={onClickSubmit ?? (() => {})}
        />
      </ModalBody>
    </>
  );
};

export const BadgeTypeModal: FC<Props> = (props: Props) => {
  const { isShow, onHide } = props;

  return (
    <Modal className="modal-lg" isOpen={isShow} toggle={onHide}>
      {isShow && <BadgeTypeModalSubstance {...props} />}
    </Modal>
  );
};
