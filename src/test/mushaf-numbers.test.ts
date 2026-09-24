import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

import { sanitizeMushafSvg } from '@/lib/mushaf/sanitize-svg';

/**
 * The verse numbers staying visible while the verses themselves are covered.
 *
 * Covering an ayah fills its polygon, and the polygon is the ayah's whole box —
 * the circled number at its end included. So the number vanished with the words,
 * and a reciter working down a covered page lost the one landmark that tells
 * them where they are without telling them what comes next.
 *
 * The fix is entirely about paint order, so that is what is asserted here: the
 * markers must end up after the polygons, carrying the same transforms they had.
 * Nothing is hand-typed — a real plate is read, because the thing being checked
 * is a fact about the publisher's file and not about a fixture.
 */

const PLATE = 'sard/public/mushafs/hafs-kfqc/pages/002.svg';
const source = readFileSync(PLATE, 'utf8');

/** The transforms above an element, outermost first — its whole placement. */
const placement = (el: Element): string[] => {
  const out: string[] = [];
  for (let n = el.parentElement; n && n.nodeName.toLowerCase() !== 'svg'; n = n.parentElement) {
    out.unshift(n.getAttribute('transform') ?? '');
  }
  return out;
};

const parse = (s: string) =>
  new DOMParser().parseFromString(s, 'image/svg+xml').documentElement;

describe('the plate this is all built on', () => {
  it('paints its markers before its polygons, which is the problem', () => {
    const before = parse(source);
    const markers = before.querySelector('#ayah_markers')!;
    const poly = before.querySelector('.ayahPolygon')!;
    expect(markers).toBeTruthy();
    expect(poly).toBeTruthy();
    // DOCUMENT_POSITION_FOLLOWING: the polygon comes after the markers.
    expect(markers.compareDocumentPosition(poly) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
  });
});

describe('after sanitising', () => {
  const svg = sanitizeMushafSvg(source)!;

  it('parses at all', () => {
    expect(svg).toBeTruthy();
  });

  it('puts every polygon before the markers, so a cover cannot hide a number', () => {
    const markers = svg.querySelector('#ayah_markers')!;
    expect(markers).toBeTruthy();
    const polygons = [...svg.querySelectorAll('.ayahPolygon')];
    expect(polygons.length).toBeGreaterThan(0);
    for (const poly of polygons) {
      expect(poly.compareDocumentPosition(markers) & Node.DOCUMENT_POSITION_FOLLOWING)
        .toBeTruthy();
    }
  });

  it('keeps the markers exactly where they were drawn', () => {
    const was = placement(parse(source).querySelector('#ayah_markers')!);
    const now = placement(svg.querySelector('#ayah_markers')!);
    expect(now).toEqual(was);
  });

  it('moves them rather than copying them', () => {
    expect(svg.querySelectorAll('#ayah_markers')).toHaveLength(1);
    const was = parse(source).querySelectorAll('#ayah_markers *').length;
    expect(svg.querySelectorAll('#ayah_markers *').length).toBe(was);
  });

  it('leaves a plate with no markers alone', () => {
    const plain = sanitizeMushafSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><g id="content"/></svg>',
    );
    expect(plain).toBeTruthy();
    expect(plain!.querySelector('#ayah_markers')).toBeNull();
  });
});
