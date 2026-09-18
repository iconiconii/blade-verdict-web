import type { Quality } from './v2';
export interface Ingredient {id:string;quality:Quality;count:number}
export interface Recipe {id:string;requirements:Record<string,number>;multiplier:number}
const rank:Quality[]=['Broken','Normal','High','Top'];
export function matches(selected:Ingredient[],recipe:Recipe){const actual=Object.fromEntries(selected.map(i=>[i.id,i.count]));return Object.keys(actual).length===Object.keys(recipe.requirements).length&&Object.entries(recipe.requirements).every(([id,n])=>actual[id]===n)}
export function dishQuality(selected:Ingredient[]):Quality {if(!selected.length)throw Error('At least one ingredient is required');return selected.reduce((a,b)=>rank.indexOf(a.quality)<rank.indexOf(b.quality)?a:b).quality}
export function sellPrice(selected:Ingredient[],recipe:Recipe,prices:Record<string,Record<Quality,number>>){if(!matches(selected,recipe))throw Error('Selected ingredients do not match');return Math.round(selected.reduce((n,i)=>n+prices[i.id][i.quality]*i.count,0)*recipe.multiplier)}
