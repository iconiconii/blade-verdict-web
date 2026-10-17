import { expect, it, vi } from 'vitest';
import { preloadIngredientIcon } from './ingredientIcon';

function pendingImage(decode:()=>Promise<void>=()=>Promise.resolve()){
  return {src:'',naturalWidth:80,onload:null,onerror:null,decode} as unknown as HTMLImageElement;
}
const loaded=(image:HTMLImageElement)=>image.onload?.call(image,new Event('load'));
const flush=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve()};

it('starts warming the image before any hit and waits for decode before showing it',async()=>{
  let finish!:()=>void;
  const image=pendingImage(()=>new Promise<void>(resolve=>{finish=resolve})),ready=vi.fn();
  const dispose=preloadIngredientIcon('/assets/ui-kit/icons/corn.png',ready,image);
  expect(image.src).toBe('/assets/ui-kit/icons/corn.png');
  expect(ready).not.toHaveBeenCalled();
  loaded(image);await flush();expect(ready).not.toHaveBeenCalled();
  finish();await flush();expect(ready).toHaveBeenCalledWith(true);
  dispose();expect(image.onload).toBeNull();expect(image.onerror).toBeNull();
});

it('keeps the fallback when the image request fails',()=>{
  const image=pendingImage(),ready=vi.fn();
  preloadIngredientIcon('/missing.png',ready,image);
  image.onerror?.call(image,new Event('error'));
  expect(ready).toHaveBeenCalledWith(false);
});

it.each(['reject','throw'] as const)('handles a decoder that can %s without an unhandled error',async(mode)=>{
  const image=pendingImage(()=>{if(mode==='throw')throw Error('decode');return Promise.reject(Error('decode'))}),ready=vi.fn();
  preloadIngredientIcon('/icon.png',ready,image);loaded(image);await flush();
  expect(ready).toHaveBeenCalledWith(false);
});

it('does not apply an old decode callback after leaving or changing monsters',async()=>{
  let finish!:()=>void;
  const image=pendingImage(()=>new Promise<void>(resolve=>{finish=resolve})),ready=vi.fn();
  const dispose=preloadIngredientIcon('/icon.png',ready,image);
  loaded(image);await flush();dispose();finish();await flush();
  expect(ready).not.toHaveBeenCalled();
});
