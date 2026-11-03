/**
 * Geometry for the mobile player's three in-app presentations.
 *
 * The watch page keeps one mounted video view and moves it between three
 * rectangles: the 16:9 strip at the top of the portrait watch page
 * ("docked"), the whole window ("fullscreen" — also every landscape
 * presentation but mini), and a small floating window above the tab bar
 * ("mini"). A drag interpolates between two of them with the finger, so the
 * rect helpers below are worklets: they run on the UI thread inside
 * Reanimated styles and gesture callbacks.
 *
 * Android PiP is not a presentation here: the system owns that window.
 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SizeLike {
  width: number;
  height: number;
}

export interface InsetsLike {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface MiniBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface MiniOffset {
  dx: number;
  dy: number;
}

export const VIDEO_ASPECT_RATIO = 16 / 9;
/** Gap between the mini player and the window / tab bar edges. */
export const MINI_PLAYER_MARGIN = 12;
export const MINI_PLAYER_MIN_WIDTH = 168;
export const MINI_PLAYER_MAX_WIDTH = 260;
export const MINI_PLAYER_WIDTH_FRACTION = 0.5;
/** Fraction of the window height a drag must travel to fully minimize. */
export const MINIMIZE_TRAVEL_FRACTION = 0.55;
/** A flick faster than this (dp/s) completes the transition it points at. */
export const FLICK_VELOCITY = 800;
/** Below this progress a slow release springs back. */
export const COMMIT_PROGRESS = 0.35;

export function isLandscape(window: SizeLike): boolean {
  return window.width > window.height;
}

/** The video strip at the top of the portrait watch page. */
export function dockedVideoRect(window: SizeLike, insets: InsetsLike): Rect {
  return {
    x: 0,
    y: insets.top,
    width: window.width,
    height: Math.round(window.width / VIDEO_ASPECT_RATIO),
  };
}

export function fullscreenVideoRect(window: SizeLike): Rect {
  return { x: 0, y: 0, width: window.width, height: window.height };
}

/**
 * Portrait fullscreen for the video itself: a width-bound picture cannot
 * get any bigger than the docked strip, so fullscreen only moves the strip
 * to the vertical centre. (The chrome, not the picture, takes the whole
 * window.) Keeping the size fixed is what lets every transition be a
 * transform instead of a relayout.
 */
export function centeredVideoRect(window: SizeLike, base: Rect): Rect {
  return {
    x: 0,
    y: Math.round((window.height - base.height) / 2),
    width: base.width,
    height: base.height,
  };
}

export interface VideoTransform {
  translateX: number;
  translateY: number;
  scale: number;
}

/**
 * The transform that lays `base` onto `target`: a uniform scale about the
 * centre (how React Native scales) plus the move between the centres. The
 * two rects must share a shape; the caller keeps that true by giving the
 * mini player the base's aspect ratio.
 */
export function transformBetween(base: Rect, target: Rect): VideoTransform {
  "worklet";
  return {
    translateX: target.x + target.width / 2 - (base.x + base.width / 2),
    translateY: target.y + target.height / 2 - (base.y + base.height / 2),
    scale: base.width > 0 ? target.width / base.width : 1,
  };
}

/**
 * Space the floating tab bar takes at the bottom: its height, its top
 * padding and the larger of the safe-area inset and its bottom padding
 * (see OptimizedTabBar).
 */
export function tabBarClearance(
  insets: InsetsLike,
  tabBarHeight: number,
): number {
  return tabBarHeight + 12 + Math.max(insets.bottom, 12);
}

/**
 * The mini player's size. `aspect` is the shape of the video surface it is
 * scaled down from (16:9 for the portrait strip, the window's own shape in
 * landscape), so the scale is uniform and the picture never squashes.
 */
export function miniPlayerSize(
  window: SizeLike,
  aspect: number = VIDEO_ASPECT_RATIO,
): SizeLike {
  const width = Math.round(
    Math.min(
      MINI_PLAYER_MAX_WIDTH,
      Math.max(
        MINI_PLAYER_MIN_WIDTH,
        window.width * MINI_PLAYER_WIDTH_FRACTION,
      ),
    ),
  );
  return { width, height: Math.round(width / aspect) };
}

/** The mini player's home: the bottom-right corner, above the tab bar. */
export function miniPlayerHomeRect(
  window: SizeLike,
  insets: InsetsLike,
  bottomClearance: number,
  aspect: number = VIDEO_ASPECT_RATIO,
): Rect {
  const size = miniPlayerSize(window, aspect);
  return {
    x: window.width - insets.right - MINI_PLAYER_MARGIN - size.width,
    y: window.height - bottomClearance - MINI_PLAYER_MARGIN - size.height,
    width: size.width,
    height: size.height,
  };
}

