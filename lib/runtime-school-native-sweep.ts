/** Source-locked SDK 10.5.3 float triangle/sphere narrow phase, in centimetres.
 * The caller supplies the already-rounded local direction and length. Rebuilding
 * an endpoint and normalizing it again changes grazing contacts.
 * This is a triangle specialization, not a general convex EPA implementation.
 */
export type SweepVector = [number, number, number];
export type NativeTriangleSweep = {
  vertices: [SweepVector, SweepVector, SweepVector]; origin: SweepVector;
  direction: SweepVector; length: number; radius: number;
};
export type NativeTriangleContact = { distance: number; point: SweepVector; normal: SweepVector };
type Simplex = { v: SweepVector; s: SweepVector[]; weights: number[] };
const f = Math.fround, epsilon = f(1e-6), floatMinimum = 1.1754943508222875e-38;
const add = (a: SweepVector, b: SweepVector): SweepVector => [f(a[0]+b[0]),f(a[1]+b[1]),f(a[2]+b[2])];
const sub = (a: SweepVector, b: SweepVector): SweepVector => [f(a[0]-b[0]),f(a[1]-b[1]),f(a[2]-b[2])];
const mul = (a: SweepVector, s: number): SweepVector => [f(a[0]*s),f(a[1]*s),f(a[2]*s)];
const dot = (a: SweepVector, b: SweepVector) => f(f(f(a[0]*b[0])+f(a[1]*b[1]))+f(a[2]*b[2]));
const norm = (a: SweepVector) => mul(a,f(1/f(Math.sqrt(dot(a,a)))));
const cross = (a: SweepVector, b: SweepVector): SweepVector => [
  f(f(a[1]*b[2])-f(a[2]*b[1])),f(f(a[2]*b[0])-f(a[0]*b[2])),f(f(a[0]*b[1])-f(a[1]*b[0])),
];

function closest(s: SweepVector[], x: SweepVector): Simplex {
  const p = s.map(a => sub(x,a));
  if (s.length === 4) {
    // Repeated support points still enter the tetrahedron reduction. Omitting
    // them changes face order and rounding, even though its volume is zero.
    const [a,b,c,d] = p;
    const volumes = [f(-dot(cross(c,d),b)),dot(cross(c,d),a),f(-dot(cross(b,d),a)),dot(cross(b,c),a)];
    const total = f(f(f(volumes[3]+volumes[2])+volumes[1])+volumes[0]);
    const faces = [[1,2,3],[0,2,3],[0,1,3],[0,1,2]];
    let best: Simplex | null = null;
    for (let i=0;i<4;i++) {
      if ((total<0)===(volumes[i]<0) && f(volumes[i]*total)!==0) continue;
      const hit = closest(faces[i].map(i=>s[i]),x);
      if (!best || dot(hit.v,hit.v)<dot(best.v,best.v)) best=hit;
    }
    return best ?? {v:[0,0,0],s,weights:volumes.map(v=>f(v*f(1/total)))};
  }
  const vertex = (i: number): Simplex => ({v:p[i],s:[s[i]],weights:[1]});
  const edge = (i: number, j: number, t: number): Simplex => ({
    v:add(p[i],mul(sub(p[j],p[i]),t)),s:[s[i],s[j]],weights:[f(1-t),t],
  });
  const line = (i: number, j: number): Simplex => {
    const a=p[i], ab=sub(p[j],a), d=dot(ab,ab), n=dot(mul(a,-1),ab);
    if (n<=0) return vertex(i);
    if (d<=n || d<=floatMinimum) return vertex(j);
    return edge(i,j,f(n/d));
  };
  if (s.length===1) return vertex(0);
  if (s.length===2) return line(0,1);
  const [a,b,c]=p, ab=sub(b,a), ac=sub(c,a), n=cross(ab,ac), nn=dot(n,n);
  // The native degeneracy bound is FLT_MIN scaled by the first point. It
  // underflows to zero throughout the supported school coordinate range.
  if (nn===0) return line(0,1);
  const ap=mul(a,-1), d1=dot(ab,ap), d2=dot(ac,ap);
  if (d1<=0 && d2<=0) return vertex(0);
  const bp=mul(b,-1), d3=dot(ab,bp), d4=dot(ac,bp);
  if (d3>=0 && d4<=d3) return vertex(1);
  const vc=f(f(d1*d4)-f(d3*d2));
  if (vc<=0 && d1>=0 && d3<=0 && f(d1-d3)>0) return edge(0,1,f(d1/f(d1-d3)));
  const cp=mul(c,-1), d5=dot(ab,cp), d6=dot(ac,cp);
  if (d6>=0 && d5<=d6) return vertex(2);
  const vb=f(f(d5*d2)-f(d1*d6));
  if (vb<=0 && d2>=0 && d6<=0 && f(d2-d6)>0) return edge(0,2,f(d2/f(d2-d6)));
  const va=f(f(d3*d6)-f(d5*d4)), numerator=f(d4-d3), denominator=f(numerator+f(d5-d6));
  if (va<=0 && numerator>=0 && f(d5-d6)>=0 && denominator>0) return edge(1,2,f(numerator/denominator));
  // Divide normal components first, then dot and multiply. A mathematically
  // equivalent barycentric point sum does not reproduce the float projection.
  const scaled=n.map(x=>f(x/nn)) as SweepVector;
  const inverse=f(1/f(f(vb+vc)+va)), wb=f(inverse*vb), wc=f(inverse*vc);
  return {v:mul(n,dot(scaled,a)),s,weights:[f(f(1-wb)-wc),wb,wc]};
}

