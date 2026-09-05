# FloatingPanel

A generic draggable, resizable, position-persisting floating window.
Built for the AI chat sidebar (`features/mastra/client/components/ChatSidebar/ChatSidebar.tsx`)
but deliberately not chat-specific — any panel that currently lives in a
fixed-position overlay can adopt it.

## What it does for you

- **Drag to move**: whatever you pass as `header` becomes the drag handle.
- **Drag to resize**: a grip in the bottom-right corner.
- **Remembers geometry**: position + size are saved to `localStorage` under
  your `storageKey`, per-browser (never synced across devices — see the
  code comment in `use-floating-panel.ts` for why that's the right call
  here).
- **Never gets stranded off-screen**: geometry is re-clamped against the
  live viewport on mount *and* on window resize, so a size/position saved
  on a bigger screen won't leave the panel unreachable on a smaller one.
- **Maximize/restore**: `header` is a render-prop so you can put a
  maximize button anywhere in your own header row; toggling it fills the
  viewport (small inset) without touching the saved drag/resize geometry,
  so restoring returns to exactly where the panel was.
- **Minimize to a dock chip**: toggling minimize collapses the panel to
  nothing (`FloatingPanel` renders `null`) and adds a small restore chip to
  the shared `FloatingPanelDock` tray. Multiple panels can be minimized at
  once — the dock shows one chip per minimized panel, each labelled with
  that panel's `title`.

## API

```tsx
<FloatingPanel
  storageKey="grw-my-panel-geometry"   // unique per panel type
  title="My Panel"                     // label for the minimized dock chip
  defaultPosition={{ x: 100, y: 72 }}  // top-left, px, before any save exists
  defaultSize={{ width: 420, height: 640 }}
  minSize={{ width: 320, height: 360 }}
  header={({ isMaximized, toggleMaximize, isMinimized, toggleMinimize }) => (
    <MyHeaderRow>
      <FloatingPanelControls
        isMinimized={isMinimized}
        toggleMinimize={toggleMinimize}
        isMaximized={isMaximized}
        toggleMaximize={toggleMaximize}
        onClose={onClose}
      />
    </MyHeaderRow>
  )}
  className="my-extra-classes"          // optional, merged onto the root
>
  <MyPanelContent />                    {/* fills the remaining space, own scroll */}
</FloatingPanel>
```

`header` is called with `{ isMaximized, toggleMaximize, isMinimized,
toggleMinimize }` on every render. Most consumers should render
`<FloatingPanelControls>` (exported from this module's barrel) for the
standard minimize/maximize/close buttons rather than hand-rolling their own
— it keeps every floating window's window-chrome looking and behaving the
same. The render-prop stays open for a consumer that genuinely needs custom
placement or extra buttons alongside the shared ones.

No imperative ref, no controlled position. If you need to read/react to the
live geometry from outside, that's not exposed yet; ask before hacking
around it (the underlying `useFloatingPanel` hook is not currently exported
from the barrel on purpose, to keep this a single easy path until a second
consumer needs more).

`FloatingPanelDock` (also exported from the barrel) renders the tray of
minimized-panel chips; mount it exactly once, high in the tree and outside
any feature-specific subtree (see `BasicLayout.tsx`, as a sibling of
`ChatSidebarLazyLoaded`) — every `FloatingPanel` on the page shares the same
dock regardless of which feature owns it.

## Worked example: ChatSidebar

`ChatSidebar.tsx`'s `return` is the reference migration to copy from. Before:

```tsx
return (
  <div className={`tw-root position-fixed top-0 end-0 h-100 ... ${moduleClass}`}>
    <div className="tw:max-w-4xl tw:mx-auto ...">
      <div className="tw:flex tw:flex-col tw:h-full">
        <div className="...header row with title + close button...">...</div>
        <Conversation>...</Conversation>
        <PromptInput>...</PromptInput>
      </div>
    </div>
  </div>
);
```

After:

```tsx
return (
  <FloatingPanel
    className={`tw-root ${moduleClass}`}
    storageKey="grw-ai-chat-sidebar-geometry"
    defaultPosition={FLOATING_CHAT_DEFAULT_POSITION}
    defaultSize={FLOATING_CHAT_DEFAULT_SIZE}
    minSize={FLOATING_CHAT_MIN_SIZE}
    header={({ isMaximized, toggleMaximize, isMinimized, toggleMinimize }) => (
      <div className="...same header row...">
        ...title...
        <FloatingPanelControls
          isMinimized={isMinimized}
          toggleMinimize={toggleMinimize}
          isMaximized={isMaximized}
          toggleMaximize={toggleMaximize}
          onClose={close}
        />
      </div>
    )}
  >
    <div className="tw:mx-auto tw:flex tw:h-full tw:max-w-4xl tw:flex-col">
      <Conversation>...</Conversation>
      <PromptInput>...</PromptInput>
    </div>
  </FloatingPanel>
);
```

The mechanical steps were:

1. Delete the two outermost wrapper `div`s (`position-fixed ...` and
   `max-w-4xl mx-auto ...`) — `FloatingPanel` now owns fixed positioning
   and sizing.
2. Pull the existing header markup (title + close button) out as the
   `header` render-prop, adding `<FloatingPanelControls>` for the shared
   minimize/maximize/close buttons — see `ChatSidebar.tsx` for the working
   version.
3. Keep one inner wrapper div (`flex h-full flex-col`, `max-w-4xl mx-auto`
   if you had one) around your actual content so it still fills the
   panel's content area and lays out top-to-bottom.
4. Define three constants near the top of the file for default position/
   size/min-size (see `FLOATING_CHAT_DEFAULT_*` in `ChatSidebar.tsx`) —
   copy the shape, tune the numbers for your panel's content.
5. Pick a `storageKey` that won't collide with `grw-ai-chat-sidebar-geometry`.

No logic inside your existing content tree needs to change — this is a
container swap, not a rewrite of what's inside.

## Migrating the Messages/DM panel specifically

One thing is different for Messages: it currently lives **inside GROWI's
standard collapsible left Sidebar** (`client/components/Sidebar/Messages/Messages.tsx`)
as one of that sidebar's content panels — it is not already its own
fixed-position overlay the way `ChatSidebar.tsx` was. So the migration is
two steps, not one:

1. **Extract it from the Sidebar shell.** Whatever currently mounts
   `Messages.tsx` inside the standard sidebar needs to instead render it
   independently (mirroring how `ChatSidebar/dynamic.tsx` lazy-mounts
   `ChatSidebar` outside the normal page layout, gated on an open/closed
   status atom). This is the part with no ChatSidebar precedent to copy
   line-for-line — expect to design the "is the Messages panel open"
   state and its trigger button yourself.
2. **Wrap it in `FloatingPanel`**, following the "worked example" steps
   above, once it's already rendering as its own top-level component.

Happy to pair on step 1's state/trigger plumbing if useful — that part is
genuinely new, not a copy-paste.
