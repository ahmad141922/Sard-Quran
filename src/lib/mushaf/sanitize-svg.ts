/**
 * Makes a mushaf page SVG safe to inline, and puts its ayah numbers on top.
 *
 * The pages are vendored from a pinned, reviewed source and are already clean,
 * so the sanitising is defence in depth rather than a filter we rely on. It
 * runs anyway: inlining is what gives us a clickable ayah layer, and inlining
 * is exactly what turns a script inside an SVG into a script on our origin.
 */
const FORBIDDEN_TAGS = ['script', 'foreignobject', 'iframe', 'object', 'embed', 'audio', 'video'];

/**
 * Moves the ayah-end markers above the polygon layer.
 *
 * SVG has no z-index — what is painted last wins — and the publisher's file is
 * ordered `markers, text, polygons`. That order is why covering an ayah used to
 * take its number with it: the cover is a filled polygon over the ayah's whole
 * box, and the little circled number sits inside that box.
 *
 * A reciter covering the page still needs the numbers. They are the only thing
 * left to navigate by once the words are gone — «I am on the fourth verse», not
 * «I am on the fourth white band» — and they give away nothing, which is the
 * whole test for what may stay visible.
 *
 * ## Why the ancestors are cloned rather than the transform composed
 *
 * The markers live inside the page's own transform. Lifting them to the root
 * means carrying that transform along, and multiplying matrices by hand here
 * would be a second, silent implementation of what the renderer already does
 * correctly. So the chain of `<g transform>` elements above the markers is
 * rebuilt empty and the markers are hung underneath it: the same nesting, the
 * same attributes, no arithmetic to get wrong.
 */
function raiseAyahMarkers(svg: Element): void {
  const markers = svg.querySelector('#ayah_markers');
  if (!markers || markers.parentElement === svg) return;

  // The ancestors between the root and the markers, outermost first.
  const chain: Element[] = [];
  for (let el = markers.parentElement; el && el !== svg; el = el.parentElement) chain.unshift(el);

  const doc = svg.ownerDocument;
  let top: Element | null = null;
  let bottom: Element | null = null;
  for (const ancestor of chain) {
    const copy = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
    for (const attr of Array.from(ancestor.attributes)) {
      // Only what places the group. An id would be duplicated, and a class
      // could be styled — neither belongs on a layer nobody asked for.
      if (attr.name === 'transform') copy.setAttribute(attr.name, attr.value);
    }
    if (bottom) bottom.appendChild(copy); else top = copy;
    bottom = copy;
  }
  if (!top || !bottom) return;

  bottom.appendChild(markers);
  // Last child of the root: after the text, and after the polygon layer.
  svg.appendChild(top);
}

export function sanitizeMushafSvg(source: string): SVGSVGElement | null {
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  if (doc.querySelector('parsererror')) return null;
  const svg = doc.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== 'svg') return null;

  for (const tag of FORBIDDEN_TAGS) {
    for (const el of Array.from(svg.getElementsByTagName(tag))) el.remove();
  }
  for (const el of Array.from(svg.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      // Event handlers, and any reference that could leave the page.
      if (name.startsWith('on')) { el.removeAttribute(attr.name); continue; }
      if ((name === 'href' || name === 'xlink:href') && !attr.value.startsWith('#')) {
        el.removeAttribute(attr.name);
      }
    }
  }

  raiseAyahMarkers(svg);

  // The page must scale to its container, so any fixed size is dropped and the
  // viewBox alone governs the aspect ratio.
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  return svg as unknown as SVGSVGElement;
}