/** Where the mini player may sit: inside the safe area, above the tab bar. */
export function miniPlayerBounds(
  window: SizeLike,
  insets: InsetsLike,
  bottomClearance: number,
  aspect: number = VIDEO_ASPECT_RATIO,
): MiniBounds {
  const size = miniPlayerSize(window, aspect);
  const minX = insets.left + MINI_PLAYER_MARGIN;
  const maxX = window.width - insets.right - MINI_PLAYER_MARGIN - size.width;
  const minY = insets.top + MINI_PLAYER_MARGIN;
  const maxY =
    window.height - bottomClearance - MINI_PLAYER_MARGIN - size.height;
  return {
    minX,
    maxX: Math.max(minX, maxX),
    minY,
    maxY: Math.max(minY, maxY),
  };
}

export function clamp(value: number, min: number, max: number): number {
  "worklet";
  return Math.min(max, Math.max(min, value));
}

export function lerp(from: number, to: number, t: number): number {
  "worklet";
  return from + (to - from) * t;
}

export function lerpRect(from: Rect, to: Rect, t: number): Rect {
  "worklet";
  return {
    x: lerp(from.x, to.x, t),
    y: lerp(from.y, to.y, t),
    width: lerp(from.width, to.width, t),
    height: lerp(from.height, to.height, t),
  };
}

/**
 * The video's rectangle for a pair of transition progresses: first the
 * docked strip grows into the fullscreen rect, then whatever that is shrinks
 * into the mini window.
 */
export function interpolateVideoRect(
  docked: Rect,
  fullscreen: Rect,
  mini: Rect,
  fullscreenProgress: number,
  minimizeProgress: number,
): Rect {
  "worklet";
  const expanded = lerpRect(docked, fullscreen, fullscreenProgress);
  return lerpRect(expanded, mini, minimizeProgress);
}

/** Keep a dragged mini player inside its bounds. */
export function clampMiniOffset(
  offset: MiniOffset,
  home: Rect,
  bounds: MiniBounds,
): MiniOffset {
  "worklet";
  return {
    dx: clamp(offset.dx, bounds.minX - home.x, bounds.maxX - home.x),
    dy: clamp(offset.dy, bounds.minY - home.y, bounds.maxY - home.y),
  };
}

/**
 * How far ahead (in seconds) a release velocity is projected when choosing
 * the mini player's resting corner: a flick carries the window on past the
 * finger, the way a thrown object would, before it settles.
 */
export const FLING_PROJECTION_S = 0.18;

export interface Velocity {
  x: number;
  y: number;
}

/**
 * The corner a released mini player settles in: the nearest of the four
 * corners to where the release velocity would carry it. A slow release
 * picks the nearest corner to where it was dropped; a flick up and to the
 * right lands it top-right even if it was dropped near the bottom.
 */
export function snapMiniOffset(
  offset: MiniOffset,
  velocity: Velocity,
  home: Rect,
  bounds: MiniBounds,
): MiniOffset {
  "worklet";
  const projectedX = offset.dx + velocity.x * FLING_PROJECTION_S;
  const projectedY = offset.dy + velocity.y * FLING_PROJECTION_S;
  const leftDx = bounds.minX - home.x;
  const rightDx = bounds.maxX - home.x;
  const topDy = bounds.minY - home.y;
  const bottomDy = bounds.maxY - home.y;
  return {
    dx:
      Math.abs(projectedX - leftDx) < Math.abs(projectedX - rightDx)
        ? leftDx
        : rightDx,
    dy:
      Math.abs(projectedY - topDy) < Math.abs(projectedY - bottomDy)
        ? topDy
        : bottomDy,
  };
}

/** Minimize progress for a downward drag that started on the video. */
export function minimizeProgressForDrag(
  translationY: number,
  windowHeight: number,
): number {
  "worklet";
  return clamp(translationY / (windowHeight * MINIMIZE_TRAVEL_FRACTION), 0, 1);
}

/**
 * Whether a release finishes the transition it was dragging toward
 * (`progress` 0..1 toward the target) or springs back. Distance decides a
 * slow release; a flick decides on its own, in either direction.
 */
export function shouldCommitTransition(
  progress: number,
  velocityToward: number,
): boolean {
  "worklet";
  if (velocityToward > FLICK_VELOCITY) return true;
  if (velocityToward < -FLICK_VELOCITY) return false;
  return progress > COMMIT_PROGRESS;
}
