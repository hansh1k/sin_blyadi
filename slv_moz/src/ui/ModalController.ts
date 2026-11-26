import {CLUB_CREST_SRC, type PlayerData, type TrophyData} from '../data/clubData.ts';
import {AnimationRegistry, EASINGS} from './animations.ts';

/**
 * Accessible Lightbox / Detail Modal for both Players and Club Trophies.
 * Supports smooth masked open/close, backdrop click, close button, Escape key,
 * and focus restoration.
 */
export class ModalController {
  private readonly modalEl: HTMLElement;
  private readonly backdropEl: HTMLElement;
  private readonly dialogEl: HTMLElement;
  private readonly bodyEl: HTMLElement;
  private readonly closeBtn: HTMLButtonElement;
  private readonly anims = new AnimationRegistry();

  private isOpen = false;
  private reducedMotion = false;
  private lastFocused: HTMLElement | null = null;
  private onStateChange?: (open: boolean) => void;

  constructor(onStateChange?: (open: boolean) => void) {
    this.onStateChange = onStateChange;
    this.modalEl = document.getElementById('detail-modal')!;
    this.backdropEl = document.getElementById('modal-backdrop')!;
    this.dialogEl = document.getElementById('modal-dialog')!;
    this.bodyEl = document.getElementById('modal-body')!;
    this.closeBtn = document.getElementById('modal-close') as HTMLButtonElement;

    this.closeBtn.addEventListener('click', () => this.close());
    this.backdropEl.addEventListener('click', () => this.close());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        e.preventDefault();
        this.close();
      }
    });
  }

  public setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
  }

  public getIsOpen(): boolean {
    return this.isOpen;
  }

  public openPlayer(player: PlayerData): void {
    const traitsHtml = player.traits
      .map((t) => `<span class="modal-trait">${t}</span>`)
      .join('<span class="meta-sep">·</span>');

    const dossierRows = player.dossier
      .map(
        (d) => `
        <div class="modal-stat-item">
          <span class="modal-stat-label">${d.title}</span>
          <strong class="modal-stat-val">${d.value}</strong>
          <p class="modal-stat-desc">${d.detail}</p>
        </div>`
      )
      .join('');

    this.bodyEl.innerHTML = `
      <div class="modal-eyebrow">Досье игрока · ФК «Славия-Мозырь»</div>
      <div class="modal-player-header">
        <div class="modal-player-portrait">
          <img
            src="${player.photoSrc}"
            alt="${player.fullName}"
            referrerpolicy="no-referrer"
          />
        </div>
        <div class="modal-player-id">
          <div class="modal-jersey-badge mono-accent">№ ${player.number}</div>
          <h2 id="modal-title" class="modal-title">${player.fullName}</h2>
          <p class="modal-subtitle">${player.role} · Род. ${player.birthDate} · ${player.height}</p>
        </div>
      </div>
      <p class="modal-lead">${player.extendedStory}</p>
      <div class="modal-traits-row">${traitsHtml}</div>
      <div class="modal-stats-grid">${dossierRows}</div>
    `;
    this.show();
  }

  public openTrophy(trophy: TrophyData): void {
    const statsHtml = trophy.stats
      .map(
        (s) => `
        <div class="modal-stat-item">
          <span class="modal-stat-label">${s.label}</span>
          <strong class="modal-stat-val">${s.value}</strong>
        </div>`
      )
      .join('');

    this.bodyEl.innerHTML = `
      <div class="modal-trophy-head">
        <img
          class="modal-trophy-crest"
          src="${CLUB_CREST_SRC}"
          alt="Герб ФК «Славия-Мозырь»"
          referrerpolicy="no-referrer"
        />
        <div>
          <div class="modal-eyebrow">${trophy.category} · Сезон ${trophy.season}</div>
          <h2 id="modal-title" class="modal-title">${trophy.title}</h2>
        </div>
      </div>
      <p class="modal-lead">${trophy.details}</p>
      <p class="modal-fact-quote">${trophy.fact}</p>
      <div class="modal-stats-grid">${statsHtml}</div>
    `;
    this.show();
  }

  private show(): void {
    this.lastFocused = document.activeElement as HTMLElement | null;
    this.isOpen = true;
    this.modalEl.hidden = false;
    document.body.classList.add('modal-open');
    this.onStateChange?.(true);

    this.anims.commitAndCancelAll();
    this.anims.run(
      this.backdropEl,
      [{opacity: 0}, {opacity: 1}],
      {duration: 280, easing: EASINGS.COUT},
      this.reducedMotion
    );
    this.anims.run(
      this.dialogEl,
      [
        {opacity: 0, transform: 'translateY(26px) scale(0.96)'},
        {opacity: 1, transform: 'translateY(0) scale(1)'},
      ],
      {duration: 420, easing: EASINGS.EASE_OUT},
      this.reducedMotion
    );

    requestAnimationFrame(() => {
      this.closeBtn.focus();
    });
  }

  public close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    document.body.classList.remove('modal-open');
    this.onStateChange?.(false);

    if (this.reducedMotion) {
      this.modalEl.hidden = true;
      this.lastFocused?.focus();
      return;
    }

    this.anims.commitAndCancelAll();
    this.anims.run(
      this.backdropEl,
      [{opacity: 1}, {opacity: 0}],
      {duration: 220, easing: EASINGS.CIN}
    );
    const anim = this.anims.run(
      this.dialogEl,
      [
        {opacity: 1, transform: 'translateY(0) scale(1)'},
        {opacity: 0, transform: 'translateY(18px) scale(0.97)'},
      ],
      {duration: 240, easing: EASINGS.CIN}
    );
    if (anim) {
      anim.addEventListener('finish', () => {
        if (!this.isOpen) {
          this.modalEl.hidden = true;
          this.lastFocused?.focus();
        }
      });
    } else {
      this.modalEl.hidden = true;
      this.lastFocused?.focus();
    }
  }
}
