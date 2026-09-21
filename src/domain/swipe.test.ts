import { describe, expect, it } from 'vitest';
import { swipeContact } from './swipe';

const inside=(p:{x:number;y:number})=>p.x>.4&&p.x<.6&&p.y>.3&&p.y<.7;
describe('touch and mouse body slicing',()=>{
  it('ignores stationary input and small finger jitter',()=>{
    expect(swipeContact({x:.5,y:.5},{x:.51,y:.51},390,844,inside).consumed).toBe(false);
  });
  it('recognizes a fast swipe with both endpoints outside the body',()=>{
    const result=swipeContact({x:.1,y:.5},{x:.9,y:.5},390,844,inside);
    expect(result.consumed).toBe(true);
    expect(result.contact).not.toBeNull();
    expect(inside(result.contact!)).toBe(true);
    expect(result.angle).toBe(0);
  });
  it('never awards cuts for a path outside the body',()=>{
    expect(swipeContact({x:.1,y:.1},{x:.9,y:.1},390,844,inside).contact).toBeNull();
  });
  it('handles reverse and diagonal strokes on desktop',()=>{
    const result=swipeContact({x:.8,y:.8},{x:.2,y:.2},1280,800,inside);
    expect(result.contact).not.toBeNull();
    expect(result.angle).toBeLessThan(0);
  });
});
