import {SQUAD_PLAYERS, type PlayerData} from '../data/clubData.ts';
import {
  AnimationRegistry,
  EASINGS,
  triggerLightSweep,
} from './animations.ts';

export interface PlayerCarouselOptions {
  onOpenModal: (player: PlayerData) => void;
  onPinHover?: (active: boolean) => void;
}

/**
 * Interactive 10-player carousel with:
 * - Spring physics on player transition & pointer/touch drag-swipe
 * - Pointer-driven 3D tilt/depth & dynamic light sheen
 * - Interactive tactical pins highlighting & smooth-scrolling to dossier items
 * - Autoplay with pause/resume, progress bar, dots, arrows, and keyboard support
 */
export class PlayerCarousel {
  private readonly options: PlayerCarouselOptions;
  private readonly animRegistry = new AnimationRegistry();

  private readonly viewportEl: HTMLElement;
  private readonly card3dEl: HTMLElement;
  private readonly sheenEl: HTMLElement;
  private readonly plateEl: HTMLElement;
  private readonly pinsEl: HTMLElement;
  private readonly dossierEl: HTMLElement;
  private readonly dossierNumberEl: HTMLElement;
  private readonly dossierRoleEl: HTMLElement;
  private readonly dossierNameInnerEl: HTMLElement;
  private readonly dossierBioEl: HTMLElement;
  private readonly dossierCardsEl: HTMLElement;

  private readonly currentCounterEl: HTMLElement;
  private readonly totalCounterEl: HTMLElement;
  private readonly progressFillEl: HTMLElement;
  private readonly dotsContainerEl: HTMLElement;
  private readonly btnPrev: HTMLButtonElement;
  private readonly btnNext: HTMLButtonElement;
  private readonly btnAutoplay: HTMLButtonElement;
  private readonly autoplayLabelEl: HTMLElement;
  private readonly btnOpenModalInline: HTMLButtonElement;
  private readonly btnOpenModalDossier: HTMLButtonElement;

  private currentIndex = 0;
  private activePinKey: string | null = null;
  private reducedMotion = false;

  // Autoplay state
  private autoplayEnabled = true;
  private autoplayPausedByInteraction = false;
  private autoplayElapsed = 0;
  private readonly autoplayIntervalMs = 5800;

  // Spring physics for slide offset & 3D tilt
  private springX = 0;
  private springVelX = 0;
  private tiltX = 0;
  private tiltY = 0;
  private targetTiltX = 0;
  private targetTiltY = 0;
  private dragging = false;
  private dragStartX = 0;
  private dragDeltaX = 0;

  private rafId: number | null = null;
  private lastFrameMs = 0;
  private disposed = false;

  constructor(options: PlayerCarouselOptions) {
    this.options = options;

    this.viewportEl = document.getElementById('player-viewport')!;
    this.card3dEl = document.getElementById('player-card-3d')!;
    this.sheenEl = document.getElementById('player-card-sheen')!;
    this.plateEl = document.getElementById('player-plate')!;
    this.pinsEl = document.getElementById('player-pins')!;
    this.dossierEl = document.getElementById('player-dossier')!;
    this.dossierNumberEl = document.getElementById('dossier-number')!;
    this.dossierRoleEl = document.getElementById('dossier-role')!;
    this.dossierNameInnerEl = document.querySelector('#dossier-name .mask-inner')!;
    this.dossierBioEl = document.getElementById('dossier-bio')!;
    this.dossierCardsEl = document.getElementById('dossier-cards')!;

    this.currentCounterEl = document.getElementById('carousel-current')!;
    this.totalCounterEl = document.getElementById('carousel-total')!;
    this.progressFillEl = document.getElementById('carousel-progress-fill')!;
    this.dotsContainerEl = document.getElementById('carousel-dots')!;
    this.btnPrev = document.getElementById('btn-prev-player') as HTMLButtonElement;
    this.btnNext = document.getElementById('btn-next-player') as HTMLButtonElement;
    this.btnAutoplay = document.getElementById('btn-autoplay') as HTMLButtonElement;
    this.autoplayLabelEl = document.getElementById('autoplay-label')!;
    this.btnOpenModalInline = document.getElementById(
      'btn-open-player-modal'
    ) as HTMLButtonElement;
    this.btnOpenModalDossier = document.getElementById(
      'btn-player-details'
    ) as HTMLButtonElement;

    this.totalCounterEl.textContent = String(SQUAD_PLAYERS.length).padStart(2, '0');
    this.buildDots();
    this.bindEvents();
    this.renderPlayer(0, 0, true);
    this.lastFrameMs = performance.now();
    this.tick(this.lastFrameMs);
  }

