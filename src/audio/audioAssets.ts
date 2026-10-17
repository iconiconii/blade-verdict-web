import type { AudioCue, AudioSampleConfig } from './AudioManager';
import { assetUrl } from '../ui/assets';

const sample=(file:string,settings:Omit<AudioSampleConfig,'url'>):AudioSampleConfig=>({
  url:assetUrl(`assets/audio/${file}`),...settings,
});

// Original MP3s are retained. Gain compensates the very quiet parry recording;
// trimmed playback removes silence, without delaying combat or modifying files.
export const battleAudioAssets:Partial<Record<AudioCue,AudioSampleConfig>>={
  Nice:sample('hit-small.mp3',{volume:2.7,duration:.235,maxVoices:2,priority:2}),
  Perfect:sample('hit-small.mp3',{volume:3.3,playbackRate:.94,duration:.235,maxVoices:2,priority:3,layerSynth:true}),
  Miss:sample('parry-miss.mp3',{volume:.18,duration:.49,maxVoices:2,priority:3}),
  Cut:sample('verdict-hit.mp3',{volume:.65,offset:.025,duration:.265,cooldownMs:55,maxVoices:2,priority:1}),
  SwingMiss:sample('swing-miss.mp3',{volume:.17,offset:.035,duration:.8,cooldownMs:350,maxVoices:1,priority:1}),
  VerdictEnd:sample('verdict-end.mp3',{volume:.32,offset:.18,duration:1.02,maxVoices:1,priority:5}),
  // Ready, Bomb and Finisher deliberately retain their distinct synth cues.
};

export const globalAudioAssets:Partial<Record<AudioCue,AudioSampleConfig>>={
  UI:sample('ui-click.mp3',{volume:.15,duration:.14,cooldownMs:60,maxVoices:2,priority:1}),
  Victory:sample('victory.mp3',{volume:.55,duration:3.44,maxVoices:1,priority:6}),
  Defeat:sample('defeat.mp3',{volume:.55,offset:.04,duration:2.32,maxVoices:1,priority:6}),
};

export const backgroundMusic={url:assetUrl('assets/audio/bgm-clean.mp3'),volume:.16,duckVolume:.055};
