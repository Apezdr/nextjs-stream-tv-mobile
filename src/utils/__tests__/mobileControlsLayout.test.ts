import { getMobileControlsLayout } from "../mobileControlsLayout";

const NO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 };

describe("getMobileControlsLayout", () => {
  it("keeps the portrait chrome as it always was", () => {
    const layout = getMobileControlsLayout(false, NO_INSETS);
    expect(layout).toMatchObject({
      topPadding: 50,
      bottomPadding: 40,
      sectionGap: 20,
      titleLines: 2,
      descriptionLines: 3,
      playIconSize: 60,
      playButtonPadding: 20,
      skipIconSize: 32,
    });
  });

  it("tightens the chrome in landscape", () => {
    const portrait = getMobileControlsLayout(false, NO_INSETS);
    const landscape = getMobileControlsLayout(true, NO_INSETS);
    expect(landscape.topPadding).toBeLessThan(portrait.topPadding);
    expect(landscape.bottomPadding).toBeLessThan(portrait.bottomPadding);
    expect(landscape.sectionGap).toBeLessThan(portrait.sectionGap);
    expect(landscape.titleLines).toBe(1);
    expect(landscape.descriptionLines).toBe(2);
    expect(landscape.logoHeight).toBeLessThan(portrait.logoHeight);
    expect(landscape.playIconSize).toBeLessThan(portrait.playIconSize);
    expect(landscape.skipIconSize).toBeLessThan(portrait.skipIconSize);
  });

  it("reserves the full play button height for the centre row", () => {
    for (const isLandscape of [false, true]) {
      const layout = getMobileControlsLayout(isLandscape, NO_INSETS);
      expect(layout.centerMinHeight).toBe(
        layout.playIconSize + 2 * layout.playButtonPadding,
      );
    }
  });

  it("lets a larger safe-area inset win over the base padding", () => {
    const insets = { top: 60, bottom: 48, left: 35, right: 0 };
    const portrait = getMobileControlsLayout(false, insets);
    expect(portrait.topPadding).toBe(60);
    expect(portrait.bottomPadding).toBe(48);
    const landscape = getMobileControlsLayout(true, insets);
    expect(landscape.topPadding).toBe(60);
    expect(landscape.bottomPadding).toBe(48);
  });

  it("gives the docked strip a few points of padding and ignores insets", () => {
    const insets = { top: 60, bottom: 48, left: 0, right: 0 };
    const docked = getMobileControlsLayout(false, insets, true);
    const portrait = getMobileControlsLayout(false, insets);
    expect(docked.topPadding).toBe(8);
    expect(docked.bottomPadding).toBe(6);
    expect(docked.titleLines).toBe(0);
    expect(docked.descriptionLines).toBe(0);
    expect(docked.playIconSize).toBeLessThan(portrait.playIconSize);
    expect(docked.skipIconSize).toBeLessThan(portrait.skipIconSize);
    expect(docked.centerMinHeight).toBe(
      docked.playIconSize + 2 * docked.playButtonPadding,
    );
  });

  it("keeps the base padding when the inset is smaller", () => {
    const insets = { top: 24, bottom: 0, left: 0, right: 0 };
    expect(getMobileControlsLayout(false, insets).topPadding).toBe(50);
    expect(getMobileControlsLayout(true, insets).topPadding).toBe(24);
    expect(getMobileControlsLayout(true, insets).bottomPadding).toBe(12);
  });
});
