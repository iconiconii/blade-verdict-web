import type { BodyAnchorId, BossKind } from '../../domain/v2';
import type { SpriteBox, SpriteClip, SpriteFrame, SpriteManifest } from './SpriteFrames';

type Point={x:number;y:number};
export interface SpriteGeometry {
  /** Original 960-space to CSS pixel transform. */
  origin:Point;
  scale:number;
  bodyCenter:Point;
  bodyRadius:Point;
  foot:Point;
  sourceBody:[number,number,number,number];
}

/** The props differ by character, so use the illustrated body rather than the crop edge. */
const anchors:Record<BossKind,Partial<Record<BodyAnchorId,Point>>>= {
  corn:{head:{x:.54,y:.39},belly:{x:.55,y:.62},leftHand:{x:.23,y:.63},rightHand:{x:.80,y:.65},
    leftKnee:{x:.38,y:.84},rightKnee:{x:.70,y:.84},leftShoulder:{x:.36,y:.49},rightShoulder:{x:.72,y:.49}},
  carrot:{head:{x:.62,y:.43},belly:{x:.62,y:.62},leftHand:{x:.28,y:.56},rightHand:{x:.83,y:.62},
    leftKnee:{x:.49,y:.84},rightKnee:{x:.78,y:.83},leftShoulder:{x:.45,y:.49},rightShoulder:{x:.76,y:.50}},
  cabbage:{head:{x:.59,y:.44},belly:{x:.57,y:.66},leftHand:{x:.23,y:.59},rightHand:{x:.86,y:.60},
    leftKnee:{x:.43,y:.84},rightKnee:{x:.78,y:.84},leftShoulder:{x:.39,y:.49},rightShoulder:{x:.76,y:.49}},
  tomato:{head:{x:.58,y:.44},belly:{x:.58,y:.67},leftHand:{x:.25,y:.58},rightHand:{x:.91,y:.68},
    leftKnee:{x:.39,y:.91},rightKnee:{x:.80,y:.91},leftShoulder:{x:.36,y:.44},rightShoulder:{x:.80,y:.49}},
  jelly:{head:{x:.60,y:.42},belly:{x:.60,y:.64},leftFin:{x:.29,y:.58},rightFin:{x:.85,y:.58},
    leftJoint:{x:.37,y:.73},rightJoint:{x:.79,y:.73},lowerJoint:{x:.60,y:.82}},
};

/** One fixed framing fits the full Idle motion without reacting to attack effects. */
export function spriteGeometry(manifest:SpriteManifest,width:number,height:number):SpriteGeometry {
  const [cropX,cropY]=manifest.crop;
  const [boxLeft,boxTop,boxRight,boxBottom]=manifest.clips.Idle[0].bbox;
  const left=boxLeft+cropX,top=boxTop+cropY,right=boxRight+cropX,bottom=boxBottom+cropY;
  const bodyWidth=right-left,bodyHeight=bottom-top;
  const idleLeft=cropX+Math.min(...manifest.clips.Idle.map(frame=>frame.bbox[0]));
  const idleRight=cropX+Math.max(...manifest.clips.Idle.map(frame=>frame.bbox[2]));
  const sideMargin=width*.02;
  const scale=Math.min(height*.48/bodyHeight,width*.86/bodyWidth,
    (width-sideMargin*2)/(idleRight-idleLeft),2.4);
  const preferredX=width*.52-(left+right)*.5*scale;
  const origin={
    x:Math.max(sideMargin-idleLeft*scale,Math.min(width-sideMargin-idleRight*scale,preferredX)),
    y:height*.80-bottom*scale,
  };
  return {
    origin,scale,
    bodyCenter:{x:origin.x+(left+right)*.5*scale,y:origin.y+(top+(bottom-top)*.55)*scale},
    bodyRadius:{x:Math.max(width*.175,bodyWidth*scale*.48),y:Math.max(height*.155,bodyHeight*scale*.53)},
    foot:{x:origin.x+(left+right)*.5*scale,y:origin.y+bottom*scale},
    sourceBody:[left,top,right,bottom],
  };
}

/**
 * Keep targets attached to the illustrated pose, not the Idle silhouette.
 * Wide effect/projectile bounds do not describe the body. Bridge those short
 * stretches using the nearest reliable poses in the same supplied clip.
 */
export function spritePoseBounds(manifest:SpriteManifest,clip:SpriteClip,frame:SpriteFrame):SpriteBox {
  const idle=manifest.clips.Idle[0].bbox;
  const idleWidth=idle[2]-idle[0],idleHeight=idle[3]-idle[1];
  const reliable=(candidate:SpriteFrame)=>{
    const [left,top,right,bottom]=candidate.bbox;
    const width=right-left,height=bottom-top;
    return width<=idleWidth*1.4&&height<=idleHeight*1.4
      &&width>=idleWidth*.5&&height>=idleHeight*.5;
  };
  let local:SpriteBox=frame.bbox;
  if(!reliable(frame)){
    const frames=manifest.clips[clip],index=frames.indexOf(frame);
    let before:SpriteFrame|undefined,after:SpriteFrame|undefined;
    for(let i=index-1;i>=0;i--)if(reliable(frames[i])){before=frames[i];break}
    for(let i=index+1;i<frames.length;i++)if(reliable(frames[i])){after=frames[i];break}
    const from=before?.bbox??idle,to=after?.bbox??from;
    const fraction=before&&after?(frame.n-before.n)/(after.n-before.n):0;
    local=from.map((value,i)=>value+(to[i]-value)*fraction) as SpriteBox;
  }
  return [local[0]+manifest.crop[0],local[1]+manifest.crop[1],
    local[2]+manifest.crop[0],local[3]+manifest.crop[1]];
}

export function spriteAnchor(geometry:SpriteGeometry,kind:BossKind,anchorId:BodyAnchorId,
  poseBounds:SpriteBox=geometry.sourceBody):Point {
  const [left,top,right,bottom]=poseBounds;
  const relative=anchors[kind][anchorId]??anchors[kind].belly??{x:.5,y:.6};
  return {
    x:geometry.origin.x+(left+(right-left)*relative.x)*geometry.scale,
    y:geometry.origin.y+(top+(bottom-top)*relative.y)*geometry.scale,
  };
}

/** A 2D affine transform shared by the actor, rings, and feedback origins. */
export interface ActorTransform {x:number;y:number;rotation:number;scaleX:number;scaleY:number}
export const neutralTransform:ActorTransform={x:0,y:0,rotation:0,scaleX:1,scaleY:1};
export function transformPoint(point:Point,pivot:Point,transform:ActorTransform):Point {
  const localX=(point.x-pivot.x)*transform.scaleX,localY=(point.y-pivot.y)*transform.scaleY;
  const cosine=Math.cos(transform.rotation),sine=Math.sin(transform.rotation);
  return {x:pivot.x+transform.x+localX*cosine-localY*sine,
    y:pivot.y+transform.y+localX*sine+localY*cosine};
}

/** Verdict strokes use 0–1 stage coordinates; geometry uses CSS pixels. */
export function spriteContainsPoint(geometry:SpriteGeometry,transform:ActorTransform,point:Point,width:number,height:number){
  const center=transformPoint(geometry.bodyCenter,geometry.bodyCenter,transform);
  const rx=geometry.bodyRadius.x*Math.abs(transform.scaleX),ry=geometry.bodyRadius.y*Math.abs(transform.scaleY);
  if(rx<=0||ry<=0)return false;
  const x=point.x*width,y=point.y*height;
  return ((x-center.x)/rx)**2+((y-center.y)/ry)**2<=1;
}
