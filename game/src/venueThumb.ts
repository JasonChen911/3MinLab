import {CATALOG} from './game';
import {makeVenueItems, venueDefinition, venueVariant, type VenueSize} from './venues';

const iso = (x: number, z: number, scale: number, cx: number, cy: number) => ({
  x: cx + (x - z) * .866 * scale,
  y: cy + (x + z) * .5 * scale,
});

const hex = (color: number, alpha = 1) => `#${color.toString(16).padStart(6, '0')}${alpha < 1 ? Math.round(alpha * 255).toString(16).padStart(2, '0') : ''}`;

function shade(color: number, factor: number): string {
  const r = Math.min(255, Math.round(((color >> 16) & 255) * factor));
  const g = Math.min(255, Math.round(((color >> 8) & 255) * factor));
  const b = Math.min(255, Math.round((color & 255) * factor));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Isometric preview drawn from the venue's real base layout. */
export function venueThumb(venueId: string, variant: VenueSize, width = 208, height = 124): string {
  const venue = venueDefinition(venueId);
  const info = venueVariant(venueId, variant);
  const items = makeVenueItems(venueId, variant);
  const size = info.size;
  const scale = Math.min(width / (size * 1.78), height / (size * 1.12));
  const cx = width / 2, cy = height * .16;
  const floor = venue.type === 'indoor' ? venue.style.floor : venue.terrain === 'track' ? 0xa35d4d : venue.style.floor;
  const half = size / 2;
  const corners = [iso(-half, -half, scale, cx, cy), iso(half, -half, scale, cx, cy), iso(half, half, scale, cx, cy), iso(-half, half, scale, cx, cy)];
  const ground = corners.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const shapes: string[] = [];
  const sorted = [...items].sort((a, b) => (a.x + a.z) - (b.x + b.z));
  for (const item of sorted) {
    const base = CATALOG[item.kind];
    const w = base.w * .92, d = base.d * .92;
    const h = Math.max(.35, Math.min(3.6, base.w * .22));
    const corners = [
      iso(item.x - w / 2, item.z - d / 2, scale, cx, cy),
      iso(item.x + w / 2, item.z - d / 2, scale, cx, cy),
      iso(item.x + w / 2, item.z + d / 2, scale, cx, cy),
      iso(item.x - w / 2, item.z + d / 2, scale, cx, cy),
    ];
    const lift = h * scale;
    const top = corners.map(p => `${p.x.toFixed(1)},${(p.y - lift).toFixed(1)}`).join(' ');
    const left = [corners[0], corners[3], {x: corners[3].x, y: corners[3].y - lift}, {x: corners[0].x, y: corners[0].y - lift}].map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const right = [corners[3], corners[2], {x: corners[2].x, y: corners[2].y - lift}, {x: corners[3].x, y: corners[3].y - lift}].map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    shapes.push(`<polygon points="${left}" fill="${shade(base.color, .68)}"/><polygon points="${right}" fill="${shade(base.color, .82)}"/><polygon points="${top}" fill="${hex(base.color)}" stroke="${shade(base.color, .55)}" stroke-width=".5"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(venue.style.ceiling, .9)}"/><stop offset="1" stop-color="${shade(venue.style.ceiling, 1.25)}"/></linearGradient></defs>
  <rect width="${width}" height="${height}" rx="10" fill="url(#g)"/>
  <polygon points="${ground}" fill="${hex(floor)}" stroke="${shade(floor, .6)}" stroke-width="1"/>
  ${venue.type === 'indoor' ? `<polygon points="${ground}" fill="none" stroke="${hex(venue.style.wall)}" stroke-width="3"/>` : ''}
  ${shapes.join('')}
  <text x="10" y="${height - 9}" font-size="9" fill="#ffffffcc" font-family="system-ui,sans-serif">${venue.name} · ${info.label}</text>
</svg>`;
}

export function venueThumbUrl(venueId: string, variant: VenueSize): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(venueThumb(venueId, variant))}`;
}
