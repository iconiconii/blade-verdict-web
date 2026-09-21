export interface SwipePoint { x:number; y:number }

/** Inspect the crossed segment, including fast swipes whose two ends miss the body. */
export function swipeContact(from:SwipePoint,to:SwipePoint,width:number,height:number,inside:(p:SwipePoint)=>boolean){
  const dx=(to.x-from.x)*width,dy=(to.y-from.y)*height;
  const distance=Math.hypot(dx,dy),threshold=Math.max(38,Math.min(58,Math.min(width,height)*.12));
  if(distance<threshold)return {consumed:false,contact:null,angle:0};
  const steps=Math.min(48,Math.max(2,Math.ceil(distance/12)));
  for(let i=1;i<=steps;i++){
    const t=i/steps,p={x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t};
    if(inside(p))return {consumed:true,contact:p,angle:Math.atan2(dy,dx)};
  }
  return {consumed:true,contact:null,angle:Math.atan2(dy,dx)};
}
