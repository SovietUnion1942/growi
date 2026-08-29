# NAS File Storage

A shared file area inside the wiki — browse, upload, download, and organise files in a
folder tree that lives on a real disk, **separate from page attachments**. Sidebar entry
**NAS Storage**, screen at `/nas`, admin section at `/admin/nas-storage`.

The filesystem is the source of truth (no DB index): files placed on the disk outside GROWI
show up in the listing. The capacity of the area is the size of the volume you mount — there
is no in-app quota.

## Enable it (WSL2 + docker-compose)

The switch is **opt-in**: mounting a volume or setting `GROWI_NAS_ROOT` does nothing until
`GROWI_NAS_ENABLED` is truthy.

1. **Run a fork build of the image.** Stock `growilabs/growi:8` does not contain this feature —
   point `services.app.image` at a build of `feat/nas-file-storage`.

2. **Create a size-capped disk and mount it into WSL2 as ext4** (its size is the cap):

   ```powershell
   # PowerShell (Administrator)
   New-VHD -Path C:\growi-nas.vhdx -SizeBytes 20GB -Dynamic
   wsl --mount --vhd C:\growi-nas.vhdx --name growi-nas
   ```

   WSL exposes it at `/mnt/wsl/growi-nas`. Re-run the mount after each Windows reboot.

3. **Configure `.env`** (see `growi-docker-compose` `feat/nas-file-storage` branch,
   `.env.example`):

   ```
   GROWI_NAS_ENABLED=true
   GROWI_NAS_HOST_PATH=/mnt/wsl/growi-nas
   ```

   `GROWI_NAS_ROOT=/nas` is fixed inside the container.

4. **Bring it up and verify.**

   ```bash
   docker compose config          # check GROWI_NAS_* and the /nas mount
   docker compose up -d
   docker compose logs app | grep nas-storage   # -> "NAS file storage: ready"
   ```

   Then open **Admin › NAS Storage** — the status panel should read **Ready** with the
   resolved root path.

## Environment variables

| Variable | Required | Meaning | Default |
|---|---|---|---|
| `GROWI_NAS_ENABLED` | yes, to activate | Master switch. Truthy: `true` / `1` / `yes` / `on`. | `false` |
| `GROWI_NAS_ROOT` | yes, when enabled | Directory the feature operates on (keep `/nas`, choose the host dir via the volume mount). | — |
| `GROWI_NAS_GROUP` | no | Restrict the whole area to one user group by name (internal or external). | no restriction |
| `GROWI_NAS_MAX_FILE_SIZE` | no | Per-file upload ceiling, in bytes. | no limit |
| `GROWI_NAS_SHOW_HIDDEN` | no | Show dot-files / OS metadata (`.DS_Store`, `Thumbs.db`, `@eaDir`…) by default. | `false` |
| `GROWI_NAS_MAX_ENTRIES_PER_DIR` | no | Safety cap on entries per folder before the listing refuses (full read + sort). | `50000` |

All read straight from `process.env` — not from the admin UI, not DB-overridable.

## Status states (admin panel)

| State | Cause | Users see |
|---|---|---|
| `disabled` | `GROWI_NAS_ENABLED` not truthy | no nav item; `/nas` → 404 |
| `unconfigured` | enabled but `GROWI_NAS_ROOT` empty | no nav item; `/nas` → 404 |
| `misconfigured` (`missing` / `not-a-directory` / `not-writable`) | root path unusable; the panel names which | no nav item; `/nas` → 404 |
| `ready` | root resolves to a readable, writable directory | nav item + `/nas` work |
| `unavailable` | healthy at boot, later hit `ENOENT`/`EACCES` (mount dropped) | requests fail with "storage unavailable"; auto-recovers |

`disabled` / `unconfigured` / `misconfigured` are fixed at boot — change the environment and
restart the `app` service to re-probe.

## Access control

Every operation (viewing included) requires a login. `GROWI_NAS_GROUP` narrows that to one
group; the check is identical for reads and writes. No public / unauthenticated links.

## Troubleshooting

- **No "NAS Storage" sidebar item** — only shows when status is `ready` and the user is not a
  guest. Check `/admin/nas-storage`.
- **`/nas` returns 404 after enabling** — one of the three off-states; check the
  `growi:nas-storage` boot log line; environment changes need an `app` restart.
- **"Misconfigured: not writable"** — the container's (non-root) uid cannot write the host
  directory. Fix ownership/mode of `/mnt/wsl/growi-nas`.
- **"Misconfigured: missing" after a reboot** — the VHDX is not mounted; `wsl --mount` does
  not persist across Windows restarts.
- **Uploads fail with a size error** — `GROWI_NAS_MAX_FILE_SIZE` exceeded. A "storage
  unavailable" error instead means the disk is full or the mount dropped (no partial file
  left behind).
- **A huge folder won't open** — more entries than `GROWI_NAS_MAX_ENTRIES_PER_DIR`.

## Out of scope

No total-capacity quota (cap via the volume), no WebDAV / drive mapping, no public links, no
S3 or other non-FS backend, no thumbnails, no versioning, no dedup, no folder-level
permissions. **Not a backup** — the NAS area is exactly the disk you mount; back up the
volume itself.
