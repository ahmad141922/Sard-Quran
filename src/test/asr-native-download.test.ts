import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The Android app fetching its own model.
 *
 * Until this existed the weights were side-loaded onto test phones by hand, so
 * every phone that installed the app from Play reported the feature missing
 * and the microphone button was never drawn. What is pinned: the app offers
 * the feature whenever the library is there, asks before the download exactly
 * as the browser does, and hands the plugin the same address the browser
 * fetches from.
 */

const plugin = vi.hoisted(() => ({
  present: false,
  prepared: [] as { url: string }[],
  available: async () => ({ available: true }),
  hasModel: async () => ({ present: plugin.present }),
  prepare: async (options: { url: string }) => { plugin.prepared.push(options); return { ready: true }; },
  addListener: async () => ({ remove: async () => undefined }),
}));

vi.mock('@capacitor/core', async importOriginal => ({
  ...(await importOriginal<object>()),
  registerPlugin: () => plugin,
}));

import { nativeEngine } from '@/lib/asr/native-engine';
import { MODEL_BYTES, modelUrl } from '@/lib/asr/web-engine';

beforeEach(() => { plugin.present = false; plugin.prepared = []; });

describe('the model on a phone', () => {
  it('says how big the download is while the weights are missing', async () => {
    expect(await nativeEngine().needsDownload!()).toBe(MODEL_BYTES);
  });

  it('asks for nothing once they are there', async () => {
    plugin.present = true;
    expect(await nativeEngine().needsDownload!()).toBeNull();
  });

  it('fetches from the same address the browser does', async () => {
    expect(await nativeEngine().prepare()).toBe(true);
    expect(plugin.prepared).toEqual([{ url: modelUrl() }]);
  });
});
