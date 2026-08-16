import {
  type CSSProperties,
  forwardRef,
  type JSX,
  memo,
  type ReactNode,
  useCallback,
  useId,
  useState,
} from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import type { IUser, Ref } from '@growi/core';
import { pagePathUtils } from '@growi/core/dist/utils';
import type { UncontrolledTooltipProps } from 'reactstrap';

import styles from './UserPicture.module.scss';

const moduleClass = styles['user-picture'];
const moduleTooltipClass = styles['user-picture-tooltip'];
const moduleBadgeIconImageClass = styles['user-picture-badge-icon-image'];

const UncontrolledTooltip = dynamic<UncontrolledTooltipProps>(
  () => import('reactstrap').then((mod) => mod.UncontrolledTooltip),
  { ssr: false },
);

const DEFAULT_IMAGE = '/images/icons/user.svg';

type UserPictureSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

type BaseUserPictureRootProps = {
  displayName: string;
  children: ReactNode;
  size?: UserPictureSize;
  className?: string;
};

type UserPictureRootWithoutLinkProps = BaseUserPictureRootProps & {
  onClick?: () => void;
  rootClassName?: string;
  rootStyle?: CSSProperties;
  testId?: string;
};

type UserPictureRootWithLinkProps = BaseUserPictureRootProps & {
  username: string;
};

const UserPictureRootWithoutLink = forwardRef<
  HTMLSpanElement,
  UserPictureRootWithoutLinkProps
>((props, ref) => {
  const { onClick, rootClassName, rootStyle, testId } = props;
  const interactive = onClick != null;
  const resolvedStyle: CSSProperties | undefined = interactive
    ? { cursor: 'pointer', ...rootStyle }
    : rootStyle;
  if (interactive) {
    return (
      // biome-ignore lint/a11y/useSemanticElements: UserPicture is used in varied layout contexts where a native button would break styling
      <span
        ref={ref}
        className={rootClassName ?? props.className}
        style={resolvedStyle}
        data-testid={testId}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onClick();
        }}
        role="button"
        tabIndex={0}
      >
        {props.children}
      </span>
    );
  }
  return (
    <span
      ref={ref}
      className={rootClassName ?? props.className}
      style={resolvedStyle}
      data-testid={testId}
    >
      {props.children}
    </span>
  );
});

const UserPictureRootWithLink = forwardRef<
  HTMLSpanElement,
  UserPictureRootWithLinkProps
>((props, ref) => {
  const router = useRouter();

  const { username } = props;

  const clickHandler = useCallback(() => {
    const href = pagePathUtils.userHomepagePath({ username });
    router.push(href);
  }, [router, username]);

  // Using <span> tag here instead of <a> tag because UserPicture is used in SearchResultList which is essentially a anchor tag.
  // Nested anchor tags causes a warning.
  // https://stackoverflow.com/questions/13052598/creating-anchor-tag-inside-anchor-taga
  return (
    // biome-ignore lint/a11y/useSemanticElements: ignore
    <span
      ref={ref}
      className={props.className}
      onClick={clickHandler}
      onKeyDown={clickHandler}
      style={{ cursor: 'pointer' }}
      role="link"
      tabIndex={0}
    >
      {props.children}
    </span>
  );
});

/**
 * type guard to determine whether the specified object is IUser
 */
const hasUsername = (
  obj: Partial<IUser> | Ref<IUser> | null | undefined,
): obj is { username: string } => {
  return obj != null && typeof obj !== 'string' && 'username' in obj;
};

/**
 * Type guard to determine whether tooltip should be shown
 */
const hasName = (
  obj: Partial<IUser> | Ref<IUser> | null | undefined,
): obj is { name: string } => {
  return obj != null && typeof obj === 'object' && 'name' in obj;
};

/**
 * type guard to determine whether the specified object is IUser
 */
const hasProfileImage = (
  obj: Partial<IUser> | Ref<IUser> | null | undefined,
): obj is { imageUrlCached: string } => {
  return obj != null && typeof obj === 'object' && 'imageUrlCached' in obj;
};

/**
 * Display-only badge type for UserPicture.
 *
 * This type is self-contained within `packages/ui` and must not depend on
 * `apps/app` domain types. `iconKey` is either a Material Symbols icon name
 * or a single emoji character.
 */
export type UserPictureBadge = {
  iconKey: string;
  /**
   * Discriminates how to render the badge's icon. When `'image'`, the icon
   * is rendered as an `<img src={iconUrl}>` instead of via `iconKey`
   * (requirement 6.5). Optional -- and defaults to the pre-existing
   * emoji/Material-Symbols rendering derived from `iconKey` -- because many
   * existing call sites and tests still construct `UserPictureBadge`
   * objects without it.
   */
  iconType?: 'materialSymbol' | 'emoji' | 'image';
  /**
   * The image URL to render when `iconType === 'image'`. Optional/nullable
   * since it is only meaningful for image-type badges.
   */
  iconUrl?: string | null;
  name: string;
  level: number | null;
  /**
   * Optional badge description, resolved client-side (in `apps/app`, not
   * here) from a badge type catalog and shown in the badge's hover/focus
   * tooltip alongside `name` (requirement 4.5). Absent -- rather than an
   * empty string -- when no description could be resolved yet, so the
   * tooltip falls back to showing just `name`.
   */
  description?: string;
};

// A rough heuristic to distinguish a single emoji character from a Material
// Symbols icon name (which is always ASCII, e.g. "star", "military_tech").
const isEmojiIconKey = (iconKey: string): boolean => !/^[ -~]+$/.test(iconKey);

