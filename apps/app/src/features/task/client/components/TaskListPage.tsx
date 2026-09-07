import { type JSX, useMemo, useState } from 'react';
import { useTranslation } from 'next-i18next';

import { useCurrentUser } from '~/states/global/global';

import {
  TASK_STATUSES,
  type TaskStatus,
  type TaskSummary,
} from '../../interfaces/task';
import { useSWRxAssignableUsers } from '../stores/assignable-users';
import {
  createTask,
  deleteTask,
  updateTask,
  useSWRxTasks,
} from '../stores/tasks';

type FilterMode = 'all' | 'mine' | 'overdue';

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'To Do',
  doing: 'Doing',
  done: 'Done',
};

const formatDate = (iso: string | null): string =>
  iso == null ? '' : iso.slice(0, 10);

const TaskRow = ({
  task,
  canEdit,
  users,
}: {
  task: TaskSummary;
  canEdit: boolean;
  users: { _id: string; name: string }[];
}): JSX.Element => {
  const [busy, setBusy] = useState(false);

  const patch = async (body: Parameters<typeof updateTask>[1]) => {
    setBusy(true);
    try {
      await updateTask(task._id, body);
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr className={busy ? 'opacity-50' : undefined}>
      <td>
        <div className="fw-bold">{task.title}</div>
        {task.relatedPage != null && (
          <a
            href={task.relatedPage.path}
            className="small text-muted text-decoration-none"
          >
            <span
              className="material-symbols-outlined align-middle"
              style={{ fontSize: '1rem' }}
            >
              description
            </span>
            {task.relatedPage.path}
          </a>
        )}
        {task.labels.length > 0 && (
          <div className="mt-1 d-flex flex-wrap gap-1">
            {task.labels.map((l) => (
              <span
                key={l}
                className="badge bg-secondary-subtle text-secondary"
              >
                {l}
              </span>
            ))}
          </div>
        )}
      </td>
      <td style={{ width: '9rem' }}>
        <select
          className="form-select form-select-sm"
          value={task.status}
          disabled={!canEdit || busy}
          onChange={(e) => patch({ status: e.target.value as TaskStatus })}
        >
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </td>
      <td style={{ width: '11rem' }}>
        <select
          className="form-select form-select-sm"
          value={task.assignee?._id ?? ''}
          disabled={!canEdit || busy}
          onChange={(e) => patch({ assignee: e.target.value || null })}
        >
          <option value="">—</option>
          {users.map((u) => (
            <option key={u._id} value={u._id}>
              {u.name}
            </option>
          ))}
        </select>
      </td>
      <td style={{ width: '10rem' }}>
        <input
          type="date"
          className={`form-control form-control-sm ${
            task.isOverdue ? 'border-danger text-danger' : ''
          }`}
          value={formatDate(task.dueDate)}
          disabled={!canEdit || busy}
          onChange={(e) => patch({ dueDate: e.target.value || null })}
        />
      </td>
      <td style={{ width: '3rem' }}>
        {canEdit && (
          <button
            type="button"
            className="btn btn-sm btn-outline-danger border-0"
            disabled={busy}
            onClick={() => {
              // phase 1: a lightweight native confirm; a proper dialog is a
              // follow-up.
              // biome-ignore lint/suspicious/noAlert: intentional, see above
              if (window.confirm(`Delete "${task.title}"?`)) {
                setBusy(true);
                deleteTask(task._id).catch(() => setBusy(false));
              }
            }}
            aria-label="delete task"
          >
            <span className="material-symbols-outlined">delete</span>
          </button>
        )}
      </td>
    </tr>
  );
};

export const TaskListPage = (): JSX.Element => {
  const { t } = useTranslation();
  const currentUser = useCurrentUser();
  const [filter, setFilter] = useState<FilterMode>('all');

  const query = useMemo(() => {
    if (filter === 'mine') return { mine: true };
    if (filter === 'overdue') return { overdue: true };
    return undefined;
  }, [filter]);

  const { data: tasks, isLoading } = useSWRxTasks(query);
  const { data: users } = useSWRxAssignableUsers();
  const userOptions = users ?? [];

  const [newTitle, setNewTitle] = useState('');
  const [newAssignee, setNewAssignee] = useState('');
  const [newDue, setNewDue] = useState('');
  const [creating, setCreating] = useState(false);

  const submitNew = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim();
    if (title.length === 0) return;
    setCreating(true);
    try {
      await createTask({
        title,
        assignee: newAssignee || null,
        dueDate: newDue || null,
      });
      setNewTitle('');
      setNewAssignee('');
      setNewDue('');
    } finally {
      setCreating(false);
    }
  };

  const grouped = useMemo(() => {
    const by: Record<TaskStatus, TaskSummary[]> = {
      todo: [],
      doing: [],
      done: [],
    };
    for (const task of tasks ?? []) by[task.status].push(task);
    return by;
  }, [tasks]);

  return (
    <div data-testid="task-list-page">
      <form className="card card-body mb-4" onSubmit={submitNew}>
        <div className="row g-2 align-items-end">
          <div className="col-12 col-md">
            <label className="form-label small mb-1 d-block">
              {t('task.title')}
              <input
                className="form-control"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={t('task.new_task_placeholder')}
                maxLength={300}
              />
            </label>
          </div>
          <div className="col-6 col-md-3">
            <label className="form-label small mb-1 d-block">
              {t('task.assignee')}
              <select
                className="form-select"
                value={newAssignee}
                onChange={(e) => setNewAssignee(e.target.value)}
              >
                <option value="">—</option>
                {userOptions.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="col-6 col-md-3">
            <label className="form-label small mb-1 d-block">
              {t('task.due_date')}
              <input
                type="date"
                className="form-control"
                value={newDue}
                onChange={(e) => setNewDue(e.target.value)}
              />
            </label>
          </div>
          <div className="col-12 col-md-auto">
            <button
              type="submit"
              className="btn btn-primary w-100"
              disabled={creating || newTitle.trim().length === 0}
            >
              {t('task.add')}
            </button>
          </div>
        </div>
      </form>

      {/* biome-ignore lint/a11y/useSemanticElements: bootstrap btn-group filter toggle */}
      <div
        className="btn-group mb-3"
        role="group"
        aria-label={t('task.nav_label')}
      >
        {(['all', 'mine', 'overdue'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            className={`btn btn-sm ${
              filter === mode ? 'btn-primary' : 'btn-outline-primary'
            }`}
            onClick={() => setFilter(mode)}
          >
            {t(`task.filter_${mode}`)}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-muted">{t('Loading')}...</p>}

      {!isLoading && (tasks?.length ?? 0) === 0 && (
        <p className="text-muted">{t('task.no_tasks')}</p>
      )}

      {TASK_STATUSES.map((status) =>
        grouped[status].length === 0 ? null : (
          <section key={status} className="mb-4">
            <h5 className="border-bottom pb-1">
              {STATUS_LABEL[status]}{' '}
              <span className="text-muted small">
                ({grouped[status].length})
              </span>
            </h5>
            <div className="table-responsive">
              <table className="table table-sm align-middle">
                <tbody>
                  {grouped[status].map((task) => (
                    <TaskRow
                      key={task._id}
                      task={task}
                      users={userOptions}
                      canEdit={
                        currentUser?.admin === true ||
                        task.createdBy?._id === String(currentUser?._id)
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ),
      )}
    </div>
  );
};
