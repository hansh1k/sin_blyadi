import * as THREE from 'three';

/**
 * Generates a subtle brushed-metal bump/roughness texture procedurally.
 */
export function createBrushedMetalTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 2) {
      const shade = 112 + Math.floor(Math.sin(y * 0.45) * 18 + Math.random() * 24);
      ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
      ctx.fillRect(0, y, 256, 1 + (y % 3 === 0 ? 1 : 0));
    }
    for (let i = 0; i < 420; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const len = 18 + Math.random() * 90;
      const alpha = 0.06 + Math.random() * 0.1;
      ctx.fillStyle =
        i % 2 === 0
          ? `rgba(255,255,255,${alpha})`
          : `rgba(20,16,14,${alpha})`;
      ctx.fillRect(x, y, len, 1);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates crisp heraldic banner texture («ФК СЛАВІЯ» or «МАЗЫР»).
 */
export function createBannerTextTexture(
  text: string,
  options: {
    bgTop: string;
    bgBottom: string;
    textColor: string;
    borderColor: string;
    fontSize?: number;
    subText?: string;
  }
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, options.bgTop);
    grad.addColorStop(1, options.bgBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle metallic sheen band
    const sheen = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    sheen.addColorStop(0, 'rgba(255,255,255,0)');
    sheen.addColorStop(0.48, 'rgba(242,201,76,0.14)');
    sheen.addColorStop(0.54, 'rgba(255,255,255,0.22)');
    sheen.addColorStop(0.62, 'rgba(242,201,76,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Double gold hairline border
    ctx.strokeStyle = options.borderColor;
    ctx.lineWidth = 8;
    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(242, 201, 76, 0.45)';
    ctx.strokeRect(22, 22, canvas.width - 44, canvas.height - 44);

    // Main lettering
    const size = options.fontSize ?? 116;
    ctx.font = `700 ${size}px "Oswald", "Impact", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.shadowColor = 'rgba(0,0,0,0.65)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 5;
    ctx.fillStyle = options.textColor;
    const centerY = options.subText ? canvas.height * 0.43 : canvas.height * 0.52;
    ctx.fillText(text, canvas.width / 2, centerY);

    if (options.subText) {
      ctx.shadowBlur = 6;
      ctx.font = '600 44px "JetBrains Mono", monospace';
      ctx.fillStyle = '#f2c94c';
      ctx.fillText(options.subText, canvas.width / 2, canvas.height * 0.78);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates an engraved plaque texture for trophy pedestals.
 */
export function createPlaqueTexture(
  season: string,
  shortTitle: string
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 512, 192);
    grad.addColorStop(0, '#2a1d14');
    grad.addColorStop(0.5, '#5d3827');
    grad.addColorStop(1, '#1e1510');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 192);

    ctx.strokeStyle = '#f2c94c';
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, 496, 176);

    ctx.fillStyle = '#f2c94c';
    ctx.font = '700 64px "Oswald", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(season, 256, 74);

    ctx.fillStyle = '#ede3da';
    ctx.font = '600 30px "Onest", sans-serif';
    ctx.fillText(shortTitle.toUpperCase(), 256, 138);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates a soft radial glow texture for crest halo and embers.
 */
export function createRadialGlowTexture(
  innerColor: string,
  midColor: string,
  outerColor: string
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(128, 128, 4, 128, 128, 128);
    grad.addColorStop(0, innerColor);
    grad.addColorStop(0.35, midColor);
    grad.addColorStop(0.75, outerColor);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates a soft elliptical contact shadow texture for trophy plinths.
 */
export function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 122);
    grad.addColorStop(0, 'rgba(0,0,0,0.82)');
    grad.addColorStop(0.55, 'rgba(0,0,0,0.34)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}