export function sweepSphereTriangle(input: NativeTriangleSweep): NativeTriangleContact | null {
  const tri=input.vertices.map(v=>v.map(f) as SweepVector), origin=input.origin.map(f) as SweepVector;
  const r=f(input.radius), direction=input.direction, length=input.length, inflated=f(f(r*r)+epsilon);
  if (!(length>0) || !(r>0) || ![...tri.flat(),...origin,...direction,length,r].every(Number.isFinite)) {
    throw new Error("Invalid native sphere sweep");
  }
  // Chaos switches to another numeric kernel above this edge component bound.
  // The school compiler must keep that unsupported route out of this packet.
  for (let i=0;i<3;i++) for (let axis=0;axis<3;axis++) {
    const delta=f(tri[i][axis]-tri[(i+1)%3][axis]);
    if (f(delta*delta)>1e10) throw new Error("Native triangle requires the large-triangle kernel");
  }
  const support = (v: SweepVector): SweepVector => {
    const d=tri.map(p=>dot(p,v));
    return d[1]>=d[0] && d[1]>=d[2] ? tri[1] : d[0]>=d[2] ? tri[0] : tri[2];
  };
  let x=origin, t=0, axis: SweepVector=[0,0,1], v=sub(x,support([1,0,0]));
  let s: SweepVector[]=[], weights: number[]=[], retainedDistance: number | null=null;
  let initialRefining=false, previous=3.4028234663852886e38;
  for (let iteration=0;iteration<32;iteration++) {
    if (dot(v,v)<=epsilon) break;
    v=norm(v);
    const a=support(v), w=sub(x,a), vw=dot(v,w);
    if (vw>r) {
      const vd=dot(v,direction);
      if (vd>=0) return null;
      const next=f(t-f(f(vw-r)/vd));
      if (next>length) return null;
      if (next>t) {
        t=next; x=add(origin,mul(direction,t)); axis=v;
        previous=3.4028234663852886e38; initialRefining=false;
      }
    }
    const finishRefine=initialRefining && vw>=0 && previous<=f(vw+epsilon);
    s.push(a);
    const result=closest(s,x); s=result.s; v=result.v; weights=result.weights;
    const distance=dot(v,v);
    // Preserve the native split: updated direction, previous squared distance.
    if (finishRefine) {retainedDistance=previous;break;}
    if (distance<inflated && (t>0 || distance<=epsilon) || previous<=distance) break;
    initialRefining=t===0 && distance<inflated && distance>epsilon;
    previous=distance;
  }
  if (t>0) return {distance:t,normal:axis,point:sub(add(origin,mul(direction,t)),mul(axis,r))};
  if (dot(v,v)<=epsilon) {
    if (!s.length) return {distance:f(-r),normal:[0,0,1],point:support([1,0,0])};
    const point=s.reduce((sum,a,i)=>add(sum,mul(a,weights[i])),[0,0,0] as SweepVector);
    // A point and a zero-thickness triangle cannot form a volumetric EPA hull.
    // Retain its initialization fallback normal and the simplex witness, rather
    // than normalizing tiny separation noise or reversing it toward the ray.
    if (s.length<3) {
      const positive=support([0,0,1]), negative=support([0,0,-1]);
      const second=s.length===2 ? s[1] : dot(sub(positive,origin),[0,0,1])>dot(sub(negative,origin),[0,0,-1]) ? positive : negative;
      const edge=sub(sub(second,origin),sub(s[0],origin)), ae=edge.map(Math.abs);
      const axis: SweepVector=ae[2]<ae[1] ? ae[2]<ae[0] ? [0,0,1] : [1,0,0] : ae[1]<ae[0] ? [0,1,0] : [1,0,0];
      const normal=dot(edge,edge)>f(.0001) ? norm(cross(edge,axis)) : [0,0,1] as SweepVector;
      return {distance:f(-r),normal,point};
    }
    const p=s.map(a=>sub(a,origin)), normal=norm(cross(sub(p[2],p[0]),sub(p[1],p[0])));
    return {distance:f(-r),normal,point};
  }
  const distance=f(Math.sqrt(retainedDistance??dot(v,v)));
  if (distance>r+1e-5) return null;
  const normal=distance>0 ? norm(v) : axis, depth=Math.max(0,f(r-distance));
  return {distance:f(-depth),normal,point:sub(origin,mul(normal,f(r-depth)))};
}
