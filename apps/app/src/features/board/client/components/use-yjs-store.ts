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

import { boardAssetStore } from './board-editor/board-asset-store';

/**
 * Binds a tldraw store to a Yjs document synced over a `y-websocket`
 * provider. Adapted from tldraw's official `yjs` example, trimmed to a
 * `Y.Map` (instead of `y-utility`'s `YKeyValue`).
 *
 * Only **document-scoped** records go through Yjs. `session`/`presence`
 * records (`instance`, `camera`, `pointer`, `instance_page_state`) are
 * per-tab editor state -- syncing them makes every client fight over the
 * viewport and, worse, a `store.clear()`-style reload wipes the `instance`
 * record the editor needs, blanking the canvas. So: seed from
 * `store.serialize('document')`, filter incoming records to
 * `store.scopedTypes.document`, and reconcile without ever clearing session
 * records.
 */
export const useYjsStore = (
  roomId: string,
  hostUrl: string,
): TLStoreWithStatus => {
  const [store] = useState(() =>
    createTLStore({
      shapeUtils: defaultShapeUtils,
      bindingUtils: defaultBindingUtils,
      // upload dropped/pasted images to /_api/v3/board/assets instead of
      // inlining them as base64 in the shared Yjs doc
      assets: boardAssetStore,
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

    const isDocumentRecord = (record: TLRecord): boolean =>
      store.scopedTypes.document.has(record.typeName);

    const unsubs: (() => void)[] = [];

    const bindStoreToYDoc = () => {
      // tldraw store -> Y.Map (local, document-scoped edits only)
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
            if (record != null && isDocumentRecord(record)) toPut.push(record);
          }
        });

        store.mergeRemoteChanges(() => {
          if (toRemove.length > 0) store.remove(toRemove);
          if (toPut.length > 0) store.put(toPut);
        });
      };

      yRecords.observe(handleChange);
      unsubs.push(() => yRecords.unobserve(handleChange));

      if (yRecords.size === 0) {
        // First client: seed the doc with this store's document records only.
        yDoc.transact(() => {
          for (const record of Object.values(store.serialize('document'))) {
            yRecords.set((record as TLRecord).id, record as TLRecord);
          }
        });
      } else {
        // Later client: adopt the shared document without touching session
        // records (no store.clear() -> the editor stays usable).
        const remote = [...yRecords.values()].filter(isDocumentRecord);
        const remoteIds = new Set(remote.map((r) => r.id));
        const staleLocalDocIds = Object.values(store.serialize('document'))
          .map((r) => (r as TLRecord).id)
          .filter((id) => !remoteIds.has(id));

        store.mergeRemoteChanges(() => {
          if (staleLocalDocIds.length > 0) store.remove(staleLocalDocIds);
          store.put(remote);
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
