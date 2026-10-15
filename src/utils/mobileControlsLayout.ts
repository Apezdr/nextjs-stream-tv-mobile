/**
 * Metrics for the mobile player chrome, by orientation.
 *
 * The overlay is a column: top row (Back / info), a flexible centre row
 * (skip / play / skip) and the bottom block (title, badge, description, seek
 * bar, pills). The portrait numbers are the ones the overlay always had. In
 * landscape a phone is only ~360–420 dp tall, so the same paddings and line
 * counts left the centre row with no height at all — and RN Android clamps a
 * Text's measured height to the room its parent offers, so the play glyph
 * (a 60 pt icon-font Text) was measured at ~0 pt and never drawn while the
 * smaller skip glyphs were merely clipped. Landscape therefore gets tighter
 * paddings, fewer lines and smaller centre buttons, and the centre row keeps
 * a minimum height equal to the play button so it can never collapse again.
 *
 * Safe-area insets win over the base paddings wherever they are larger
 * (punch-hole cutouts are reported as insets on the side they sit on; the
 * hidden system bars report zero).
 */
export interface EdgeInsetsLike {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface MobileControlsLayout {
  /** Space above the Back / info row. */
  topPadding: number;
  /** Space below the caption / audio / quality row. */
  bottomPadding: number;
  /** Gap below the title block and below the seek section. */
  sectionGap: number;
  titleLines: number;
  descriptionLines: number;
  /** Height of the title logo image when the response carries one. */
  logoHeight: number;
  playIconSize: number;
  playButtonPadding: number;
  skipIconSize: number;
  /** The play button's full height: the centre row never gets shorter. */
  centerMinHeight: number;
}

const PORTRAIT = {
  basePaddingTop: 50,
  basePaddingBottom: 40,
  sectionGap: 20,
  titleLines: 2,
  descriptionLines: 3,
  logoHeight: 72,
  playIconSize: 60,
  playButtonPadding: 20,
  skipIconSize: 32,
} as const;

const LANDSCAPE = {
  basePaddingTop: 12,
  basePaddingBottom: 12,
  sectionGap: 12,
  titleLines: 1,
  descriptionLines: 2,
  logoHeight: 52,
  playIconSize: 44,
  playButtonPadding: 14,
  skipIconSize: 26,
} as const;

export function getMobileControlsLayout(
  isLandscape: boolean,
  insets: EdgeInsetsLike,
): MobileControlsLayout {
  const m = isLandscape ? LANDSCAPE : PORTRAIT;
  return {
    topPadding: Math.max(insets.top, m.basePaddingTop),
    bottomPadding: Math.max(insets.bottom, m.basePaddingBottom),
    sectionGap: m.sectionGap,
    titleLines: m.titleLines,
    descriptionLines: m.descriptionLines,
    logoHeight: m.logoHeight,
    playIconSize: m.playIconSize,
    playButtonPadding: m.playButtonPadding,
    skipIconSize: m.skipIconSize,
    centerMinHeight: m.playIconSize + 2 * m.playButtonPadding,
  };
}
