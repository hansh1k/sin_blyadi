/**
 * Web Animations API orchestrator following the rhythm, masks, easing curves,
 * and commitStyles() / cancel() state discipline from code1.txt & promt1.txt.
 */

export const EASINGS = {
  EASE_OUT: 'cubic-bezier(.16,1,.3,1)',
  QOUT: 'cubic-bezier(.25,1,.5,1)',
  COUT: 'cubic-bezier(.33,1,.68,1)',
  CIN: 'cubic-bezier(.32,0,.67,0)',
} as const;

export class AnimationRegistry {
  private active = new Set<Animation>();

  public run(
    el: Element | null,
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions,
    reducedMotion = false
  ): Animation | null {
    if (!el) return null;
    if (reducedMotion) {
      const last = keyframes[keyframes.length - 1];
      if (last && el instanceof HTMLElement) {
        if (last.opacity !== undefined) el.style.opacity = String(last.opacity);
        if (last.transform !== undefined)
          el.style.transform = String(last.transform);
      }
      return null;
    }

    const anim = el.animate(keyframes, {
      fill: 'both',
      ...options,
    });
    this.active.add(anim);
    anim.onfinish = () => {
      try {
        anim.commitStyles();
      } catch {
        // Element may be detached or hidden
      }
      anim.cancel();
      this.active.delete(anim);
    };
    anim.oncancel = () => {
      this.active.delete(anim);
    };
    return anim;
  }

  /**
   * Commits current interpolated styles and cancels every running animation
   * before transitioning states (exact code1.txt pattern).
   */
  public commitAndCancelAll(): void {
    for (const anim of Array.from(this.active)) {
      try {
        anim.commitStyles();
      } catch {
        // Ignore if target cannot commit
      }
      anim.cancel();
    }
    this.active.clear();
  }
}

/**
 * Triggers a metallic light-sweep highlight across a `.sweep-host` container.
 */
export function triggerLightSweep(
  el: HTMLElement | null,
  reducedMotion: boolean
): void {
  if (!el || reducedMotion) return;
  el.classList.remove('is-sweeping');
  // Force reflow so rapid re-triggers restart cleanly
  void el.offsetWidth;
  el.classList.add('is-sweeping');
}

/**
 * Executes the choreographed masked load sequence inspired by code1.txt:
 * - Nav links drop in sequentially (100ms stagger)
 * - Hero title slides down from top mask
 * - Hero body slides up from bottom mask
 * - Monumental club letters «СЛАВІЯ» reveal in rhythmic order [0, 1, 4, 3, 2, 5]
 * - Four hero captions slide up left-to-right
 */
export function playHeroIntroSequence(
  stageEl: HTMLElement,
  registry: AnimationRegistry,
  reducedMotion: boolean
): void {
  registry.commitAndCancelAll();
  stageEl.classList.remove('pre');

  if (reducedMotion) {
    stageEl.classList.add('rm');
    return;
  }
  stageEl.classList.remove('rm');

  // 1. Nav links dropping down out of overflow-hidden masks
  const navLinks = stageEl.querySelectorAll('.nav-list .nav-link');
  navLinks.forEach((link, i) => {
    registry.run(
      link,
      [
        {transform: 'translateY(-115%)', opacity: 0},
        {transform: 'translateY(0%)', opacity: 1},
      ],
      {duration: 360, delay: 120 + i * 95, easing: EASINGS.COUT}
    );
  });

  // 2. Topbar actions & glyph rail
  const replayBtn = stageEl.querySelector('#btn-replay-crest');
  registry.run(
    replayBtn,
    [
      {opacity: 0, transform: 'translateY(-10px)'},
      {opacity: 1, transform: 'translateY(0)'},
    ],
    {duration: 320, delay: 480, easing: EASINGS.COUT}
  );

  const glyphRail = stageEl.querySelector('.glyph-rail');
  registry.run(
    glyphRail,
    [
      {opacity: 0, transform: 'translateX(-12px)'},
      {opacity: 1, transform: 'translateX(0)'},
    ],
    {duration: 450, delay: 560, easing: EASINGS.COUT}
  );

  // 3. Hero eyebrow & title sliding down out of top mask
  const eyebrow = stageEl.querySelector('[data-intro="eyebrow"]');
  registry.run(
    eyebrow,
    [
      {transform: 'translateY(-110%)', opacity: 0},
      {transform: 'translateY(0%)', opacity: 1},
    ],
    {duration: 620, delay: 260, easing: EASINGS.COUT}
  );

  const title = stageEl.querySelector('[data-intro="title"]');
  registry.run(
    title,
    [
      {transform: 'translateY(-105%)', opacity: 0},
      {transform: 'translateY(0%)', opacity: 1},
    ],
    {duration: 920, delay: 390, easing: EASINGS.COUT}
  );

  // 4. Hero lead body & CTA sliding up from bottom mask
  const body = stageEl.querySelector('[data-intro="body"]');
  registry.run(
    body,
    [
      {transform: 'translateY(105%)', opacity: 0},
      {transform: 'translateY(0%)', opacity: 1},
    ],
    {duration: 880, delay: 460, easing: EASINGS.COUT}
  );

  const cta = stageEl.querySelector('[data-intro="cta"]');
  registry.run(
    cta,
    [
      {transform: 'translateY(115%)', opacity: 0},
      {transform: 'translateY(0%)', opacity: 1},
    ],
    {duration: 720, delay: 620, easing: EASINGS.QOUT}
  );

  // 5. Big monumental word letters emerging in staggered non-linear order (1,2,5,4,3,6)
  const letterDelays = [0, 100, 270, 230, 190, 360];
  const letters = stageEl.querySelectorAll('#big-word i');
  letters.forEach((letter, i) => {
    registry.run(
      letter,
      [
        {opacity: 0, transform: 'translateY(0.14em)'},
        {opacity: 1, transform: 'translateY(0em)'},
      ],
      {
        duration: 520,
        delay: 640 + (letterDelays[i] ?? i * 80),
        easing: EASINGS.COUT,
      }
    );
  });

  // 6. Four captions sliding up out of masks left-to-right
  const captionDelays = [740, 860, 960, 1040];
  const captions = stageEl.querySelectorAll('[data-intro="caption"]');
  captions.forEach((cap, i) => {
    registry.run(
      cap,
      [
        {transform: 'translateY(108%)', opacity: 0},
        {transform: 'translateY(0%)', opacity: 1},
      ],
      {
        duration: 380,
        delay: captionDelays[i] ?? 740 + i * 100,
        easing: EASINGS.COUT,
      }
    );
  });
}

/**
 * Sets up masked reveal observer for section titles below the fold.
 */
export function observeSectionMaskReveals(
  reducedMotion: boolean
): IntersectionObserver | null {
  const targets = document.querySelectorAll<HTMLElement>(
    '.section-title .mask-inner'
  );
  if (reducedMotion || typeof IntersectionObserver === 'undefined') {
    targets.forEach((el) => el.classList.add('is-revealed'));
    return null;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          observer.unobserve(entry.target);
        }
      }
    },
    {threshold: 0.25}
  );

  targets.forEach((el) => observer.observe(el));
  return observer;
}
