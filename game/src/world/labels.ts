import * as THREE from 'three';

/** World-space text label drawn on a canvas sprite, used by debug and zone overlays. */
export function labelSprite(text: string, color: string, height = .5, alpha = .78): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const font = 'bold 30px "Segoe UI", "Microsoft YaHei", sans-serif';
  const context = canvas.getContext('2d')!;
  context.font = font;
  const width = Math.max(96, Math.ceil(context.measureText(text).width) + 36);
  canvas.width = width;
  canvas.height = 72;
  context.font = font;
  context.fillStyle = `rgba(8,16,24,${alpha})`;
  context.fillRect(2, 8, width - 4, 52);
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.strokeRect(2, 8, width - 4, 52);
  context.fillStyle = color;
  context.textBaseline = 'middle';
  context.fillText(text, 18, 35);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({map: texture, transparent: true, depthWrite: false, depthTest: false});
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(height * width / 72, height, 1);
  sprite.renderOrder = 20;
  return sprite;
}
