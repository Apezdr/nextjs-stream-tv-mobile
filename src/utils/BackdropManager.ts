// src/utils/BackdropManager.ts

import { RefObject } from "react";

export interface BackdropOptions {
  fade?: boolean;
  message?: string;
  duration?: number;
  blurhash?: string;
}

export interface BackdropComponentRef {
  show(url: string, options?: BackdropOptions): void;
  hide(options?: { fade?: boolean; duration?: number }): void;
  update(url: string, blurhash?: string): void;
  setMessage(message?: string): void;
}

class BackdropManager {
  private backdropRef: RefObject<BackdropComponentRef | null> | null = null;
  private currentUrl: string | null = null;
  private currentBlurhash: string | null = null;
  private isVisible = false;
  private currentMessage: string | undefined;

  /**
   * Called by your layout when the <GlobalBackdrop ref={...}/> mounts.
   * If a backdrop was already requested, replay it immediately.
   */
  register(ref: RefObject<BackdropComponentRef | null> | null): void {
    this.backdropRef = ref;
    console.log("[BackdropManager] registered:", !!ref);

    // if we already have something visible, replay it immediately
    if (this.isVisible && this.currentUrl && ref?.current) {
      ref.current.show(this.currentUrl, {
        blurhash: this.currentBlurhash ?? undefined,
        message: this.currentMessage,
        fade: true,
        duration: 0, // no re‑fade
      });
    }
  }

  show(url: string, options?: BackdropOptions): void {
    this.currentUrl = url;
    this.currentBlurhash = options?.blurhash ?? null;
    this.currentMessage = options?.message;
    this.isVisible = true;

    if (!this.backdropRef?.current) {
      console.warn(
        "[BackdropManager] No backdrop component registered; skipping show()",
      );
      return;
    }
    console.log("[BackdropManager] show():", url, options);
    this.backdropRef.current.show(url, options);
  }

  hide(options?: { fade?: boolean; duration?: number }): void {
    this.isVisible = false;
    this.currentMessage = undefined;

    if (!this.backdropRef?.current) {
      console.warn(
        "[BackdropManager] No backdrop component registered; skipping hide()",
      );
      return;
    }
    console.log("[BackdropManager] hide():", options);
    this.backdropRef.current.hide(options);
    // clear URL & blurhash so a late replay won’t resurrect it
    this.currentUrl = null;
    this.currentBlurhash = null;
  }

  /**
   * Change the image (and optional blurhash) *without* toggling visibility.
   */
  update(url: string, blurhash?: string): void {
    this.currentUrl = url;
    this.currentBlurhash = blurhash ?? null;

    if (!this.backdropRef?.current) {
      console.warn(
        "[BackdropManager] No backdrop component registered; skipping update()",
      );
      return;
    }
    console.log("[BackdropManager] update():", url, blurhash);
    this.backdropRef.current.update(url, blurhash);
  }

  /**
   * Only updates the loading message (no show/hide).
   */
  setMessage(message?: string): void {
    this.currentMessage = message;
    if (!this.backdropRef?.current) {
      console.warn(
        "[BackdropManager] No backdrop component registered; skipping setMessage()",
      );
      return;
    }
    console.log("[BackdropManager] setMessage():", message);
    this.backdropRef.current.setMessage(message);
  }

  /** Read‑only accessors for diagnostics or conditional logic */
  getCurrentUrl(): string | null {
    return this.currentUrl;
  }
  isBackdropVisible(): boolean {
    return this.isVisible;
  }
  getCurrentMessage(): string | undefined {
    return this.currentMessage;
  }

  /**
   * Convenience: if you pass a URL, it shows; otherwise hides.
   */
  showOrHide(url?: string, options?: BackdropOptions): void {
    if (url) {
      this.show(url, options);
    } else {
      this.hide(options);
    }
  }
}

export const backdropManager = new BackdropManager();
