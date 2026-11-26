import {
  CLUB_HISTORY,
  CLUB_TROPHIES,
  STADIUM_FACTS,
  type TrophyData,
} from './data/clubData.ts';
import {Stage3D} from './scene/Stage3D.ts';
import {
  AnimationRegistry,
  observeSectionMaskReveals,
  playHeroIntroSequence,
  triggerLightSweep,
} from './ui/animations.ts';
import {CustomCursor} from './ui/CustomCursor.ts';
import {ModalController} from './ui/ModalController.ts';
import {PlayerCarousel} from './ui/PlayerCarousel.ts';

class SlaviaPortalApp {
  private readonly stageEl: HTMLElement;
  private readonly webglContainer: HTMLElement;
  private readonly introAnimations = new AnimationRegistry();

  private readonly stage3D: Stage3D;
  private readonly modal: ModalController;
  private readonly carousel: PlayerCarousel;
  private readonly cursor: CustomCursor;

  private readonly reducedMotionQuery = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  );
  private reducedMotion = this.reducedMotionQuery.matches;

  private activeTrophy: TrophyData = CLUB_TROPHIES[0];
  private sectionObserver: IntersectionObserver | null = null;
  private navObserver: IntersectionObserver | null = null;

  constructor() {
    this.stageEl = document.getElementById('stage')!;
    this.webglContainer = document.getElementById('webgl-stage')!;

    this.cursor = new CustomCursor();
    this.cursor.setReducedMotion(this.reducedMotion);

    this.modal = new ModalController();
    this.modal.setReducedMotion(this.reducedMotion);

    this.stage3D = new Stage3D(this.webglContainer, {
      onTrophyHover: (trophy) => {
        if (trophy) {
          this.updateTrophyInspector(trophy, false);
          this.cursor.setOverrideMode('inspect');
        } else {
          this.updateTrophyInspector(this.activeTrophy, false);
          this.cursor.setOverrideMode(null);
        }
      },
      onTrophySelect: (trophy) => {
        this.activeTrophy = trophy;
        this.updateTrophyInspector(trophy, true);
        this.modal.openTrophy(trophy);
      },
    });

    this.carousel = new PlayerCarousel({
      onOpenModal: (player) => this.modal.openPlayer(player),
      onPinHover: (active) =>
        this.cursor.setOverrideMode(active ? 'pin' : null),
    });
    this.carousel.setReducedMotion(this.reducedMotion);

    this.renderTrophyDock();
    this.renderChronicle();
    this.bindNavigationAndControls();
    this.bindTrophyStageInteraction();
    this.bindReducedMotionListener();

    this.bootSequence();
  }

  private async bootSequence(): Promise<void> {
    // Start 3D crest assembly immediately on transparent WebGL canvas
    this.stage3D.start(this.reducedMotion);

    // Wait briefly for Cyrillic Google Fonts (with failsafe, matching code1.txt)
    const fontWait = document.fonts ? document.fonts.ready : Promise.resolve();
    await Promise.race([
      fontWait,
      new Promise<void>((resolve) => window.setTimeout(resolve, 1200)),
    ]);

    requestAnimationFrame(() => {
      playHeroIntroSequence(
        this.stageEl,
        this.introAnimations,
        this.reducedMotion
      );
      this.sectionObserver = observeSectionMaskReveals(this.reducedMotion);
    });
  }

  private renderTrophyDock(): void {
    const dock = document.getElementById('trophy-dock');
    if (!dock) return;
    dock.innerHTML = '';

    CLUB_TROPHIES.forEach((trophy, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `trophy-dock-btn${idx === 0 ? ' is-active' : ''}`;
      btn.dataset.trophyId = trophy.id;
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', String(idx === 0));
      btn.setAttribute('data-cursor', 'hover');
      btn.innerHTML = `
        <span class="dock-season">${trophy.season}</span>
        <span class="dock-name">${trophy.shortTitle}</span>
      `;

      btn.addEventListener('pointerenter', () => {
        this.stage3D.hoverTrophyById(trophy.id);
        this.updateTrophyInspector(trophy, false);
      });
      btn.addEventListener('pointerleave', () => {
        this.stage3D.hoverTrophyById(null);
        this.updateTrophyInspector(this.activeTrophy, false);
      });
      btn.addEventListener('focus', () => {
        this.stage3D.hoverTrophyById(trophy.id);
        this.updateTrophyInspector(trophy, false);
      });
      btn.addEventListener('click', () => {
        this.activeTrophy = trophy;
        this.stage3D.selectTrophyById(trophy.id);
        this.updateTrophyInspector(trophy, true);
      });

      dock.appendChild(btn);
    });

    this.updateTrophyInspector(this.activeTrophy, false);
  }

  private updateTrophyInspector(trophy: TrophyData, highlightActive: boolean): void {
    const seasonEl = document.getElementById('trophy-season');
    const categoryEl = document.getElementById('trophy-category');
    const titleEl = document.getElementById('trophy-title');
    const factEl = document.getElementById('trophy-fact');
    const inspectorEl = document.getElementById('trophy-inspector');

    if (seasonEl) seasonEl.textContent = trophy.season;
    if (categoryEl) categoryEl.textContent = trophy.category;
    if (titleEl) titleEl.textContent = trophy.title;
    if (factEl) factEl.textContent = trophy.fact;

    if (highlightActive) {
      triggerLightSweep(inspectorEl, this.reducedMotion);
      const dockBtns =
        document.querySelectorAll<HTMLButtonElement>('.trophy-dock-btn');
      dockBtns.forEach((btn) => {
        const isCurrent = btn.dataset.trophyId === trophy.id;
        btn.classList.toggle('is-active', isCurrent);
        btn.setAttribute('aria-selected', String(isCurrent));
      });
    }
  }

  private bindTrophyStageInteraction(): void {
    const hitZone = document.getElementById('trophy-hit-zone');
    const detailsBtn = document.getElementById('btn-trophy-details');

    hitZone?.addEventListener('pointermove', (e) => {
      this.stage3D.handleTrophyStagePointerMove(e.clientX, e.clientY);
    });

    hitZone?.addEventListener('pointerleave', () => {
      this.stage3D.hoverTrophyById(null);
      this.cursor.setOverrideMode(null);
      this.updateTrophyInspector(this.activeTrophy, false);
    });

    hitZone?.addEventListener('click', (e) => {
      const hit = this.stage3D.handleTrophyStageClick(e.clientX, e.clientY);
      if (!hit) {
        // Fallback: open currently active trophy details
        this.modal.openTrophy(this.activeTrophy);
      }
    });

    detailsBtn?.addEventListener('click', () => {
      this.modal.openTrophy(this.activeTrophy);
    });
  }

  private renderChronicle(): void {
    const timelineEl = document.getElementById('history-timeline');
    if (timelineEl) {
      timelineEl.innerHTML = CLUB_HISTORY.map(
        (m) => `
        <article class="milestone-card sweep-host">
          <div class="milestone-year-col">
            <div class="milestone-year">${m.year}</div>
            <span class="milestone-era">${m.era}</span>
          </div>
          <div class="milestone-body">
            <h3 class="milestone-title">${m.title}</h3>
            <p class="milestone-desc">${m.description}</p>
          </div>
        </article>`
      ).join('');
    }

    const stadiumEl = document.getElementById('stadium-grid');
    if (stadiumEl) {
      stadiumEl.innerHTML = STADIUM_FACTS.map(
        (f) => `
        <article class="stadium-card sweep-host">
          <div class="stadium-meta-row">
            <span class="mono-accent">${f.index}</span>
            <span class="meta-sep">·</span>
            <span>${f.label}</span>
          </div>
          <div class="stadium-val">${f.value}</div>
          <p class="stadium-note">${f.note}</p>
        </article>`
      ).join('');
    }

    // Tabs switching between Club History and Stadium «Юность»
    const tabBtns = document.querySelectorAll<HTMLButtonElement>(
      '[data-chronicle-tab]'
    );
    const historyPanel = document.getElementById('chronicle-history-panel')!;
    const stadiumPanel = document.getElementById('chronicle-stadium-panel')!;

    tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.chronicleTab;
        tabBtns.forEach((b) => {
          const active = b === btn;
          b.classList.toggle('is-active', active);
          b.setAttribute('aria-selected', String(active));
        });
        historyPanel.hidden = target !== 'history';
        stadiumPanel.hidden = target !== 'stadium';
      });
    });
  }

  private bindNavigationAndControls(): void {
    const mobileMenuBtn = document.getElementById(
      'btn-mobile-menu'
    ) as HTMLButtonElement | null;
    const mobileDrawer = document.getElementById('mobile-drawer');

    const closeDrawer = () => {
      if (mobileMenuBtn && mobileDrawer) {
        mobileMenuBtn.setAttribute('aria-expanded', 'false');
        mobileDrawer.hidden = true;
      }
    };

    mobileMenuBtn?.addEventListener('click', () => {
      if (!mobileDrawer) return;
      const expanded = mobileMenuBtn.getAttribute('aria-expanded') === 'true';
      mobileMenuBtn.setAttribute('aria-expanded', String(!expanded));
      mobileDrawer.hidden = expanded;
    });

    // Internal smooth scroll targets
    const scrollLinks = document.querySelectorAll<HTMLElement>(
      '[data-scroll-target]'
    );
    scrollLinks.forEach((el) => {
      el.addEventListener('click', (e) => {
        const id = el.dataset.scrollTarget;
        if (!id) return;
        e.preventDefault();
        closeDrawer();
        const section = document.getElementById(id);
        section?.scrollIntoView({
          behavior: this.reducedMotion ? 'auto' : 'smooth',
          block: 'start',
        });
      });
    });

    // Replay 3D Crest Assembly triggers (topbar & hero)
    const triggerCrestReplay = () => {
      closeDrawer();
      window.scrollTo({
        top: 0,
        behavior: this.reducedMotion ? 'auto' : 'smooth',
      });
      this.stage3D.replayCrestAssembly();
      if (!this.reducedMotion) {
        const heroHeading = document.querySelector('.hero-title');
        if (heroHeading instanceof HTMLElement) {
          triggerLightSweep(heroHeading, false);
        }
      }
    };

    document
      .getElementById('btn-replay-crest')
      ?.addEventListener('click', triggerCrestReplay);
    document
      .getElementById('btn-hero-replay')
      ?.addEventListener('click', triggerCrestReplay);

    // Highlight active section in topbar navigation
    const sections = document.querySelectorAll<HTMLElement>('main > section[id]');
    const navLinks = document.querySelectorAll<HTMLAnchorElement>('.nav-link');
    if (typeof IntersectionObserver !== 'undefined') {
      this.navObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              const id = entry.target.id;
              navLinks.forEach((link) => {
                link.classList.toggle(
                  'is-active',
                  link.dataset.scrollTarget === id
                );
              });
            }
          }
        },
        {rootMargin: '-38% 0px -48% 0px'}
      );
      sections.forEach((s) => this.navObserver?.observe(s));
    }

    // Global ArrowLeft/ArrowRight navigation for player carousel when Squad section is visible
    window.addEventListener('keydown', (e) => {
      if (this.modal.getIsOpen()) return;
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') return;
      const squadSection = document.getElementById('squad');
      if (!squadSection) return;
      const rect = squadSection.getBoundingClientRect();
      const inView =
        rect.top < window.innerHeight * 0.65 &&
        rect.bottom > window.innerHeight * 0.25;
      if (!inView) return;

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.carousel.next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.carousel.prev();
      }
    });
  }

  private bindReducedMotionListener(): void {
    const onChange = (e: MediaQueryListEvent) => {
      this.reducedMotion = e.matches;
      this.stage3D.setReducedMotion(this.reducedMotion);
      this.carousel.setReducedMotion(this.reducedMotion);
      this.modal.setReducedMotion(this.reducedMotion);
      this.cursor.setReducedMotion(this.reducedMotion);
      this.stageEl.classList.toggle('rm', this.reducedMotion);
    };
    this.reducedMotionQuery.addEventListener('change', onChange);
  }

  public dispose(): void {
    this.sectionObserver?.disconnect();
    this.navObserver?.disconnect();
    this.introAnimations.commitAndCancelAll();
    this.stage3D.dispose();
    this.carousel.dispose();
    this.cursor.dispose();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const app = new SlaviaPortalApp();
  window.addEventListener('beforeunload', () => app.dispose());
});