type Props = {
  user?: Partial<IUser> | Ref<IUser> | null;
  size?: UserPictureSize;
  noLink?: boolean;
  noTooltip?: boolean;
  className?: string;
  onClick?: () => void;
  rootClassName?: string;
  rootStyle?: CSSProperties;
  testId?: string;
  badges?: UserPictureBadge[];
};

export const UserPicture = memo((userProps: Props): JSX.Element => {
  const {
    user,
    size,
    noLink,
    noTooltip,
    className: additionalClassName,
    onClick,
    rootClassName,
    rootStyle,
    testId,
    badges,
  } = userProps;

  // Extract user information
  const username = hasUsername(user) ? user.username : undefined;
  const displayName = hasName(user) ? user.name : 'someone';
  const src = hasProfileImage(user)
    ? (user.imageUrlCached ?? DEFAULT_IMAGE)
    : DEFAULT_IMAGE;
  const showTooltip = !noTooltip && hasName(user);

  // Build className
  const className = [
    moduleClass,
    'user-picture',
    'rounded-circle',
    size && `user-picture-${size}`,
    additionalClassName,
  ]
    .filter(Boolean)
    .join(' ');

  // Callback ref into state so the tooltip mounts AFTER the host span is in
  // the DOM. reactstrap's UncontrolledTooltip resolves `target.current` once
  // in componentDidMount; when the tooltip is a child of the target span,
  // React's bottom-up commit order leaves the parent ref unset at that
  // moment, so the tooltip permanently fails to attach listeners. The race
  // is masked in dev by next/dynamic's slower resolution but fires in
  // production builds.
  const [rootEl, setRootEl] = useState<HTMLSpanElement | null>(null);

  const tooltipClassName = `${moduleTooltipClass} user-picture-tooltip-${size ?? 'md'}`;

  // biome-ignore lint/performance/noImgElement: ignore
  const imgElement = <img src={src} alt={displayName} className={className} />;

  // Namespaces each badge's tooltip target id to this component instance, so
  // multiple `UserPicture`s rendering the same user's badges on one page
  // (e.g. a search results list) never collide on `id` (unlike the badge's
  // own `key`, `id` must be globally unique in the DOM).
  //
  // React's `useId()` deliberately returns ids containing `:` (e.g. `:r1g:`)
  // specifically so they can never collide with author-chosen ids -- but
  // that same colon makes the id an INVALID CSS selector (`:` has special
  // meaning in CSS). `UncontrolledTooltip`'s `target` prop, when given a
  // plain id string, is resolved internally via a selector-based DOM lookup
  // (reactstrap/Popper), so passing a raw `useId()`-derived id crashes with
  // `SyntaxError: '...' is not a valid selector` the moment a badge tooltip
  // actually mounts in a real browser (jsdom-based tests never hit this,
  // since they don't exercise Popper's real positioning lookup -- this went
  // undetected until real badge data reached a real browser). Stripping the
  // colons keeps the id collision-safe while making it selector-safe too.
  const badgeIdPrefix = useId().replace(/:/g, '');

  const badgeElements =
    badges != null && badges.length > 0 ? (
      <span className="user-picture-badges">
        {badges.map((badge, index) => {
          const badgeElementId = `${badgeIdPrefix}-badge-${index}`;
          // Requirement 4.5: hovering or focusing a badge icon shows its
          // name and (when resolved) description. `tabIndex={0}` makes the
          // badge keyboard-focusable so `trigger="hover focus"` actually
          // has a focus event to react to.
          return (
            <span
              key={`${badge.iconKey}-${badge.name}`}
              id={badgeElementId}
              data-testid="user-picture-badge"
              role="img"
              aria-label={badge.name}
              // biome-ignore lint/a11y/noNoninteractiveTabindex: role="img" is correct here (this is content, not a control); tabIndex only makes the badge keyboard-focusable so its tooltip's "focus" trigger (requirement 4.5) is actually reachable without a mouse.
              tabIndex={0}
            >
              {badge.iconType === 'image' ? (
                // biome-ignore lint/performance/noImgElement: ignore
                <img
                  src={badge.iconUrl ?? undefined}
                  alt=""
                  className={moduleBadgeIconImageClass}
                />
              ) : isEmojiIconKey(badge.iconKey) ? (
                badge.iconKey
              ) : (
                <span className="material-symbols-outlined">
                  {badge.iconKey}
                </span>
              )}
              <UncontrolledTooltip
                placement="top"
                target={badgeElementId}
                trigger="hover focus"
                popperClassName={tooltipClassName}
                delay={0}
                fade={false}
              >
                {badge.name}
                {badge.description != null && (
                  <>
                    <br />
                    {badge.description}
                  </>
                )}
              </UncontrolledTooltip>
            </span>
          );
        })}
      </span>
    ) : null;

  const children = (
    <>
      {imgElement}
      {badgeElements}
      {rootEl != null && showTooltip && (
        <UncontrolledTooltip
          placement="bottom"
          target={rootEl}
          popperClassName={tooltipClassName}
          delay={0}
          fade={false}
        >
          {username ? (
            <>
              {`@${username}`}
              <br />
            </>
          ) : null}
          {displayName}
        </UncontrolledTooltip>
      )}
    </>
  );

  if (username == null || noLink) {
    return (
      <UserPictureRootWithoutLink
        ref={setRootEl}
        displayName={displayName}
        size={size}
        onClick={onClick}
        rootClassName={rootClassName}
        rootStyle={rootStyle}
        testId={testId}
      >
        {children}
      </UserPictureRootWithoutLink>
    );
  }

  return (
    <UserPictureRootWithLink
      ref={setRootEl}
      displayName={displayName}
      size={size}
      username={username}
    >
      {children}
    </UserPictureRootWithLink>
  );
});
UserPicture.displayName = 'UserPicture';
