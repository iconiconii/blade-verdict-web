import { expect,it } from 'vitest';
import { mixSpriteLayers } from './SpritePose';

const image=(name:string)=>({src:name}) as HTMLImageElement;

it('normalizes the pose weights without fading the whole actor',()=>{
  const a=image('a'),b=image('b');
  const layers=mixSpriteLayers([{image:a,weight:1}],[{image:b,weight:1}],.4);
  expect(layers).toEqual([{image:a,weight:.6},{image:b,weight:.4}]);
  expect(mixSpriteLayers(layers,[{image:a,weight:1}],.5)).toEqual([
    {image:a,weight:.8},{image:b,weight:.2},
  ]);
});

it('bounds every interrupted transition and merges duplicate image references',()=>{
  let layers=[{image:image('first'),weight:1}];
  for(let i=0;i<100;i++){
    layers=mixSpriteLayers(layers,[{image:image(String(i)),weight:1}],.2);
    expect(layers.length).toBeLessThanOrEqual(4);
    expect(layers.reduce((sum,layer)=>sum+layer.weight,0)).toBeCloseTo(1);
  }
  expect(mixSpriteLayers(layers,[],0)).toEqual(layers);
  const final=image('final');
  expect(mixSpriteLayers(layers,[{image:final,weight:1}],1)).toEqual([{image:final,weight:1}]);
});
