import * as THREE from 'three';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {Crest3D, type CrestPhase} from './Crest3D.ts';
import {TrophyShowcase3D} from './TrophyShowcase3D.ts';
import type {TrophyData} from '../data/clubData.ts';

export interface Stage3DCallbacks {
  onCrestPhaseChange?: (phase: CrestPhase) => void;
  onTrophyHover?: (trophy: TrophyData | null) => void;
  onTrophySelect?: (trophy: TrophyData) => void;
}

/**
 * Full-bleed alpha-compatible Three.js WebGL Stage rendering:
 * 1) The 3D assembling FC Slavia-Mozyr crest transitioning into background parallax
 * 2) The 3D club trophies showcase in background depth with hover/click raycasting
 * 3) Atmospheric crimson-gold ember dust particles
 */
export class Stage3D {
  private readonly container: HTMLElement;
  private readonly callbacks: Stage3DCallbacks;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private pmremGenerator?: THREE.PMREMGenerator;
  private envRenderTarget?: THREE.WebGLRenderTarget;

  private crest!: Crest3D;
  private trophies!: TrophyShowcase3D;
  private emberMesh!: THREE.InstancedMesh;
  private emberPositions: Float32Array;
  private emberSpeeds: Float32Array;
  private emberCount = 64;

  // Scratch objects (zero GC per frame)
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2(99, 99);
  private readonly dummyMatrix = new THREE.Object3D();
  private readonly desiredCamPos = new THREE.Vector3(0, 0.25, 4.4);

  private pointerX = 0;
  private pointerY = 0;
  private scrollProgress = 0;
  private reducedMotion = false;
  private isSoftwareGl = false;

  private rafId: number | null = null;
  private lastTime = 0;
  private elapsedTotal = 0;
  private lastRaycastMs = 0;
  private hoveredTrophyId: string | null = null;
  private disposed = false;

  private boundResize: () => void;
  private boundPointerMove: (e: PointerEvent) => void;
  private boundScroll: () => void;
  private boundContextLost: (e: Event) => void;
  private boundContextRestored: () => void;

  constructor(container: HTMLElement, callbacks: Stage3DCallbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;

    this.emberPositions = new Float32Array(this.emberCount * 3);
    this.emberSpeeds = new Float32Array(this.emberCount);

    this.boundResize = () => this.onResize();
    this.boundPointerMove = (e) => this.onPointerMove(e);
    this.boundScroll = () => this.updateScrollProgress();
    this.boundContextLost = (e) => {
      e.preventDefault();
      if (this.rafId !== null) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
    };
    this.boundContextRestored = () => {
      if (!this.disposed && this.rafId === null) {
        this.lastTime = performance.now();
        this.loop(this.lastTime);
      }
    };

    this.initRendererAndScene();
    this.attachEvents();
    this.updateScrollProgress();
  }

