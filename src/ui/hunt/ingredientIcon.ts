/** Warm the ingredient at battle entry, not during its short-lived hit effect. */
export function preloadIngredientIcon(src:string,ready:(loaded:boolean)=>void=()=>{},image=new Image()){
  let active=true;
  const finish=(loaded:boolean)=>{if(active)ready(loaded)};
  image.onload=()=>{
    // Both synchronous decoder errors and rejected promises keep the fallback.
    void Promise.resolve().then(()=>image.decode?.())
      .then(()=>finish(image.naturalWidth>0),()=>finish(false));
  };
  image.onerror=()=>finish(false);
  image.src=src;
  return()=>{active=false;image.onload=null;image.onerror=null};
}
