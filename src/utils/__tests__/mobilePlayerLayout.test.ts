import {
  centeredVideoRect,
  clampMiniOffset,
  dockedVideoRect,
  interpolateVideoRect,
  isLandscape,
  minimizeProgressForDrag,
  miniPlayerBounds,
  miniPlayerHomeRect,
  miniPlayerSize,
  MINI_PLAYER_MARGIN,
  shouldCommitTransition,
  snapMiniOffset,
  tabBarClearance,
  transformBetween,
} from "../mobilePlayerLayout";

const PHONE = { width: 412, height: 915 };
const INSETS = { top: 48, bottom: 24, left: 0, right: 0 };
const TAB_BAR = tabBarClearance(INSETS, 80);

describe("mobilePlayerLayout", () => {
  it("docks a 16:9 strip under the status bar", () => {
    const rect = dockedVideoRect(PHONE, INSETS);
    expect(rect).toEqual({ x: 0, y: 48, width: 412, height: 232 });
  });

  it("clears the tab bar by its height, padding and safe area", () => {
    expect(tabBarClearance({ ...INSETS, bottom: 0 }, 80)).toBe(104);
    expect(tabBarClearance({ ...INSETS, bottom: 40 }, 80)).toBe(132);
  });

  it("sizes the mini player to half the width within its limits", () => {
    expect(miniPlayerSize(PHONE)).toEqual({ width: 206, height: 116 });
    expect(miniPlayerSize({ width: 300, height: 600 }).width).toBe(168);
    expect(miniPlayerSize({ width: 915, height: 412 }).width).toBe(260);
  });

  it("homes the mini player at the bottom right above the tab bar", () => {
    const home = miniPlayerHomeRect(PHONE, INSETS, TAB_BAR);
    expect(home.x + home.width + MINI_PLAYER_MARGIN).toBe(PHONE.width);
    expect(home.y + home.height + MINI_PLAYER_MARGIN + TAB_BAR).toBe(
      PHONE.height,
    );
  });

  it("keeps a dragged mini player inside the safe bounds", () => {
    const home = miniPlayerHomeRect(PHONE, INSETS, TAB_BAR);
    const bounds = miniPlayerBounds(PHONE, INSETS, TAB_BAR);
    expect(bounds.maxX).toBe(home.x);
    expect(bounds.maxY).toBe(home.y);
    const clamped = clampMiniOffset({ dx: 50, dy: 50 }, home, bounds);
    expect(clamped).toEqual({ dx: 0, dy: 0 });
    const far = clampMiniOffset({ dx: -5000, dy: -5000 }, home, bounds);
    expect(home.x + far.dx).toBe(bounds.minX);
    expect(home.y + far.dy).toBe(bounds.minY);
  });

  it("settles the mini player in the nearest corner to where a release carries it", () => {
    const home = miniPlayerHomeRect(PHONE, INSETS, TAB_BAR);
    const bounds = miniPlayerBounds(PHONE, INSETS, TAB_BAR);
    const leftDx = bounds.minX - home.x;
    const topDy = bounds.minY - home.y;
    const still = { x: 0, y: 0 };
    // Dropped near home: stays bottom-right.
    expect(snapMiniOffset({ dx: -10, dy: -10 }, still, home, bounds)).toEqual({
      dx: 0,
      dy: 0,
    });
    // Dropped just past the middle: nearest corner wins.
    expect(
      snapMiniOffset({ dx: leftDx + 10, dy: topDy + 10 }, still, home, bounds),
    ).toEqual({ dx: leftDx, dy: topDy });
    // Flicked up and to the left from home: lands top-left.
    expect(
      snapMiniOffset(
        { dx: -10, dy: -10 },
        { x: -2500, y: -3000 },
        home,
        bounds,
      ),
    ).toEqual({ dx: leftDx, dy: topDy });
    // Flicked back toward home from the far corner: lands bottom-right.
    expect(
      snapMiniOffset(
        { dx: leftDx + 10, dy: topDy + 10 },
        { x: 2500, y: 4000 },
        home,
        bounds,
      ),
    ).toEqual({ dx: 0, dy: 0 });
  });

  it("interpolates the video rect through fullscreen and then mini", () => {
    const docked = dockedVideoRect(PHONE, INSETS);
    const full = { x: 0, y: 0, width: 412, height: 915 };
    const mini = miniPlayerHomeRect(PHONE, INSETS, TAB_BAR);
    expect(interpolateVideoRect(docked, full, mini, 0, 0)).toEqual(docked);
    expect(interpolateVideoRect(docked, full, mini, 1, 0)).toEqual(full);
    expect(interpolateVideoRect(docked, full, mini, 0, 1)).toEqual(mini);
    expect(interpolateVideoRect(docked, full, mini, 1, 1)).toEqual(mini);
    const half = interpolateVideoRect(docked, full, mini, 0, 0.5);
    expect(half.width).toBeCloseTo((docked.width + mini.width) / 2);
  });

  it("maps a drag to minimize progress over part of the window", () => {
    expect(minimizeProgressForDrag(0, 915)).toBe(0);
    expect(minimizeProgressForDrag(-40, 915)).toBe(0);
    expect(minimizeProgressForDrag(915, 915)).toBe(1);
    expect(minimizeProgressForDrag(915 * 0.55 * 0.5, 915)).toBeCloseTo(0.5);
  });

  it("commits on distance for a slow release and on velocity for a flick", () => {
    expect(shouldCommitTransition(0.2, 0)).toBe(false);
    expect(shouldCommitTransition(0.5, 0)).toBe(true);
    expect(shouldCommitTransition(0.1, 1200)).toBe(true);
    expect(shouldCommitTransition(0.9, -1200)).toBe(false);
  });

  it("centres the strip for portrait fullscreen without resizing it", () => {
    const base = dockedVideoRect(PHONE, INSETS);
    const centered = centeredVideoRect(PHONE, base);
    expect(centered.width).toBe(base.width);
    expect(centered.height).toBe(base.height);
    // Rounded to whole points, so the centre may sit half a point off.
    expect(
      Math.abs(centered.y + centered.height / 2 - PHONE.height / 2),
    ).toBeLessThanOrEqual(1);
  });

  it("derives a centre-based transform that lays the base onto a target", () => {
    const base = dockedVideoRect(PHONE, INSETS);
    expect(transformBetween(base, base)).toEqual({
      translateX: 0,
      translateY: 0,
      scale: 1,
    });
    const mini = miniPlayerHomeRect(PHONE, INSETS, TAB_BAR);
    const t = transformBetween(base, mini);
    expect(t.scale).toBeCloseTo(mini.width / base.width);
    // The scaled base's centre lands on the mini's centre.
    expect(base.x + base.width / 2 + t.translateX).toBeCloseTo(
      mini.x + mini.width / 2,
    );
    expect(base.y + base.height / 2 + t.translateY).toBeCloseTo(
      mini.y + mini.height / 2,
    );
  });

  it("shapes the mini player like the surface it scales from", () => {
    const wide = miniPlayerSize({ width: 915, height: 412 }, 915 / 412);
    expect(wide.width / wide.height).toBeCloseTo(915 / 412, 1);
  });

  it("tells landscape from portrait", () => {
    expect(isLandscape(PHONE)).toBe(false);
    expect(isLandscape({ width: 915, height: 412 })).toBe(true);
  });
});
