import assert from 'node:assert/strict';
import test from 'node:test';
import { coordinateAdapter } from '../../lib/shared/coordinate-basis.js';
const near = (a,b) => a.forEach((v,i) => assert.ok(Math.abs(v-b[i]) < 1e-10, i+': '+v+' != '+b[i]));
const apply = (m,p) => [0,1,2].map(r => m[r]*p[0]+m[4+r]*p[1]+m[8+r]*p[2]+m[12+r]);

test('format boundaries preserve existing asymmetric position and inverse arithmetic', () => {
  assert.deepEqual(coordinateAdapter('ue-cm','gltf-m').position([123,-234,345]),[1.23,3.45,-2.34]);
  assert.deepEqual(coordinateAdapter('ue-cm','render-m').position([123,-234,345]),[1.23,2.34,3.45]);
  assert.deepEqual(coordinateAdapter('gltf-m','render-m').position([1,2,3]),[1,-3,2]);
  const gltf=[0.29,3.453,2.347];
  assert.deepEqual(coordinateAdapter('gltf-m','ue-cm').position(gltf),[gltf[0]*100,gltf[2]*100,gltf[1]*100]);
});

test('all bases roundtrip points, nonunit directions, quaternions and affine matrices', () => {
  const matrix=[0.2,0.3,0.4,0,-0.5,1.6,0.7,0,0.8,0.9,-2,0,123,-234,345,1];
  for(const from of ['ue-cm','ue-m','gltf-m','render-m']) for(const to of ['ue-cm','ue-m','gltf-m','render-m']) {
    const forward=coordinateAdapter(from,to), reverse=coordinateAdapter(to,from);
    near(reverse.position(forward.position([123,-234,345])),[123,-234,345]);
    near(reverse.direction(forward.direction([2,3,4])),[2,3,4]);
    near(reverse.quaternion(forward.quaternion([0.1,0.2,0.3,0.9])),[0.1,0.2,0.3,0.9]);
    near(reverse.affine(forward.affine(matrix)),matrix);
    // Independent point action proves B M B^-1, including shear/reflection,
    // nonuniform scale and translation. Roundtrip alone cannot prove order.
    near(apply(forward.affine(matrix),forward.position([17,-23,31])),forward.position(apply(matrix,[17,-23,31])));
  }
});

test('quaternion parity and baked identity keep source conventions', () => {
  const swap=coordinateAdapter('ue-cm','gltf-m');
  assert.deepEqual(swap.quaternion([0.1,0.2,0.3,0.9]),[-0.1,-0.3,-0.2,0.9]);
  assert.equal(swap.reversesWinding,true);
  assert.equal(coordinateAdapter('gltf-m','render-m').reversesWinding,false);
  const baked=coordinateAdapter('gltf-m','gltf-m');
  assert.deepEqual(baked.position([12,23,34]),[12,23,34]);
  assert.deepEqual(swap.direction([100,200,300]),[100,300,200]);
});

test('reject unknown bases, incomplete/nonfinite values and projective matrices', () => {
  assert.throws(()=>coordinateAdapter('narva','gltf-m'),/Unknown/);
  assert.throws(()=>coordinateAdapter('toString','gltf-m'),/Unknown/);
  const a=coordinateAdapter('ue-cm','gltf-m');
  for(const value of [[1,2],[1,NaN,3],[1,Infinity,3]]) assert.throws(()=>a.position(value),/Invalid/);
  assert.throws(()=>a.quaternion([0,0,1]),/Invalid/);
  assert.throws(()=>a.affine(Array(16).fill(1)),/affine/);
});
