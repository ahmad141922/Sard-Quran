/**
 * Turns a muṣḥaf page into something a phone can turn to without stuttering.
 *
 * A plate looks like a small file — sixty-odd elements — but the twenty-five
 * paths inside it hold a whole page of Uthmani script as raw curve data. The
 * browser tessellates every one of those curves on **every paint**: the turn,
 * the highlight, the scroll, and in dark mode the invert filter on top. That
 * is the weight the teacher feels when the page changes, and no amount of
 * caching the *text* touches it — the old cache handed back a string that was
 * re-parsed and re-tessellated each time.
 *
 * So the ink is rasterised once and the interaction layer is left alone:
 *
 *   <svg viewBox="…">              ← the same element as before, same CSS
 *     <image href="blob:…"/>       ← the whole page as one decoded bitmap
 *     <path class="ayahPolygon"/>  ← the nine polygons, still vector, still
 *     …                              clickable and still highlightable
 *   </svg>
 *
 * The shape of the DOM the viewer inserts is unchanged, which is the point:
 * the layout rules, the night-mode filter and the highlight styles all keep
 * working on `> svg` exactly as they did.
 */
import { getPage, prefetchAround } from './page-cache';
import { sanitizeMushafSvg } from './sanitize-svg';
import { pageAssetUrl, type MushafDefinition } from './registry';

/** Drawing elements. Anything here that is not a polygon is ink, and goes. */
const INK = 'path, polygon, circle, ellipse, rect, line, polyline, text, image, use';

/**
 * How many rasterised plates to hold. Each is a blob and a decoded bitmap, so
 * this is the memory-shaped half of the cache — smaller than the twelve pages
 * of text `page-cache` keeps, and enough for the turn back and forth that a
 * majlis actually does.
 */
const MAX_PLATES = 6;

interface Plate {
  svg: SVGSVGElement;
  url: string;
}

const plates = new Map<string, Plate>();
const building = new Map<string, Promise<Plate | null>>();

function evictIfNeeded(): void {
  while (plates.size > MAX_PLATES) {
    const oldest = plates.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    const plate = plates.get(oldest);
    plates.delete(oldest);
    // The element handed out is a clone, so nothing on screen points at this
    // blob any more — except the page still showing, which is why the current
    // page is refreshed to the newest end of the map on every read.
    if (plate) URL.revokeObjectURL(plate.url);
  }
}

/**
 * Rasterises the ink and keeps the polygons.
 *
 * The bitmap is produced by handing the browser the very same plate as an
 * image: it decodes it once, off the main thread, and every later paint is a
 * blit. `width`/`height` are restored on that copy because an `<img>`-shaped
 * resource with only a viewBox has no intrinsic size to decode against.
 */
function build(text: string): Plate | null {
  const svg = sanitizeMushafSvg(text);
  if (!svg) return null;

  const viewBox = svg.getAttribute('viewBox') ?? '';
  const [x = 0, y = 0, w = 0, h = 0] = viewBox.split(/[\s,]+/).map(Number);
  if (!w || !h) return null;

  const full = svg.cloneNode(true) as SVGSVGElement;
  full.setAttribute('width', String(w));
  full.setAttribute('height', String(h));
  const url = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(full)], { type: 'image/svg+xml' }),
  );

  for (const el of Array.from(svg.querySelectorAll(INK))) {
    if (!(el.getAttribute('class') ?? '').includes('ayahPolygon')) el.remove();
  }

  const image = svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'image');
  image.setAttribute('href', url);
  image.setAttribute('x', String(x));
  image.setAttribute('y', String(y));
  image.setAttribute('width', String(w));
  image.setAttribute('height', String(h));
  // The box is the viewBox exactly, so there is nothing to fit and nothing to
  // letterbox; `none` keeps the ink where the polygons say it is.
  image.setAttribute('preserveAspectRatio', 'none');
  svg.insertBefore(image, svg.firstChild);

  return { svg, url };
}

/** Decodes the bitmap before it is ever on screen. A warm-up, so it may fail. */
function warmDecode(url: string): Promise<void> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = url;
    void img.decode?.().catch(() => { /* onload/onerror still settles this */ });
  });
}

async function plateFor(key: string, text: string): Promise<Plate | null> {
  const hit = plates.get(key);
  if (hit) {
    // Refresh recency: the page on screen must never be the one evicted.
    plates.delete(key);
    plates.set(key, hit);
    return hit;
  }
  const pending = building.get(key);
  if (pending) return pending;

  const p = (async () => {
    const plate = build(text);
    if (plate) {
      await warmDecode(plate.url);
      plates.set(key, plate);
      evictIfNeeded();
    }
    building.delete(key);
    return plate;
  })();
  building.set(key, p);
  return p;
}

/**
 * The page, ready to insert: ink already decoded, polygons already clickable.
 *
 * A **clone** is returned, so the cached plate is never the node on screen and
 * two viewers of the same page cannot steal it from each other.
 */
export async function getPlate(m: MushafDefinition, printedPage: number): Promise<SVGSVGElement | null> {
  const key = pageAssetUrl(m, printedPage);
  const text = await getPage(m, printedPage);
  const plate = await plateFor(key, text);
  return plate ? (plate.svg.cloneNode(true) as SVGSVGElement) : null;
}

/**
 * Warms the neighbours all the way to a decoded bitmap, not just to text.
 *
 * This is what makes the next turn feel like paper: by the time the finger
 * moves, the page it asks for has already been fetched, parsed, rasterised and
 * decoded, and the turn is one node swap.
 */
export function prefetchPlatesAround(m: MushafDefinition, printedPage: number): void {
  prefetchAround(m, printedPage);
  const last = m.firstPageNumber + m.pageCount - 1;
  for (const p of [printedPage - 1, printedPage + 1]) {
    if (p < m.firstPageNumber || p > last) continue;
    const key = pageAssetUrl(m, p);
    if (plates.has(key) || building.has(key)) continue;
    getPage(m, p)
      .then(text => plateFor(key, text))
      .catch(() => { /* a warm-up that fails costs nothing */ });
  }
}

/** Test seam. */
export function __clearPlates(): void {
  for (const plate of plates.values()) URL.revokeObjectURL(plate.url);
  plates.clear();
  building.clear();
}