  private detectSoftwareRenderer(): boolean {
    try {
      const probe = document.createElement('canvas');
      const gl =
        probe.getContext('webgl2') ||
        probe.getContext('webgl') ||
        (probe.getContext('experimental-webgl') as WebGLRenderingContext | null);
      if (!gl) return true;
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const rendererName = dbg
        ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL))
        : '';
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(
        rendererName
      );
    } catch {
      return false;
    }
  }

  private initRendererAndScene(): void {
    this.isSoftwareGl = this.detectSoftwareRenderer();
    if (this.isSoftwareGl) {
      this.emberCount = 28;
      this.emberPositions = new Float32Array(this.emberCount * 3);
      this.emberSpeeds = new Float32Array(this.emberCount);
    }

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
    this.renderer.setSize(
      this.container.clientWidth || window.innerWidth,
      this.container.clientHeight || window.innerHeight
    );
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x000000, 0); // Alpha-compatible transparent 3D layer

    this.renderer.domElement.className = 'webgl-canvas';
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0c0b0b, 0.048);

    const aspect =
      (this.container.clientWidth || window.innerWidth) /
      Math.max(1, this.container.clientHeight || window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(42, aspect, 0.1, 40);
    this.camera.position.copy(this.desiredCamPos);

    // Studio IBL via RoomEnvironment so metallic gold, copper, and obsidian gleam
    this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.envRenderTarget = this.pmremGenerator.fromScene(roomEnv, 0.04);
    this.scene.environment = this.envRenderTarget.texture;
    roomEnv.dispose();

    // 3-Point Studio Club Lighting (Warm Gold Key, Cool Fill, Crimson Rim)
    const hemi = new THREE.HemisphereLight(0xf5e8d8, 0x1a1214, 0.85);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff1dc, 2.8);
    keyLight.position.set(3.5, 4.8, 5.2);
    if (!this.isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.bias = -0.0005;
    }
    this.scene.add(keyLight);

    const crimsonRim = new THREE.DirectionalLight(0xd91e2a, 2.1);
    crimsonRim.position.set(-4.2, 1.4, -2.5);
    this.scene.add(crimsonRim);

    const copperRim = new THREE.PointLight(0xc5794b, 3.2, 14, 1.5);
    copperRim.position.set(3.6, -0.8, 2.2);
    this.scene.add(copperRim);

    // 3D Crest & Trophy Showcase
    this.crest = new Crest3D((phase) => this.callbacks.onCrestPhaseChange?.(phase));
    this.scene.add(this.crest.root);

    this.trophies = new TrophyShowcase3D();
    this.scene.add(this.trophies.root);

    // Subtle floating gold/crimson embers via InstancedMesh
    this.buildEmbers();
  }

  private buildEmbers(): void {
    const geo = new THREE.OctahedronGeometry(0.022, 0);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xf2c94c,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.emberMesh = new THREE.InstancedMesh(geo, mat, this.emberCount);
    this.emberMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    for (let i = 0; i < this.emberCount; i++) {
      this.emberPositions[i * 3 + 0] = (Math.random() - 0.5) * 11;
      this.emberPositions[i * 3 + 1] = (Math.random() - 0.5) * 6;
      this.emberPositions[i * 3 + 2] = -0.5 - Math.random() * 6.5;
      this.emberSpeeds[i] = 0.14 + Math.random() * 0.28;
    }
    this.scene.add(this.emberMesh);
  }

  private attachEvents(): void {
    window.addEventListener('resize', this.boundResize);
    window.addEventListener('pointermove', this.boundPointerMove, {passive: true});
    window.addEventListener('scroll', this.boundScroll, {passive: true});
    this.renderer.domElement.addEventListener(
      'webglcontextlost',
      this.boundContextLost
    );
    this.renderer.domElement.addEventListener(
      'webglcontextrestored',
      this.boundContextRestored
    );
  }

  public start(reducedMotion: boolean): void {
    this.setReducedMotion(reducedMotion);
    this.crest.startAssembly(reducedMotion);
    this.lastTime = performance.now();
    this.loop(this.lastTime);
  }

  public setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    this.crest.setReducedMotion(reduced);
    this.trophies.setReducedMotion(reduced);
  }

  public replayCrestAssembly(): void {
    this.crest.replayAssembly();
  }

  public selectTrophyById(trophyId: string): void {
    this.trophies.setSelected(trophyId);
  }

  public hoverTrophyById(trophyId: string | null): void {
    this.hoveredTrophyId = trophyId;
    this.trophies.setHovered(trophyId);
  }

  /**
   * Raycast against the 3D trophies from client coordinates (used by the trophy hit-zone).
   */
  public pickTrophyAt(clientX: number, clientY: number): TrophyData | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    this.pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hits = this.raycaster.intersectObjects(this.trophies.hitTargets, false);
    if (hits.length > 0) {
      const id = hits[0].object.userData.trophyId as string | undefined;
      if (id) {
        return this.trophies.getTrophyById(id) ?? null;
      }
    }
    return null;
  }

  public handleTrophyStagePointerMove(clientX: number, clientY: number): void {
    const now = performance.now();
    if (now - this.lastRaycastMs < 24) return;
    this.lastRaycastMs = now;

    const hit = this.pickTrophyAt(clientX, clientY);
    const nextId = hit ? hit.id : null;
    if (nextId !== this.hoveredTrophyId) {
      this.hoveredTrophyId = nextId;
      this.trophies.setHovered(nextId);
      this.callbacks.onTrophyHover?.(hit);
    }
  }

  public handleTrophyStageClick(clientX: number, clientY: number): TrophyData | null {
    const hit = this.pickTrophyAt(clientX, clientY);
    if (hit) {
      this.trophies.setSelected(hit.id);
      this.callbacks.onTrophySelect?.(hit);
    }
    return hit;
  }

  private onPointerMove(e: PointerEvent): void {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    this.pointerX = (e.clientX / w) * 2 - 1;
    this.pointerY = (e.clientY / h) * 2 - 1;
  }

  private updateScrollProgress(): void {
    const maxScroll = Math.max(
      1,
      document.documentElement.scrollHeight - window.innerHeight
    );
    this.scrollProgress = THREE.MathUtils.clamp(window.scrollY / maxScroll, 0, 1);
  }

  private onResize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.updateScrollProgress();
  }

  private updateEmbers(dt: number, time: number): void {
    for (let i = 0; i < this.emberCount; i++) {
      const idx = i * 3;
      if (!this.reducedMotion) {
        this.emberPositions[idx + 1] += this.emberSpeeds[i] * dt;
        this.emberPositions[idx + 0] += Math.sin(time * 0.8 + i) * 0.08 * dt;
        if (this.emberPositions[idx + 1] > 3.4) {
          this.emberPositions[idx + 1] = -3.2;
          this.emberPositions[idx + 0] = (Math.random() - 0.5) * 11;
        }
      }
      this.dummyMatrix.position.set(
        this.emberPositions[idx + 0],
        this.emberPositions[idx + 1],
        this.emberPositions[idx + 2]
      );
      const pulse = 0.65 + 0.35 * Math.sin(time * 2.1 + i * 1.7);
      this.dummyMatrix.scale.setScalar(pulse);
      this.dummyMatrix.rotation.set(time * 0.5 + i, time * 0.7 + i, 0);
      this.dummyMatrix.updateMatrix();
      this.emberMesh.setMatrixAt(i, this.dummyMatrix.matrix);
    }
    this.emberMesh.instanceMatrix.needsUpdate = true;
  }

  private loop = (now: number): void => {
    if (this.disposed) return;

    const rawDt = (now - this.lastTime) / 1000;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
    this.lastTime = now;
    this.elapsedTotal += dt;

    // Responsive camera framing for mobile vs desktop + scroll choreography
    const isNarrow = window.innerWidth < 820;
    const baseZ = isNarrow ? 5.65 : 4.45;
    const trophyFocus =
      THREE.MathUtils.smoothstep(this.scrollProgress, 0.08, 0.28) *
      (1 - THREE.MathUtils.smoothstep(this.scrollProgress, 0.52, 0.8));

    this.desiredCamPos.set(
      this.pointerX * (this.reducedMotion ? 0 : 0.22),
      0.26 - trophyFocus * 0.28 - this.pointerY * (this.reducedMotion ? 0 : 0.14),
      baseZ - trophyFocus * 0.35
    );
    const camDamp = this.reducedMotion ? 1 : 1 - Math.exp(-4.0 * dt);
    this.camera.position.lerp(this.desiredCamPos, camDamp);
    this.camera.lookAt(0, 0.04 - trophyFocus * 0.14, -1.8);

    this.crest.update(
      dt,
      this.elapsedTotal,
      this.pointerX,
      this.pointerY,
      this.scrollProgress
    );
    this.trophies.update(
      dt,
      this.elapsedTotal,
      this.scrollProgress,
      this.pointerX
    );
    this.updateEmbers(dt, this.elapsedTotal);

    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      // Gentle frame pacing on software WebGL so UI remains silky smooth
      setTimeout(() => {
        if (!this.disposed) {
          this.rafId = requestAnimationFrame(this.loop);
        }
      }, 24);
    } else {
      this.rafId = requestAnimationFrame(this.loop);
    }
  };

  public dispose(): void {
    this.disposed = true;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    window.removeEventListener('resize', this.boundResize);
    window.removeEventListener('pointermove', this.boundPointerMove);
    window.removeEventListener('scroll', this.boundScroll);
    this.renderer.domElement.removeEventListener(
      'webglcontextlost',
      this.boundContextLost
    );
    this.renderer.domElement.removeEventListener(
      'webglcontextrestored',
      this.boundContextRestored
    );

    this.crest.dispose();
    this.trophies.dispose();
    this.emberMesh.geometry.dispose();
    (this.emberMesh.material as THREE.Material).dispose();
    this.envRenderTarget?.dispose();
    this.pmremGenerator?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
