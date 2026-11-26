export type CursorMode = 'default' | 'hover' | 'drag' | 'inspect' | 'pin';

const CURSOR_LABELS: Record<CursorMode, string> = {
  default: '',
  hover: '',
  drag: 'ТЯНИ',
  inspect: '3D',
  pin: 'ИНФО',
};

/**
 * Custom interactive cursor active strictly on fine-pointer hover devices.
 * Smoothly follows pointer with subtle damping and switches state on interactive targets.
 */
export class CustomCursor {
  private readonly el: HTMLElement;
  private readonly labelEl: HTMLElement;
  private readonly enabled: boolean;

  private targetX = -100;
  private targetY = -100;
  private currentX = -100;
  private currentY = -100;
  private visible = false;
  private mode: CursorMode = 'default';
  private overrideMode: CursorMode | null = null;
  private reducedMotion = false;
  private rafId: number | null = null;

  constructor() {
    this.el = document.getElementById('custom-cursor')!;
    this.labelEl = document.getElementById('cursor-label')!;
    this.enabled = window.matchMedia(
      '(hover: hover) and (pointer: fine)'
    ).matches;

    if (!this.enabled) {
      this.el.style.display = 'none';
      return;
    }

    document.body.classList.add('has-custom-cursor');
    this.bindEvents();
    this.tick();
  }

  public setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
  }

  public setOverrideMode(mode: CursorMode | null): void {
    if (!this.enabled) return;
    this.overrideMode = mode;
    this.applyMode(mode ?? this.mode);
  }

  private bindEvents(): void {
    window.addEventListener(
      'pointermove',
      (e) => {
        this.targetX = e.clientX;
        this.targetY = e.clientY;
        if (!this.visible) {
          this.visible = true;
          this.currentX = e.clientX;
          this.currentY = e.clientY;
          this.el.classList.add('is-visible');
        }
        const target = e.target as HTMLElement | null;
        const holder = target?.closest<HTMLElement>('[data-cursor]');
        const detected = (holder?.dataset.cursor as CursorMode) || 'default';
        this.mode = detected;
        if (!this.overrideMode) {
          this.applyMode(detected);
        }
      },
      {passive: true}
    );

    window.addEventListener('pointerdown', () => {
      this.el.classList.add('is-down');
    });
    window.addEventListener('pointerup', () => {
      this.el.classList.remove('is-down');
    });
    document.addEventListener('mouseleave', () => {
      this.visible = false;
      this.el.classList.remove('is-visible');
    });
  }

  private applyMode(next: CursorMode): void {
    this.el.dataset.mode = next;
    this.labelEl.textContent = CURSOR_LABELS[next] ?? '';
  }

  private tick = (): void => {
    const ease = this.reducedMotion ? 1 : 0.22;
    this.currentX += (this.targetX - this.currentX) * ease;
    this.currentY += (this.targetY - this.currentY) * ease;
    this.el.style.transform = `translate3d(${this.currentX.toFixed(1)}px, ${this.currentY.toFixed(1)}px, 0)`;
    this.rafId = requestAnimationFrame(this.tick);
  };

  public dispose(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    document.body.classList.remove('has-custom-cursor');
  }
}
