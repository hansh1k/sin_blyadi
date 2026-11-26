import * as THREE from 'three';
import {CLUB_CREST_SRC} from '../data/clubData.ts';
import {
  createBannerTextTexture,
  createBrushedMetalTexture,
  createRadialGlowTexture,
} from './materials.ts';

interface AssemblyPart {
  object: THREE.Object3D;
  targetPos: THREE.Vector3;
  targetRot: THREE.Euler;
  targetScale: THREE.Vector3;
  startPos: THREE.Vector3;
  startRot: THREE.Euler;
  startScale: THREE.Vector3;
  delay: number; // seconds
  duration: number; // seconds
}

export type CrestPhase = 'assembling' | 'holding' | 'transitioning' | 'background';

const SHIELD_WIDTH = 2.08;
const SHIELD_HEIGHT = 2.8;
const SHIELD_HALF_W = SHIELD_WIDTH / 2; // 1.04
const SHIELD_HALF_H = SHIELD_HEIGHT / 2; // 1.40

function easeOutQuart(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - c, 4);
}

function easeInOutCubic(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

/**
 * Authentic FC Slavia-Mozyr shield silhouette matching the uploaded official crest:
 * straight vertical upper flanks, rounded U-curve base, and clean flat crown top.
 */
function createAuthenticShieldShape(scaleX = 1, scaleY = 1): THREE.Shape {
  const hw = SHIELD_HALF_W * scaleX;
  const hh = SHIELD_HALF_H * scaleY;
  const curveStartY = -0.34 * scaleY; // straight walls down to ~62% height, then U-curve

  const s = new THREE.Shape();
  s.moveTo(-hw, hh);
  s.lineTo(hw, hh);
  s.lineTo(hw, curveStartY);
  s.bezierCurveTo(
    hw,
    -0.96 * scaleY,
    0.58 * scaleX,
    -hh,
    0,
    -hh
  );
  s.bezierCurveTo(
    -0.58 * scaleX,
    -hh,
    -hw,
    -0.96 * scaleY,
    -hw,
    curveStartY
  );
  s.closePath();
  return s;
}

/**
 * Outer sculpted metallic gold rim matching the real shield silhouette.
 */
function createShieldRimShape(): THREE.Shape {
  const outer = createAuthenticShieldShape(1.045, 1.032);
  const inner = createAuthenticShieldShape(0.955, 0.955);
  outer.holes.push(inner);
  return outer;
}

/**
 * Maps planar vertex coordinates onto normalized [0..1] UVs spanning the full shield bounds
 * so every sliced 3D piece aligns seamlessly with the official crest texture.
 */
function applyShieldPlanarUVs(geometry: THREE.BufferGeometry): void {
  const pos = geometry.attributes.position;
  const uvs = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const u = (x + SHIELD_HALF_W) / SHIELD_WIDTH;
    const v = (y + SHIELD_HALF_H) / SHIELD_HEIGHT;
    uvs[i * 2] = Math.max(0, Math.min(1, u));
    uvs[i * 2 + 1] = Math.max(0, Math.min(1, v));
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
}

/**
 * Builds a clipped vertical slice of the shield (from xMin to xMax, yMin to yMax)
 * so individual 3D parts (top bar, left eagle field, right vertical stripes) dock into
 * one seamless official crest with zero seam gaps.
 */
function createShieldRegionShape(
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number
): THREE.Shape {
  const s = new THREE.Shape();
  const sampleBottomY = (x: number): number => {
    const nx = Math.max(-1, Math.min(1, x / SHIELD_HALF_W));
    const curveStartY = -0.34;
    const radiusY = SHIELD_HALF_H + curveStartY; // 1.06
    const uY = curveStartY - radiusY * Math.sqrt(Math.max(0, 1 - nx * nx));
    return Math.max(yMin, uY);
  };

  s.moveTo(xMin, yMax);
  s.lineTo(xMax, yMax);

  const steps = 20;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = THREE.MathUtils.lerp(xMax, xMin, t);
    const y = sampleBottomY(x);
    s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

/**
 * Multi-part 3D Crest of FC «Славия-Мозырь» built directly around the official uploaded
 * crest artwork (`/assets/aistudio/gerb-dark_766805bf.jpg`):
 * - Exploded 3D parts (obsidian base, metallic gold frame, crenellated «ФК СЛАВІЯ» top bar,
 *   left crimson field, right black/white/red vertical stripes, and raised 3D eagle & «МАЗЫР»
 *   relief) fly in from depth and dock seamlessly into the official club emblem.
 * - Transitions smoothly into background depth with scroll & pointer parallax and replay support.
 */
export class Crest3D {
  public readonly root = new THREE.Group();
  private readonly crestGroup = new THREE.Group();
  private readonly parts: AssemblyPart[] = [];
  private readonly disposables: Array<{dispose: () => void}> = [];

  private haloRing!: THREE.Mesh;
  private glowSprite!: THREE.Sprite;
  private topFaceMat!: THREE.MeshStandardMaterial;
  private leftFieldMat!: THREE.MeshStandardMaterial;
  private rightStripesMat!: THREE.MeshStandardMaterial;
  private eagleReliefMat!: THREE.MeshStandardMaterial;

  private phase: CrestPhase = 'assembling';
  private elapsed = 0;
  private transitionElapsed = 0;
  private reducedMotion = false;

  // Background placement target (modulated by scroll and pointer)
  private readonly targetRootPos = new THREE.Vector3(0, 0.15, 0.4);
  private readonly targetRootScale = new THREE.Vector3(1.12, 1.12, 1.12);
  private readonly currentRootPos = new THREE.Vector3(0, 0.15, 0.4);
  private readonly currentRootScale = new THREE.Vector3(1.12, 1.12, 1.12);

  private readonly startBgPos = new THREE.Vector3(0, 0.15, 0.4);
  private readonly startBgScale = new THREE.Vector3(1.12, 1.12, 1.12);

  private onPhaseChange?: (phase: CrestPhase) => void;

  constructor(onPhaseChange?: (phase: CrestPhase) => void) {
    this.onPhaseChange = onPhaseChange;
    this.root.name = 'SlaviaMozyrCrest3D';
    this.root.add(this.crestGroup);
    this.buildCrestParts();
    this.loadOfficialCrestTextures();
  }

  private track<T extends {dispose: () => void}>(resource: T): T {
    this.disposables.push(resource);
    return resource;
  }

  private buildCrestParts(): void {
    const brushedTex = this.track(createBrushedMetalTexture());
    const fallbackTopTex = this.track(
      createBannerTextTexture('ФК СЛАВІЯ', {
        bgTop: '#121010',
        bgBottom: '#0c0b0b',
        textColor: '#f2c94c',
        borderColor: '#f2c94c',
        fontSize: 120,
      })
    );
    const glowTex = this.track(
      createRadialGlowTexture(
        'rgba(242, 201, 76, 0.82)',
        'rgba(217, 30, 42, 0.32)',
        'rgba(93, 56, 39, 0.08)'
      )
    );

    const goldMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xf2c94c,
        metalness: 0.92,
        roughness: 0.22,
        bumpMap: brushedTex,
        bumpScale: 0.012,
      })
    );

    const obsidianMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x100f0f,
        metalness: 0.38,
        roughness: 0.4,
      })
    );

    this.topFaceMat = this.track(
      new THREE.MeshStandardMaterial({
        map: fallbackTopTex,
        metalness: 0.22,
        roughness: 0.32,
      })
    );

    this.leftFieldMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        metalness: 0.16,
        roughness: 0.36,
        bumpMap: brushedTex,
        bumpScale: 0.005,
      })
    );

    this.rightStripesMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        metalness: 0.2,
        roughness: 0.3,
        bumpMap: brushedTex,
        bumpScale: 0.006,
      })
    );

    this.eagleReliefMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        transparent: true,
        alphaTest: 0.2,
        metalness: 0.35,
        roughness: 0.26,
        opacity: 0,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      })
    );

    // 1. Sculpted Obsidian Backing Shield Base
    const baseGeo = this.track(
      new THREE.ExtrudeGeometry(createAuthenticShieldShape(0.99, 0.99), {
        depth: 0.15,
        bevelEnabled: true,
        bevelThickness: 0.032,
        bevelSize: 0.025,
        bevelSegments: 3,
      })
    );
    baseGeo.translate(0, 0, -0.08);
    const shieldBase = new THREE.Mesh(baseGeo, obsidianMat);
    shieldBase.castShadow = true;
    shieldBase.receiveShadow = true;
    this.registerPart(
      shieldBase,
      new THREE.Vector3(0, 0, -0.04),
      new THREE.Euler(0, 0, 0),
      new THREE.Vector3(0, 0.35, -4.6),
      new THREE.Euler(0.6, -1.15, 0.18),
      0.0,
      0.95
    );

    // 2. Outer Sculpted Metallic Gold Shield Rim + Top Crenellated Battlements
    const rimGroup = new THREE.Group();
    const rimGeo = this.track(
      new THREE.ExtrudeGeometry(createShieldRimShape(), {
        depth: 0.22,
        bevelEnabled: true,
        bevelThickness: 0.038,
        bevelSize: 0.026,
        bevelSegments: 4,
      })
    );
    rimGeo.translate(0, 0, -0.09);
    const shieldRim = new THREE.Mesh(rimGeo, goldMat);
    shieldRim.castShadow = true;
    rimGroup.add(shieldRim);

    // Crenellated crown blocks along top edge matching the official crest battlements
    const merlonGeo = this.track(new THREE.BoxGeometry(0.32, 0.075, 0.2));
    [-0.64, 0.0, 0.64].forEach((mx) => {
      const merlon = new THREE.Mesh(merlonGeo, goldMat);
      merlon.position.set(mx, SHIELD_HALF_H + 0.035, 0.02);
      rimGroup.add(merlon);
    });

    this.registerPart(
      rimGroup,
      new THREE.Vector3(0, 0, 0.03),
      new THREE.Euler(0, 0, 0),
      new THREE.Vector3(0, -0.45, 3.8),
      new THREE.Euler(-0.68, 1.45, -0.32),
      0.1,
      1.05
    );

    // Coordinate splits matching the official crest proportions:
    // Top crenellated «ФК СЛАВІЯ» bar occupies top ~21% (y: 0.81..1.38)
    // Right vertical stripes (black, white, crimson) occupy x: 0.34..1.02
    const topSplitY = 0.81;
    const stripeSplitX = 0.34;

    // 3. Left Main Crimson Field + Official Emblem Canvas (x: -1.01..0.34, y: -1.38..0.81)
    const leftFieldGroup = new THREE.Group();
    const leftShape = createShieldRegionShape(-1.01, stripeSplitX, -1.38, topSplitY);
    const leftBackingGeo = this.track(
      new THREE.ExtrudeGeometry(leftShape, {
        depth: 0.06,
        bevelEnabled: true,
        bevelThickness: 0.01,
        bevelSize: 0.008,
        bevelSegments: 2,
      })
    );
    const leftBacking = new THREE.Mesh(leftBackingGeo, obsidianMat);
    const leftFaceGeo = this.track(new THREE.ShapeGeometry(leftShape, 24));
    applyShieldPlanarUVs(leftFaceGeo);
    const leftFace = new THREE.Mesh(leftFaceGeo, this.leftFieldMat);
    leftFace.position.z = 0.072;
    leftFieldGroup.add(leftBacking, leftFace);

    this.registerPart(
      leftFieldGroup,
      new THREE.Vector3(0, 0, 0.04),
      new THREE.Euler(0, 0, 0),
      new THREE.Vector3(-3.1, -0.8, 2.7),
      new THREE.Euler(0.45, -1.3, 0.38),
      0.22,
      0.95
    );

    // 4. Right Vertical Stripes Column (Black · White · Crimson)
    const rightStripesGroup = new THREE.Group();
    const rightShape = createShieldRegionShape(stripeSplitX, 1.01, -1.38, topSplitY);
    const rightBackingGeo = this.track(
      new THREE.ExtrudeGeometry(rightShape, {
        depth: 0.072,
        bevelEnabled: true,
        bevelThickness: 0.012,
        bevelSize: 0.008,
        bevelSegments: 2,
      })
    );
    const rightBacking = new THREE.Mesh(rightBackingGeo, goldMat);
    const rightFaceGeo = this.track(new THREE.ShapeGeometry(rightShape, 24));
    applyShieldPlanarUVs(rightFaceGeo);
    const rightFace = new THREE.Mesh(rightFaceGeo, this.rightStripesMat);
    rightFace.position.z = 0.086;
    rightStripesGroup.add(rightBacking, rightFace);

    this.registerPart(
      rightStripesGroup,
      new THREE.Vector3(0, 0, 0.045),
      new THREE.Euler(0, 0, 0),
      new THREE.Vector3(3.2, -0.6, 2.5),
      new THREE.Euler(-0.55, 1.35, -0.34),
      0.32,
      0.94
    );

    // 5. Top Crenellated Header Bar («ФК СЛАВІЯ»)
    const topBarGroup = new THREE.Group();
    const topShape = createShieldRegionShape(-1.01, 1.01, topSplitY, 1.38);
    const topBackingGeo = this.track(
      new THREE.ExtrudeGeometry(topShape, {
        depth: 0.09,
        bevelEnabled: true,
        bevelThickness: 0.014,
        bevelSize: 0.01,
        bevelSegments: 2,
      })
    );
    const topBacking = new THREE.Mesh(topBackingGeo, goldMat);
    const topFaceGeo = this.track(new THREE.ShapeGeometry(topShape, 12));
    applyShieldPlanarUVs(topFaceGeo);
    const topFace = new THREE.Mesh(topFaceGeo, this.topFaceMat);
    topFace.position.z = 0.106;
    topBarGroup.add(topBacking, topFace);

    this.registerPart(
      topBarGroup,
      new THREE.Vector3(0, 0, 0.05),
      new THREE.Euler(0, 0, 0),
      new THREE.Vector3(0, 3.2, 2.6),
      new THREE.Euler(-1.25, 0.45, 0.16),
      0.44,
      0.95
    );

    // 6. Raised 3D Floating Eagle & «МАЗЫР» Parallax Relief Layer
    const eagleReliefGeo = this.track(new THREE.ShapeGeometry(leftShape, 24));
    applyShieldPlanarUVs(eagleReliefGeo);
    const eagleReliefMesh = new THREE.Mesh(eagleReliefGeo, this.eagleReliefMat);

    this.registerPart(
      eagleReliefMesh,
      new THREE.Vector3(0, 0, 0.165),
      new THREE.Euler(0, 0, 0),
      new THREE.Vector3(0, 0.2, 5.2),
      new THREE.Euler(0.28, Math.PI * 1.25, -0.2),
      0.58,
      1.05
    );

    // 7. Golden Halo Ring + Radiant Glow Sprite Behind Crest
    const haloGeo = this.track(new THREE.TorusGeometry(1.78, 0.022, 16, 96));
    const haloMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xf2c94c,
        emissive: 0xc5794b,
        emissiveIntensity: 0.65,
        metalness: 0.95,
        roughness: 0.18,
        transparent: true,
        opacity: 0.8,
      })
    );
    this.haloRing = new THREE.Mesh(haloGeo, haloMat);
    this.registerPart(
      this.haloRing,
      new THREE.Vector3(0, 0.0, -0.24),
      new THREE.Euler(0, 0, 0),
      new THREE.Vector3(0, 0, -5.0),
      new THREE.Euler(1.2, 0.9, 0.5),
      0.54,
      1.15
    );

    const spriteMat = this.track(
      new THREE.SpriteMaterial({
        map: glowTex,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.glowSprite = new THREE.Sprite(spriteMat);
    this.glowSprite.scale.set(4.8, 4.8, 1);
    this.glowSprite.position.set(0, 0, -0.45);
    this.crestGroup.add(this.glowSprite);
  }

  /**
   * Loads the official uploaded crest artwork, auto-detects the exact shield bounding box
   * on an offscreen canvas so zero dark outer background bleeds in, and builds:
   * - Full high-resolution shield albedo texture (sRGB, anisotropic filtering)
   * - Alpha-extracted raised relief texture isolating the black-and-gold eagle & «МАЗЫР»
   */
  private loadOfficialCrestTextures(): void {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      const srcW = img.naturalWidth;
      const srcH = img.naturalHeight;
      if (!srcW || !srcH) return;

      const probeCanvas = document.createElement('canvas');
      probeCanvas.width = srcW;
      probeCanvas.height = srcH;
      const probeCtx = probeCanvas.getContext('2d');
      if (!probeCtx) return;
      probeCtx.drawImage(img, 0, 0);

      // Measure exact pixel bounds of the bright gold/crimson shield inside the dark frame
      const {data} = probeCtx.getImageData(0, 0, srcW, srcH);
      let minX = srcW;
      let minY = srcH;
      let maxX = 0;
      let maxY = 0;
      for (let y = 0; y < srcH; y += 2) {
        for (let x = 0; x < srcW; x += 2) {
          const i = (y * srcW + x) * 4;
          if (data[i] > 55 || data[i + 1] > 55 || data[i + 2] > 55) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX <= minX || maxY <= minY) return;

      // Inset slightly by 2px so the outer gold border blends smoothly into the 3D gold rim
      const cropX = Math.max(0, minX + 2);
      const cropY = Math.max(0, minY + 2);
      const cropW = Math.max(1, maxX - minX - 4);
      const cropH = Math.max(1, maxY - minY - 4);

      const texW = 1024;
      const texH = 1380;

      // 1. Clean cropped official crest texture for all shield face layers
      const fullCanvas = document.createElement('canvas');
      fullCanvas.width = texW;
      fullCanvas.height = texH;
      const fullCtx = fullCanvas.getContext('2d');
      if (!fullCtx) return;
      fullCtx.imageSmoothingEnabled = true;
      fullCtx.imageSmoothingQuality = 'high';
      fullCtx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, texW, texH);

      const crestTex = this.track(new THREE.CanvasTexture(fullCanvas));
      crestTex.colorSpace = THREE.SRGBColorSpace;
      crestTex.anisotropy = 8;
      crestTex.needsUpdate = true;

      this.topFaceMat.map = crestTex;
      this.topFaceMat.needsUpdate = true;

      this.leftFieldMat.map = crestTex;
      this.leftFieldMat.needsUpdate = true;

      this.rightStripesMat.map = crestTex;
      this.rightStripesMat.needsUpdate = true;

      // 2. Raised 3D relief texture: isolate eagle (black + gold outline) & «МАЗЫР» gold text
      // by making the crimson field background transparent while keeping dark eagle + gold intact.
      const reliefCanvas = document.createElement('canvas');
      reliefCanvas.width = texW;
      reliefCanvas.height = texH;
      const reliefCtx = reliefCanvas.getContext('2d');
      if (!reliefCtx) return;
      reliefCtx.drawImage(fullCanvas, 0, 0);

      const reliefImg = reliefCtx.getImageData(0, 0, texW, texH);
      const px = reliefImg.data;
      const topCutPx = Math.floor(texH * 0.24);
      const rightCutPx = Math.floor(texW * 0.65);

      for (let y = 0; y < texH; y++) {
        for (let x = 0; x < texW; x++) {
          const i = (y * texW + x) * 4;
          if (y < topCutPx || x > rightCutPx || x < texW * 0.05 || y > texH * 0.94) {
            px[i + 3] = 0;
            continue;
          }
          const r = px[i];
          const g = px[i + 1];
          const b = px[i + 2];
          // Crimson background has high red and low green/blue -> knock out smoothly
          const isCrimson = r > 110 && g < 70 && b < 70;
          if (isCrimson) {
            px[i + 3] = 0;
          }
        }
      }
      reliefCtx.putImageData(reliefImg, 0, 0);

      const reliefTex = this.track(new THREE.CanvasTexture(reliefCanvas));
      reliefTex.colorSpace = THREE.SRGBColorSpace;
      reliefTex.anisotropy = 8;
      reliefTex.needsUpdate = true;

      this.eagleReliefMat.map = reliefTex;
      this.eagleReliefMat.opacity = 1;
      this.eagleReliefMat.needsUpdate = true;
    };
    img.src = CLUB_CREST_SRC;
  }

  private registerPart(
    object: THREE.Object3D,
    targetPos: THREE.Vector3,
    targetRot: THREE.Euler,
    startPos: THREE.Vector3,
    startRot: THREE.Euler,
    delay: number,
    duration: number
  ): void {
    this.crestGroup.add(object);
    this.parts.push({
      object,
      targetPos,
      targetRot,
      targetScale: new THREE.Vector3(1, 1, 1),
      startPos,
      startRot,
      startScale: new THREE.Vector3(0.35, 0.35, 0.35),
      delay,
      duration,
    });
  }

  public setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    if (reduced && this.phase !== 'background') {
      this.snapToBackground();
    }
  }

  public getPhase(): CrestPhase {
    return this.phase;
  }

  public startAssembly(instant = false): void {
    if (instant || this.reducedMotion) {
      this.snapToBackground();
      return;
    }

    this.phase = 'assembling';
    this.elapsed = 0;
    this.transitionElapsed = 0;
    this.onPhaseChange?.('assembling');

    // Center hero framing for dramatic 3D assembly
    this.currentRootPos.set(0, 0.06, 0.65);
    this.currentRootScale.setScalar(1.06);
    this.root.position.copy(this.currentRootPos);
    this.root.scale.copy(this.currentRootScale);
    this.crestGroup.rotation.set(0, 0, 0);

    for (const part of this.parts) {
      part.object.position.copy(part.startPos);
      part.object.rotation.copy(part.startRot);
      part.object.scale.copy(part.startScale);
    }
    this.glowSprite.material.opacity = 0.0;
  }

  public replayAssembly(): void {
    this.startAssembly(false);
  }

  public snapToBackground(): void {
    for (const part of this.parts) {
      part.object.position.copy(part.targetPos);
      part.object.rotation.copy(part.targetRot);
      part.object.scale.copy(part.targetScale);
    }
    this.glowSprite.material.opacity = 0.42;
    this.phase = 'background';
    this.currentRootPos.set(0, 0.22, -2.85);
    this.currentRootScale.setScalar(0.76);
    this.root.position.copy(this.currentRootPos);
    this.root.scale.copy(this.currentRootScale);
    this.onPhaseChange?.('background');
  }

  /**
   * Updates assembly choreography, background retreat, and subtle parallax.
   */
  public update(
    dt: number,
    time: number,
    pointerX: number,
    pointerY: number,
    scrollProgress: number
  ): void {
    if (this.phase === 'assembling') {
      this.elapsed += dt;
      let allDone = true;

      for (const part of this.parts) {
        const localT = (this.elapsed - part.delay) / part.duration;
        if (localT < 1) allDone = false;
        const p = easeOutQuart(localT);

        part.object.position.lerpVectors(part.startPos, part.targetPos, p);
        part.object.rotation.set(
          THREE.MathUtils.lerp(part.startRot.x, part.targetRot.x, p),
          THREE.MathUtils.lerp(part.startRot.y, part.targetRot.y, p),
          THREE.MathUtils.lerp(part.startRot.z, part.targetRot.z, p)
        );
        part.object.scale.lerpVectors(part.startScale, part.targetScale, p);
      }

      // Dramatic spin settle during assembly + burst glow on docking
      const overallP = easeOutQuart(this.elapsed / 1.85);
      this.crestGroup.rotation.y = (1 - overallP) * 0.48 + pointerX * 0.14;
      this.crestGroup.rotation.x = pointerY * -0.09;
      this.glowSprite.material.opacity = THREE.MathUtils.clamp(
        (this.elapsed - 0.85) * 0.9,
        0,
        0.72
      );

      if (allDone && this.elapsed >= 1.95) {
        this.phase = 'holding';
        this.elapsed = 0;
        this.onPhaseChange?.('holding');
      }
      return;
    }

    if (this.phase === 'holding') {
      this.elapsed += dt;
      // Gentle heroic breathe before retreating to background
      this.crestGroup.rotation.y =
        Math.sin(this.elapsed * 2.2) * 0.12 + pointerX * 0.16;
      this.crestGroup.rotation.x = pointerY * -0.1;
      this.glowSprite.material.opacity = 0.72 - Math.sin(this.elapsed * 3) * 0.1;

      if (this.elapsed >= 0.75) {
        this.phase = 'transitioning';
        this.transitionElapsed = 0;
        this.startBgPos.copy(this.root.position);
        this.startBgScale.copy(this.root.scale);
        this.onPhaseChange?.('transitioning');
      }
      return;
    }

    // Compute desired background pose based on scroll depth
    const heroToTrophy = THREE.MathUtils.clamp(scrollProgress / 0.35, 0, 1);
    const trophyToLower = THREE.MathUtils.clamp((scrollProgress - 0.35) / 0.45, 0, 1);

    const desiredX = THREE.MathUtils.lerp(0, 1.35, trophyToLower) + pointerX * 0.28;
    const desiredY =
      THREE.MathUtils.lerp(0.24, 1.05, heroToTrophy) +
      THREE.MathUtils.lerp(0, -0.35, trophyToLower) +
      pointerY * 0.16;
    const desiredZ =
      THREE.MathUtils.lerp(-2.85, -4.6, heroToTrophy) -
      trophyToLower * 1.1;
    const desiredScale =
      THREE.MathUtils.lerp(0.76, 0.56, heroToTrophy) *
      THREE.MathUtils.lerp(1, 0.82, trophyToLower);

    this.targetRootPos.set(desiredX, desiredY, desiredZ);
    this.targetRootScale.setScalar(desiredScale);

    if (this.phase === 'transitioning') {
      this.transitionElapsed += dt;
      const p = easeInOutCubic(this.transitionElapsed / 1.25);
      this.currentRootPos.lerpVectors(this.startBgPos, this.targetRootPos, p);
      this.currentRootScale.lerpVectors(this.startBgScale, this.targetRootScale, p);
      this.root.position.copy(this.currentRootPos);
      this.root.scale.copy(this.currentRootScale);
      this.glowSprite.material.opacity = THREE.MathUtils.lerp(0.7, 0.42, p);

      if (this.transitionElapsed >= 1.25) {
        this.phase = 'background';
        this.onPhaseChange?.('background');
      }
    } else {
      const damp = this.reducedMotion ? 1 : 1 - Math.exp(-4.5 * dt);
      this.currentRootPos.lerp(this.targetRootPos, damp);
      this.currentRootScale.lerp(this.targetRootScale, damp);
      this.root.position.copy(this.currentRootPos);
      this.root.scale.copy(this.currentRootScale);

      const glowTarget = THREE.MathUtils.lerp(0.42, 0.22, trophyToLower);
      this.glowSprite.material.opacity = THREE.MathUtils.lerp(
        this.glowSprite.material.opacity,
        glowTarget,
        damp
      );
    }

    // Gentle parallax rotation & slow halo shimmer in background
    const targetRotY =
      pointerX * 0.34 + (this.reducedMotion ? 0 : Math.sin(time * 0.55) * 0.08);
    const targetRotX =
      pointerY * -0.2 + (this.reducedMotion ? 0 : Math.cos(time * 0.45) * 0.04);
    const rotDamp = this.reducedMotion ? 1 : 1 - Math.exp(-5.0 * dt);
    this.crestGroup.rotation.y = THREE.MathUtils.lerp(
      this.crestGroup.rotation.y,
      targetRotY,
      rotDamp
    );
    this.crestGroup.rotation.x = THREE.MathUtils.lerp(
      this.crestGroup.rotation.x,
      targetRotX,
      rotDamp
    );
    if (!this.reducedMotion) {
      this.haloRing.rotation.z = time * 0.14;
    }
  }

  public dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