  public setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    if (reduced) {
      this.autoplayEnabled = false;
      this.updateAutoplayUI();
      this.card3dEl.style.transform = 'none';
      this.springX = 0;
      this.springVelX = 0;
    }
  }

  public getCurrentPlayer(): PlayerData {
    return SQUAD_PLAYERS[this.currentIndex];
  }

  public next(): void {
    this.goTo((this.currentIndex + 1) % SQUAD_PLAYERS.length, 1);
  }

  public prev(): void {
    this.goTo(
      (this.currentIndex - 1 + SQUAD_PLAYERS.length) % SQUAD_PLAYERS.length,
      -1
    );
  }

  public goTo(index: number, direction?: number): void {
    const normalized =
      ((index % SQUAD_PLAYERS.length) + SQUAD_PLAYERS.length) %
      SQUAD_PLAYERS.length;
    if (normalized === this.currentIndex && direction === undefined) return;
    const dir =
      direction ?? (normalized > this.currentIndex ? 1 : -1);
    this.currentIndex = normalized;
    this.autoplayElapsed = 0;
    this.activePinKey = null;

    if (!this.reducedMotion) {
      // Launch spring impulse on slide change
      this.springX = dir * 48;
      this.springVelX = -dir * 260;
    }
    this.renderPlayer(normalized, dir, false);
  }

  private buildDots(): void {
    this.dotsContainerEl.innerHTML = '';
    SQUAD_PLAYERS.forEach((player, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'carousel-dot';
      btn.setAttribute('role', 'tab');
      btn.setAttribute('data-cursor', 'hover');
      btn.setAttribute('aria-label', `${player.fullName}, номер ${player.number}`);
      btn.innerHTML = `<span class="dot-num">${player.number}</span><span class="dot-surname">${player.lastName}</span>`;
      btn.addEventListener('click', () => this.goTo(idx));
      this.dotsContainerEl.appendChild(btn);
    });
  }

  private bindEvents(): void {
    this.btnPrev.addEventListener('click', () => this.prev());
    this.btnNext.addEventListener('click', () => this.next());

    this.btnAutoplay.addEventListener('click', () => {
      this.autoplayEnabled = !this.autoplayEnabled;
      this.autoplayElapsed = 0;
      this.updateAutoplayUI();
    });

    const openCurrent = () => this.options.onOpenModal(this.getCurrentPlayer());
    this.btnOpenModalInline.addEventListener('click', (e) => {
      e.stopPropagation();
      openCurrent();
    });
    this.btnOpenModalDossier.addEventListener('click', openCurrent);

    // Pause autoplay while hovering or focusing the carousel section
    const squadSection = document.getElementById('squad');
    squadSection?.addEventListener('pointerenter', () => {
      this.autoplayPausedByInteraction = true;
    });
    squadSection?.addEventListener('pointerleave', () => {
      this.autoplayPausedByInteraction = false;
    });

    // Pointer 3D tilt + drag/swipe on player card viewport
    this.viewportEl.addEventListener('pointerdown', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('button')) return;
      this.dragging = true;
      this.dragStartX = e.clientX;
      this.dragDeltaX = 0;
      this.viewportEl.classList.add('is-dragging');
      this.viewportEl.setPointerCapture(e.pointerId);
    });

    this.viewportEl.addEventListener('pointermove', (e) => {
      const rect = this.viewportEl.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && !this.reducedMotion) {
        const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
        this.targetTiltY = nx * 9.5;
        this.targetTiltX = ny * -7.5;

        const px = ((e.clientX - rect.left) / rect.width) * 100;
        const py = ((e.clientY - rect.top) / rect.height) * 100;
        this.sheenEl.style.background = `radial-gradient(circle at ${px.toFixed(1)}% ${py.toFixed(1)}%, rgba(242,201,76,0.22), rgba(217,30,42,0.08) 38%, transparent 70%)`;
      }

      if (this.dragging) {
        this.dragDeltaX = e.clientX - this.dragStartX;
        if (!this.reducedMotion) {
          this.springX = this.dragDeltaX * 0.42;
        }
      }
    });

    const endDrag = (e: PointerEvent) => {
      if (!this.dragging) return;
      this.dragging = false;
      this.viewportEl.classList.remove('is-dragging');
      if (this.viewportEl.hasPointerCapture(e.pointerId)) {
        this.viewportEl.releasePointerCapture(e.pointerId);
      }
      if (Math.abs(this.dragDeltaX) > 48) {
        if (this.dragDeltaX < 0) this.next();
        else this.prev();
      }
      this.dragDeltaX = 0;
    };

    this.viewportEl.addEventListener('pointerup', endDrag);
    this.viewportEl.addEventListener('pointercancel', endDrag);
    this.viewportEl.addEventListener('pointerleave', () => {
      this.targetTiltX = 0;
      this.targetTiltY = 0;
    });

    // Keyboard navigation when carousel viewport is focused or globally via arrow keys in section
    this.viewportEl.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.prev();
      } else if (e.key === 'Enter' || e.key === ' ') {
        const active = document.activeElement;
        if (active === this.viewportEl) {
          e.preventDefault();
          openCurrent();
        }
      }
    });
  }

  private updateAutoplayUI(): void {
    this.btnAutoplay.setAttribute('aria-pressed', String(this.autoplayEnabled));
    this.btnAutoplay.setAttribute(
      'aria-label',
      this.autoplayEnabled
        ? 'Пауза автопрокрутки карусели'
        : 'Возобновить автопрокрутку карусели'
    );
    this.autoplayLabelEl.textContent = this.autoplayEnabled
      ? 'Авто: вкл'
      : 'Авто: пауза';
  }

  private renderPlayer(index: number, dir: number, initial: boolean): void {
    const player = SQUAD_PLAYERS[index];

    this.animRegistry.commitAndCancelAll();

    // Update counters & progress
    this.currentCounterEl.textContent = String(index + 1).padStart(2, '0');
    const progressPct = ((index + 1) / SQUAD_PLAYERS.length) * 100;
    this.progressFillEl.style.width = `${progressPct}%`;

    // Update dot active state
    const dots = this.dotsContainerEl.querySelectorAll<HTMLButtonElement>('.carousel-dot');
    dots.forEach((dot, i) => {
      const isCurrent = i === index;
      dot.classList.toggle('is-active', isCurrent);
      dot.setAttribute('aria-selected', String(isCurrent));
    });

    // Render bespoke editorial jersey & heraldic visual plate
    this.plateEl.innerHTML = this.createPlayerPlateMarkup(player);

    // Render interactive hotspot pins
    this.pinsEl.innerHTML = '';
    player.pins.forEach((pin, pinIdx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'player-pin';
      btn.style.left = `${pin.x}%`;
      btn.style.top = `${pin.y}%`;
      btn.dataset.dossierKey = pin.dossierKey;
      btn.setAttribute('data-cursor', 'pin');
      btn.setAttribute(
        'aria-label',
        `${pin.label} — перейти к пункту досье игрока`
      );
      btn.innerHTML = `
        <span class="pin-core"></span>
        <span class="pin-tag">${pin.shortTag}</span>
        <span class="pin-tooltip">${pin.label}</span>
      `;

      btn.addEventListener('pointerenter', () => {
        this.highlightDossierKey(pin.dossierKey, false);
        this.options.onPinHover?.(true);
      });
      btn.addEventListener('pointerleave', () => {
        if (this.activePinKey !== pin.dossierKey) {
          this.highlightDossierKey(this.activePinKey, false);
        }
        this.options.onPinHover?.(false);
      });
      btn.addEventListener('focus', () => {
        this.highlightDossierKey(pin.dossierKey, false);
      });
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.activePinKey = pin.dossierKey;
        this.highlightDossierKey(pin.dossierKey, true);
      });

      this.pinsEl.appendChild(btn);

      if (!initial) {
        this.animRegistry.run(
          btn,
          [
            {opacity: 0, transform: 'translate(-50%, -50%) scale(0.4)'},
            {opacity: 1, transform: 'translate(-50%, -50%) scale(1)'},
          ],
          {duration: 360, delay: 140 + pinIdx * 55, easing: EASINGS.EASE_OUT},
          this.reducedMotion
        );
      }
    });

    // Update dossier identity
    this.dossierNumberEl.textContent = player.number;
    this.dossierRoleEl.textContent = `${player.role} · ${player.height}`;
    this.dossierNameInnerEl.textContent = player.fullName;
    this.dossierBioEl.textContent = player.bio;

    // Render linked dossier blocks
    this.dossierCardsEl.innerHTML = '';
    player.dossier.forEach((block, bIdx) => {
      const card = document.createElement('article');
      card.className = 'dossier-card sweep-host';
      card.dataset.dossierKey = block.key;
      card.tabIndex = 0;
      card.setAttribute('data-cursor', 'hover');
      card.innerHTML = `
        <div class="dossier-card-top">
          <span class="dossier-card-label">${block.title}</span>
          <span class="dossier-card-val">${block.value}</span>
        </div>
        <p class="dossier-card-detail">${block.detail}</p>
      `;

      card.addEventListener('pointerenter', () =>
        this.highlightDossierKey(block.key, false)
      );
      card.addEventListener('pointerleave', () =>
        this.highlightDossierKey(this.activePinKey, false)
      );
      card.addEventListener('focus', () =>
        this.highlightDossierKey(block.key, false)
      );

      this.dossierCardsEl.appendChild(card);

      if (!initial) {
        this.animRegistry.run(
          card,
          [
            {opacity: 0, transform: 'translateY(14px)'},
            {opacity: 1, transform: 'translateY(0)'},
          ],
          {duration: 420, delay: 90 + bIdx * 55, easing: EASINGS.COUT},
          this.reducedMotion
        );
      }
    });

    // Masked text reveal on player switch
    if (!initial) {
      const slideSign = dir >= 0 ? 1 : -1;
      this.animRegistry.run(
        this.dossierNameInnerEl,
        [
          {transform: `translateY(${slideSign * 105}%)`, opacity: 0},
          {transform: 'translateY(0%)', opacity: 1},
        ],
        {duration: 520, easing: EASINGS.COUT},
        this.reducedMotion
      );
      this.animRegistry.run(
        this.plateEl,
        [
          {opacity: 0.25, transform: `translateX(${slideSign * 26}px) scale(0.97)`},
          {opacity: 1, transform: 'translateX(0px) scale(1)'},
        ],
        {duration: 540, easing: EASINGS.QOUT},
        this.reducedMotion
      );
    }
  }

  private highlightDossierKey(key: string | null, scrollIntoView: boolean): void {
    const pinEls = this.pinsEl.querySelectorAll<HTMLElement>('.player-pin');
    pinEls.forEach((p) => {
      p.classList.toggle('is-active', Boolean(key && p.dataset.dossierKey === key));
    });

    const cardEls =
      this.dossierCardsEl.querySelectorAll<HTMLElement>('.dossier-card');
    cardEls.forEach((card) => {
      const match = Boolean(key && card.dataset.dossierKey === key);
      card.classList.toggle('is-highlighted', match);
      if (match && scrollIntoView) {
        triggerLightSweep(card, this.reducedMotion);
        card.scrollIntoView({
          behavior: this.reducedMotion ? 'auto' : 'smooth',
          block: 'nearest',
        });
      }
    });
  }

  /**
   * Builds a high-contrast editorial sports campaign plate using generated
   * Leica 35mm photography, measured contrast scrim, and crisp kit metadata.
   */
  private createPlayerPlateMarkup(player: PlayerData): string {
    return `
      <div class="plate-backdrop" style="--player-accent: ${player.accentHue};">
        <img
          class="plate-photo"
          src="${player.photoSrc}"
          alt="${player.fullName} — ФК «Славия-Мозырь», № ${player.number}"
          referrerpolicy="no-referrer"
          style="object-position: ${player.photoPosition};"
        />
        <div class="plate-scrim" aria-hidden="true"></div>
        <div class="plate-frame-meta">
          <div class="plate-corner-id">
            <span class="plate-jersey-num mono-accent">${player.number}</span>
            <span class="plate-jersey-surname">${player.jerseyLabel}</span>
          </div>
          <div class="plate-meta-bar">
            <span>${player.role}</span>
            <span aria-hidden="true">·</span>
            <span>${player.birthDate}</span>
            <span aria-hidden="true">·</span>
            <span>${player.height}</span>
          </div>
        </div>
      </div>
    `;
  }

  private tick = (now: number): void => {
    if (this.disposed) return;

    const dt = Math.min(Math.max((now - this.lastFrameMs) / 1000, 0.001), 0.05);
    this.lastFrameMs = now;

    // Autoplay progression
    if (
      this.autoplayEnabled &&
      !this.autoplayPausedByInteraction &&
      !this.dragging &&
      !this.reducedMotion
    ) {
      this.autoplayElapsed += dt * 1000;
      if (this.autoplayElapsed >= this.autoplayIntervalMs) {
        this.autoplayElapsed = 0;
        this.next();
      }
    }

    // Spring physics + 3D tilt transform
    if (!this.reducedMotion) {
      if (!this.dragging) {
        const stiffness = 175;
        const damping = 18;
        const force = -stiffness * this.springX - damping * this.springVelX;
        this.springVelX += force * dt;
        this.springX += this.springVelX * dt;
        if (Math.abs(this.springX) < 0.05 && Math.abs(this.springVelX) < 0.2) {
          this.springX = 0;
          this.springVelX = 0;
        }
      }

      const tiltDamp = 1 - Math.exp(-9 * dt);
      this.tiltX += (this.targetTiltX - this.tiltX) * tiltDamp;
      this.tiltY += (this.targetTiltY - this.tiltY) * tiltDamp;

      const dragSkew = this.springX * 0.08;
      this.card3dEl.style.transform = `perspective(1100px) translate3d(${this.springX.toFixed(2)}px, 0, 0) rotateX(${this.tiltX.toFixed(2)}deg) rotateY(${(this.tiltY + dragSkew).toFixed(2)}deg)`;
    }

    this.rafId = requestAnimationFrame(this.tick);
  };

  public dispose(): void {
    this.disposed = true;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.animRegistry.commitAndCancelAll();
  }
}
