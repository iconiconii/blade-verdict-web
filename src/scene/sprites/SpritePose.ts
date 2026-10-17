export interface SpriteLayer {image:HTMLImageElement;weight:number}

/** Bound interrupted transitions too: merge shared poses and keep at most four layers. */
export function mixSpriteLayers(from:readonly SpriteLayer[],to:readonly SpriteLayer[],mix:number):SpriteLayer[]{
  const weights=new Map<HTMLImageElement,number>(),amount=Math.max(0,Math.min(1,mix));
  for(const [layers,scale] of [[from,1-amount],[to,amount]] as const)
    for(const layer of layers)weights.set(layer.image,(weights.get(layer.image)??0)+layer.weight*scale);
  const layers=[...weights].map(([image,weight])=>({image,weight})).filter(layer=>layer.weight>.001)
    .sort((a,b)=>b.weight-a.weight).slice(0,4);
  const total=layers.reduce((sum,layer)=>sum+layer.weight,0);
  return layers.map(layer=>({...layer,weight:layer.weight/total}));
}
