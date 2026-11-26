import * as THREE from 'three';
import {CLUB_TROPHIES, type TrophyData} from '../data/clubData.ts';
import {
  createBrushedMetalTexture,
  createContactShadowTexture,
  createPlaqueTexture,
  createRadialGlowTexture,
} from './materials.ts';

interface TrophyRig {
  data: TrophyData;
  slotGroup: THREE.Group;
  trophyMeshGroup: THREE.Group;
  hitProxy: THREE.Mesh;
  metalMat: THREE.MeshStandardMaterial;
  haloSprite: THREE.Sprite;
  baseY: number;
  hoverAmount: number;
  selected: boolean;
  spinAngle: number;
}

/**
 * Procedural 3D Trophy Gallery placed in the background depth of the scene.
 * Each trophy is a composite multi-part metallic sculpture on an obsidian plinth
 * with hover lift/tilt/glow and raycast selection.
 */
export class TrophyShowcase3D {
  public readonly root = new THREE.Group();
  public readonly hitTargets: THREE.Object3D[] = [];

  private readonly rigs: TrophyRig[] = [];
  private readonly disposables: Array<{dispose: () => void}> = [];
  private readonly highlightLight: THREE.PointLight;

  private hoveredId: string | null = null;
  private selectedId: string = CLUB_TROPHIES[0].id;
  private reducedMotion = false;
  private visibilityFactor = 0;

  constructor() {
    this.root.name = 'SlaviaTrophyShowcase3D';
    // Positioned slightly below/behind so camera scroll reveals the full arc
    this.root.position.set(0, -1.65, -2.55);

    this.highlightLight = new THREE.PointLight(0xffd27a, 0, 4.5, 1.8);
    this.highlightLight.position.set(0, 1.4, 1.2);
    this.root.add(this.highlightLight);

    this.buildGallery();
  }

  private track<T extends {dispose: () => void}>(res: T): T {
    this.disposables.push(res);
    return res;
  }

