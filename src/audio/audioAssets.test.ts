import { describe, expect, it } from 'vitest';
import { backgroundMusic, battleAudioAssets, globalAudioAssets } from './audioAssets';

const assetFiles=import.meta.glob('/public/assets/audio/*.mp3');

describe('supplied demo sound manifest',()=>{
  it('connects the supplied files through the deployment base path',()=>{
    const urls=[backgroundMusic.url,...Object.values(battleAudioAssets).map(asset=>asset.url),
      ...Object.values(globalAudioAssets).map(asset=>asset.url)];
    const files=[...new Set(urls.map(url=>url.split('/assets/audio/')[1]))].sort();
    expect(files).toEqual(['bgm-clean.mp3','defeat.mp3','hit-small.mp3','parry-miss.mp3','swing-miss.mp3','ui-click.mp3','verdict-end.mp3','verdict-hit.mp3','victory.mp3']);
    for(const url of urls)expect(url.startsWith(import.meta.env.BASE_URL)).toBe(true);
    for(const file of files)expect(assetFiles).toHaveProperty(`/public/assets/audio/${file}`);
  });

  it('uses the replacement music and dedicated verdict hit without changing parry samples',()=>{
    expect(backgroundMusic).toMatchObject({volume:.16,duckVolume:.055});
    expect(backgroundMusic.url).toContain('/assets/audio/bgm-clean.mp3');
    expect(battleAudioAssets.Cut).toMatchObject({volume:.65,offset:.025,duration:.265});
    expect(battleAudioAssets.Cut!.url).toContain('/assets/audio/verdict-hit.mp3');
    expect(battleAudioAssets.Nice!.url).toContain('/assets/audio/hit-small.mp3');
    expect(battleAudioAssets.Perfect!.url).toBe(battleAudioAssets.Nice!.url);
  });

  it('balances quiet impact against loud samples and reserves the missing cues for synthesis',()=>{
    expect(battleAudioAssets.Nice!.volume).toBeGreaterThan(1);
    expect(battleAudioAssets.Perfect!.volume).toBeGreaterThan(battleAudioAssets.Nice!.volume!);
    expect(battleAudioAssets.Perfect!.layerSynth).toBe(true);
    expect(battleAudioAssets.Miss!.volume).toBeLessThan(.25);
    expect(battleAudioAssets.Ready).toBeUndefined();
    expect(battleAudioAssets.Bomb).toBeUndefined();
    expect(battleAudioAssets.Finisher).toBeUndefined();
    expect(battleAudioAssets.VerdictEnd!.offset).toBe(.18);
    expect(backgroundMusic.duckVolume).toBeLessThan(backgroundMusic.volume);
  });

  it('limits repeated cutting but permits simultaneous independent circle judgments',()=>{
    expect(battleAudioAssets.Cut!.cooldownMs).toBe(55);
    expect(battleAudioAssets.Cut!.maxVoices).toBe(2);
    expect(battleAudioAssets.Nice!.cooldownMs).toBeUndefined();
    expect(battleAudioAssets.Perfect!.cooldownMs).toBeUndefined();
    expect(battleAudioAssets.Nice!.maxVoices).toBeGreaterThanOrEqual(2);
    expect(battleAudioAssets.VerdictEnd!.priority).toBeGreaterThan(battleAudioAssets.Cut!.priority!);
    expect(globalAudioAssets.Victory!.priority).toBeGreaterThan(globalAudioAssets.UI!.priority!);
  });
});
