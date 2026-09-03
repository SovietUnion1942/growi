import { useEffect, useState } from 'react';
import {
  createTLStore,
  defaultBindingUtils,
  defaultShapeUtils,
  type TLRecord,
  type TLStoreWithStatus,
} from 'tldraw';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

/**
 * Binds a tldraw store to a Yjs document synced over a `y-websocket`
 * provider. Document records live in a single `Y.Map<TLRecord>`.
 *
 * Adapted from tldraw's official `yjs` example, trimmed to a `Y.Map`
 * (instead of `y-utility`'s `YKeyValue`, an extra dependency) and to
 * document sync only -- peer cursor/selection presence over the awareness
 * channel is a later addition. `Y.Map` is adequate for the document sizes a
 * club whiteboard produces.
 */
export const useYjsStore = (
  roomId: string,
  hostUrl: string,
): TLStoreWithStatus => {
  const [store] = useState(() =>
    createTLStore({
      shapeUtils: defaultShapeUtils,
      bindingUtils: defaultBindingUtils,
    }),
  );
  const [storeWithStatus, setStoreWithStatus] = useState<TLStoreWithStatus>({
    status: 'loading',
  });

  useEffect(() => {
    if (hostUrl === '') return;

    setStoreWithStatus({ status: 'loading' });

    const yDoc = new Y.Doc({ gc: true });
    const yRecords = yDoc.getMap<TLRecord>('tldraw_records');
    const provider = new WebsocketProvider(hostUrl, roomId, yDoc, {
      connect: true,
    });

    const unsubs: (() => void)[] = [];

    const bindStoreToYDoc = () => {
      // tldraw store -> Y.Map (local user edits only)
      unsubs.push(
        store.listen(
          ({ changes }) => {
            yDoc.transact(() => {
              for (const record of Object.values(changes.added)) {
                yRecords.set(record.id, record);
              }
              for (const [, record] of Object.values(changes.updated)) {
                yRecords.set(record.id, record);
              }
              for (const record of Object.values(changes.removed)) {
                yRecords.delete(record.id);
              }
            });
          },
          { source: 'user', scope: 'document' },
        ),
      );

      // Y.Map -> tldraw store (remote edits only)
      const handleChange = (
        events: Y.YMapEvent<TLRecord>,
        transaction: Y.Transaction,
      ) => {
        if (transaction.local) return;

        const toPut: TLRecord[] = [];
        const toRemove: TLRecord['id'][] = [];

        events.changes.keys.forEach((change, id) => {
          if (change.action === 'delete') {
            toRemove.push(id as TLRecord['id']);
          } else {
            const record = yRecords.get(id);
            if (record != null) toPut.push(record);
          }
        });

        store.mergeRemoteChanges(() => {
          if (toRemove.length > 0) store.remove(toRemove);
          if (toPut.length > 0) store.put(toPut);
        });
      };

      yRecords.observe(handleChange);
      unsubs.push(() => yRecords.unobserve(handleChange));

      // Seed: first client fills the doc, later clients load from it
      if (yRecords.size === 0) {
        yDoc.transact(() => {
          for (const record of store.allRecords()) {
            yRecords.set(record.id, record);
          }
        });
      } else {
        store.mergeRemoteChanges(() => {
          store.clear();
          store.put([...yRecords.values()]);
        });
      }

      setStoreWithStatus({
        status: 'synced-remote',
        connectionStatus: 'online',
        store,
      });
    };

    if (provider.synced) {
      bindStoreToYDoc();
    } else {
      provider.once('sync', bindStoreToYDoc);
    }

    return () => {
      for (const unsub of unsubs) unsub();
      unsubs.length = 0;
      provider.disconnect();
      provider.destroy();
      yDoc.destroy();
    };
  }, [store, roomId, hostUrl]);

  return storeWithStatus;
};