  private buildGallery(): void {
    const brushedTex = this.track(createBrushedMetalTexture());
    const contactTex = this.track(createContactShadowTexture());
    const glowTex = this.track(
      createRadialGlowTexture(
        'rgba(242, 201, 76, 0.9)',
        'rgba(197, 121, 75, 0.35)',
        'rgba(217, 30, 42, 0.06)'
      )
    );

    const plinthMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x151312,
        metalness: 0.42,
        roughness: 0.45,
      })
    );
    const copperTrimMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xc5794b,
        metalness: 0.88,
        roughness: 0.24,
        bumpMap: brushedTex,
        bumpScale: 0.01,
      })
    );
    const crimsonAccentMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xb81824,
        metalness: 0.35,
        roughness: 0.32,
        emissive: 0x2c0307,
        emissiveIntensity: 0.45,
      })
    );
    const contactMat = this.track(
      new THREE.MeshBasicMaterial({
        map: contactTex,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      })
    );

    const total = CLUB_TROPHIES.length;
    const arcSpan = 5.4;

    CLUB_TROPHIES.forEach((trophy, idx) => {
      const normalized = total > 1 ? idx / (total - 1) - 0.5 : 0; // -0.5..0.5
      const x = normalized * arcSpan;
      const z = -Math.abs(normalized) * 1.35 + (idx % 2 === 0 ? 0.14 : -0.06);
      const baseY = -0.18 + (0.5 - Math.abs(normalized)) * 0.22;

      const slotGroup = new THREE.Group();
      slotGroup.position.set(x, baseY, z);
      slotGroup.rotation.y = -normalized * 0.42;

      // Pedestal plinth (stepped obsidian cylinder + copper trim collar + plaque)
      const plinthBaseGeo = this.track(new THREE.CylinderGeometry(0.36, 0.44, 0.22, 24));
      const plinthBase = new THREE.Mesh(plinthBaseGeo, plinthMat);
      plinthBase.position.y = -0.11;
      plinthBase.receiveShadow = true;

      const trimGeo = this.track(new THREE.TorusGeometry(0.36, 0.014, 12, 36));
      const trim = new THREE.Mesh(trimGeo, copperTrimMat);
      trim.rotation.x = Math.PI / 2;
      trim.position.y = 0.002;

      const plaqueTex = this.track(
        createPlaqueTexture(trophy.season, trophy.shortTitle)
      );
      const plaqueGeo = this.track(new THREE.PlaneGeometry(0.42, 0.15));
      const plaqueMat = this.track(
        new THREE.MeshStandardMaterial({
          map: plaqueTex,
          roughness: 0.34,
          metalness: 0.45,
        })
      );
      const plaque = new THREE.Mesh(plaqueGeo, plaqueMat);
      plaque.position.set(0, -0.11, 0.41);

      const shadowGeo = this.track(new THREE.PlaneGeometry(1.15, 1.15));
      const shadowMesh = new THREE.Mesh(shadowGeo, contactMat);
      shadowMesh.rotation.x = -Math.PI / 2;
      shadowMesh.position.y = -0.215;

      slotGroup.add(plinthBase, trim, plaque, shadowMesh);

      // Trophy metallic sculpture
      const metalMat = this.track(
        new THREE.MeshStandardMaterial({
          color: trophy.metalTint,
          metalness: 0.92,
          roughness: 0.2,
          bumpMap: brushedTex,
          bumpScale: 0.012,
          emissive: new THREE.Color(trophy.metalTint),
          emissiveIntensity: 0.05,
        })
      );

      const trophyMeshGroup = this.createTrophySculpture(
        trophy.silhouette,
        metalMat,
        crimsonAccentMat,
        copperTrimMat
      );
      trophyMeshGroup.position.y = 0.01;
      slotGroup.add(trophyMeshGroup);

      // Halo glow behind each trophy (intensifies on hover/select)
      const haloMat = this.track(
        new THREE.SpriteMaterial({
          map: glowTex,
          transparent: true,
          opacity: 0.16,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      const haloSprite = new THREE.Sprite(haloMat);
      haloSprite.scale.set(1.35, 1.45, 1);
      haloSprite.position.set(0, 0.62, -0.24);
      slotGroup.add(haloSprite);

      // Dedicated invisible raycast collider box for comfortable hovering
      const proxyGeo = this.track(new THREE.CylinderGeometry(0.46, 0.48, 1.45, 12));
      const proxyMat = this.track(
        new THREE.MeshBasicMaterial({visible: false})
      );
      const hitProxy = new THREE.Mesh(proxyGeo, proxyMat);
      hitProxy.position.y = 0.56;
      hitProxy.userData.trophyId = trophy.id;
      slotGroup.add(hitProxy);

      this.hitTargets.push(hitProxy);
      this.root.add(slotGroup);

      this.rigs.push({
        data: trophy,
        slotGroup,
        trophyMeshGroup,
        hitProxy,
        metalMat,
        haloSprite,
        baseY: 0.01,
        hoverAmount: idx === 0 ? 0.55 : 0,
        selected: idx === 0,
        spinAngle: idx * 0.7,
      });
    });
  }

  private createTrophySculpture(
    silhouette: TrophyData['silhouette'],
    metalMat: THREE.MeshStandardMaterial,
    crimsonMat: THREE.MeshStandardMaterial,
    copperMat: THREE.MeshStandardMaterial
  ): THREE.Group {
    const g = new THREE.Group();

    if (silhouette === 'championship') {
      // Tall royal championship chalice with dual sweeping handles & crown finial
      const profile = [
        new THREE.Vector2(0.0, 0.0),
        new THREE.Vector2(0.24, 0.0),
        new THREE.Vector2(0.21, 0.08),
        new THREE.Vector2(0.11, 0.14),
        new THREE.Vector2(0.065, 0.34),
        new THREE.Vector2(0.095, 0.42),
        new THREE.Vector2(0.07, 0.48),
        new THREE.Vector2(0.22, 0.68),
        new THREE.Vector2(0.29, 0.96),
        new THREE.Vector2(0.32, 1.08),
        new THREE.Vector2(0.27, 1.08),
        new THREE.Vector2(0.21, 0.78),
        new THREE.Vector2(0.0, 0.64),
      ];
      const latheGeo = this.track(new THREE.LatheGeometry(profile, 32));
      const body = new THREE.Mesh(latheGeo, metalMat);
      body.castShadow = true;
      g.add(body);

      // Crimson enamel collar band
      const bandGeo = this.track(new THREE.TorusGeometry(0.105, 0.022, 12, 28));
      const band = new THREE.Mesh(bandGeo, crimsonMat);
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.42;
      g.add(band);

      // Two ornate sweeping handles via TubeGeometry
      [-1, 1].forEach((side) => {
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(side * 0.24, 0.98, 0),
          new THREE.Vector3(side * 0.42, 0.92, 0),
          new THREE.Vector3(side * 0.39, 0.66, 0),
          new THREE.Vector3(side * 0.18, 0.56, 0),
        ]);
        const handleGeo = this.track(new THREE.TubeGeometry(curve, 20, 0.024, 10, false));
        const handle = new THREE.Mesh(handleGeo, metalMat);
        handle.castShadow = true;
        g.add(handle);
      });

      // Star finial above rim
      const finialGeo = this.track(new THREE.OctahedronGeometry(0.085, 0));
      const finial = new THREE.Mesh(finialGeo, metalMat);
      finial.position.y = 1.19;
      finial.scale.set(0.9, 1.25, 0.45);
      g.add(finial);
    } else if (silhouette === 'cup') {
      // Wide Belarusian Cup amphora with lid & winged handles
      const profile = [
        new THREE.Vector2(0.0, 0.0),
        new THREE.Vector2(0.22, 0.0),
        new THREE.Vector2(0.18, 0.1),
        new THREE.Vector2(0.06, 0.28),
        new THREE.Vector2(0.16, 0.46),
        new THREE.Vector2(0.28, 0.72),
        new THREE.Vector2(0.23, 0.94),
        new THREE.Vector2(0.26, 0.99),
        new THREE.Vector2(0.18, 1.03),
        new THREE.Vector2(0.06, 1.12),
        new THREE.Vector2(0.0, 1.16),
      ];
      const latheGeo = this.track(new THREE.LatheGeometry(profile, 32));
      const body = new THREE.Mesh(latheGeo, metalMat);
      body.castShadow = true;
      g.add(body);

      const collarGeo = this.track(new THREE.TorusGeometry(0.275, 0.018, 10, 32));
      const collar = new THREE.Mesh(collarGeo, copperMat);
      collar.rotation.x = Math.PI / 2;
      collar.position.y = 0.72;
      g.add(collar);

      [-1, 1].forEach((side) => {
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(side * 0.23, 0.9, 0),
          new THREE.Vector3(side * 0.37, 0.82, 0),
          new THREE.Vector3(side * 0.32, 0.56, 0),
          new THREE.Vector3(side * 0.14, 0.44, 0),
        ]);
        const handleGeo = this.track(new THREE.TubeGeometry(curve, 18, 0.02, 8, false));
        g.add(new THREE.Mesh(handleGeo, copperMat));
      });

      const ballGeo = this.track(new THREE.IcosahedronGeometry(0.075, 1));
      const ball = new THREE.Mesh(ballGeo, metalMat);
      ball.position.y = 1.22;
      g.add(ball);
    } else if (silhouette === 'bronze') {
      // Sculpted Bronze 2025 Victory Plate / Medallion Obelisk
      const standGeo = this.track(new THREE.CylinderGeometry(0.14, 0.24, 0.24, 16));
      const stand = new THREE.Mesh(standGeo, copperMat);
      stand.position.y = 0.12;
      g.add(stand);

      const outerRingGeo = this.track(new THREE.TorusGeometry(0.36, 0.048, 18, 48));
      const outerRing = new THREE.Mesh(outerRingGeo, metalMat);
      outerRing.position.y = 0.64;
      outerRing.castShadow = true;
      g.add(outerRing);

      const discGeo = this.track(new THREE.CylinderGeometry(0.32, 0.32, 0.06, 36));
      const disc = new THREE.Mesh(discGeo, crimsonMat);
      disc.rotation.x = Math.PI / 2;
      disc.position.y = 0.64;
      g.add(disc);

      const starGeo = this.track(new THREE.OctahedronGeometry(0.16, 0));
      const star = new THREE.Mesh(starGeo, metalMat);
      star.position.set(0, 0.64, 0.04);
      star.scale.set(0.95, 1.35, 0.35);
      g.add(star);

      // Fluted support struts
      [-1, 1].forEach((side) => {
        const strutGeo = this.track(new THREE.BoxGeometry(0.05, 0.36, 0.06));
        const strut = new THREE.Mesh(strutGeo, metalMat);
        strut.position.set(side * 0.14, 0.34, 0);
        strut.rotation.z = side * 0.22;
        g.add(strut);
      });
    } else {
      // Modern First League Victory Bowl with triple spire accents
      const profile = [
        new THREE.Vector2(0.0, 0.0),
        new THREE.Vector2(0.24, 0.0),
        new THREE.Vector2(0.16, 0.12),
        new THREE.Vector2(0.08, 0.36),
        new THREE.Vector2(0.26, 0.66),
        new THREE.Vector2(0.34, 0.88),
        new THREE.Vector2(0.28, 0.9),
        new THREE.Vector2(0.18, 0.66),
        new THREE.Vector2(0.0, 0.56),
      ];
      const bowlGeo = this.track(new THREE.LatheGeometry(profile, 28));
      const bowl = new THREE.Mesh(bowlGeo, metalMat);
      bowl.castShadow = true;
      g.add(bowl);

      // Three metallic victory rings representing 1995, 2011, 2018
      [0.24, 0.33, 0.42].forEach((y, i) => {
        const rGeo = this.track(
          new THREE.TorusGeometry(0.11 + i * 0.015, 0.016, 10, 28)
        );
        const ring = new THREE.Mesh(rGeo, i === 1 ? crimsonMat : copperMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = y;
        g.add(ring);
      });

      const crestGemGeo = this.track(new THREE.ConeGeometry(0.08, 0.26, 6));
      const crestGem = new THREE.Mesh(crestGemGeo, crimsonMat);
      crestGem.position.y = 0.88;
      g.add(crestGem);
    }

    return g;
  }

  public setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
  }

  public setHovered(trophyId: string | null): void {
    this.hoveredId = trophyId;
  }

  public setSelected(trophyId: string): void {
    this.selectedId = trophyId;
    for (const rig of this.rigs) {
      rig.selected = rig.data.id === trophyId;
    }
  }

  public getTrophyById(id: string): TrophyData | undefined {
    return CLUB_TROPHIES.find((t) => t.id === id);
  }

  public update(
    dt: number,
    time: number,
    scrollProgress: number,
    pointerX: number
  ): void {
    // Showcase rises into prime background focus during section 2 (scrollProgress ~ 0.16..0.58)
    const trophyFocus =
      THREE.MathUtils.smoothstep(scrollProgress, 0.04, 0.24) *
      (1 - THREE.MathUtils.smoothstep(scrollProgress, 0.52, 0.82));

    // Even in Hero, keep trophies faintly visible in deep background silhouette
    const targetVis = 0.32 + trophyFocus * 0.68;
    const damp = this.reducedMotion ? 1 : 1 - Math.exp(-5.0 * dt);
    this.visibilityFactor = THREE.MathUtils.lerp(
      this.visibilityFactor,
      targetVis,
      damp
    );

    const targetY = THREE.MathUtils.lerp(-1.9, -0.58, trophyFocus);
    const targetZ = THREE.MathUtils.lerp(-3.8, -1.55, trophyFocus);
    this.root.position.y = THREE.MathUtils.lerp(this.root.position.y, targetY, damp);
    this.root.position.z = THREE.MathUtils.lerp(this.root.position.z, targetZ, damp);
    this.root.rotation.y = THREE.MathUtils.lerp(
      this.root.rotation.y,
      pointerX * 0.09,
      damp
    );

    let activeLightTarget: THREE.Vector3 | null = null;
    let activeGlowBoost = 0;

    for (const rig of this.rigs) {
      const isHovered = rig.data.id === this.hoveredId;
      const isSelected = rig.data.id === this.selectedId;
      const targetHover = isHovered ? 1.0 : isSelected ? 0.55 : 0.0;

      rig.hoverAmount = THREE.MathUtils.lerp(rig.hoverAmount, targetHover, damp);

      // Lift trophy smoothly on hover/select
      const floatWave =
        this.reducedMotion ? 0 : Math.sin(time * 1.8 + rig.spinAngle) * 0.025;
      rig.trophyMeshGroup.position.y =
        rig.baseY + rig.hoverAmount * 0.24 + floatWave * rig.hoverAmount;

      // Tilt & gentle 3D rotation when hovered or selected
      if (!this.reducedMotion) {
        const spinSpeed = isHovered ? 1.35 : isSelected ? 0.42 : 0.08;
        rig.spinAngle += dt * spinSpeed;
      }
      rig.trophyMeshGroup.rotation.y = rig.spinAngle;
      rig.trophyMeshGroup.rotation.x = THREE.MathUtils.lerp(
        rig.trophyMeshGroup.rotation.x,
        isHovered ? 0.14 : isSelected ? 0.06 : 0,
        damp
      );
      rig.trophyMeshGroup.rotation.z = THREE.MathUtils.lerp(
        rig.trophyMeshGroup.rotation.z,
        isHovered ? Math.sin(time * 2.4) * 0.06 : 0,
        damp
      );

      const scaleTarget = 1 + rig.hoverAmount * 0.12;
      rig.trophyMeshGroup.scale.setScalar(scaleTarget);

      // Metallic glow & halo intensification
      rig.metalMat.emissiveIntensity = 0.05 + rig.hoverAmount * 0.38;
      rig.haloSprite.material.opacity =
        (0.1 + rig.hoverAmount * 0.58) * this.visibilityFactor;
      const haloScale = 1.2 + rig.hoverAmount * 0.65;
      rig.haloSprite.scale.set(haloScale, haloScale * 1.08, 1);

      if (isHovered || (!this.hoveredId && isSelected)) {
        activeLightTarget = rig.slotGroup.position;
        activeGlowBoost = isHovered ? 4.8 : 2.6;
      }
    }

    if (activeLightTarget) {
      this.highlightLight.position.x = THREE.MathUtils.lerp(
        this.highlightLight.position.x,
        activeLightTarget.x,
        damp
      );
      this.highlightLight.position.y = THREE.MathUtils.lerp(
        this.highlightLight.position.y,
        activeLightTarget.y + 1.05,
        damp
      );
      this.highlightLight.position.z = THREE.MathUtils.lerp(
        this.highlightLight.position.z,
        activeLightTarget.z + 1.1,
        damp
      );
      this.highlightLight.intensity = THREE.MathUtils.lerp(
        this.highlightLight.intensity,
        activeGlowBoost * this.visibilityFactor,
        damp
      );
    }
  }

  public dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
