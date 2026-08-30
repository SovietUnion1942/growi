import {
  baseKeymap,
  setBlockType,
  toggleMark,
  wrapIn,
} from 'prosemirror-commands';
import { redo, undo } from 'prosemirror-history';
import { undoInputRule } from 'prosemirror-inputrules';
import type { Schema } from 'prosemirror-model';
import {
  liftListItem,
  sinkListItem,
  splitListItem,
} from 'prosemirror-schema-list';
import type { Command } from 'prosemirror-state';

export function buildKeymap(
  schema: Schema,
  onSave?: () => void,
): Record<string, Command> {
  const keys: Record<string, Command> = {};
  const bind = (key: string, cmd: Command) => {
    keys[key] = cmd;
  };

  bind('Mod-z', undo);
  bind('Shift-Mod-z', redo);
  bind('Mod-y', redo);
  bind('Backspace', undoInputRule);

  if (onSave != null) {
    bind('Mod-s', () => {
      onSave();
      return true;
    });
  }

  bind('Mod-b', toggleMark(schema.marks.strong));
  bind('Mod-i', toggleMark(schema.marks.em));
  bind('Mod-`', toggleMark(schema.marks.code));
  bind('Shift-Mod-x', toggleMark(schema.marks.s));

  const li = schema.nodes.list_item;
  bind('Enter', splitListItem(li));
  bind('Mod-[', liftListItem(li));
  bind('Mod-]', sinkListItem(li));
  bind('Tab', sinkListItem(li));
  bind('Shift-Tab', liftListItem(li));

  bind('Ctrl->', wrapIn(schema.nodes.blockquote));

  bind('Shift-Ctrl-0', setBlockType(schema.nodes.paragraph));
  for (let i = 1; i <= 6; i++) {
    bind(`Shift-Ctrl-${i}`, setBlockType(schema.nodes.heading, { level: i }));
  }
  bind('Shift-Ctrl-\\', setBlockType(schema.nodes.code_block));

  for (const [key, cmd] of Object.entries(baseKeymap)) {
    if (!(key in keys)) keys[key] = cmd;
  }
  return keys;
}
