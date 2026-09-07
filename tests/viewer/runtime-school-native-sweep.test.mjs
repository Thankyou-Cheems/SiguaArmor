import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { sweepSphereTriangle } from "../../lib/runtime-school-native-sweep.ts";
import { createSchoolNativeSphereSweep } from "../../lib/runtime-school-native-sweep-frame.ts";

// Synthetic geometry, independently captured from SDK 10.5.3 Chaos.
// Cases exercise vertex/edge EPA fallback and repeated-support tetrahedra.
// Source DLL SHA256: 136fb10ebf95b0253c343b820c8c05ee6478863ab09c25e76f200a3ee836de3b.
const cases = [
  {
    "vertices": [
      [
        -106.5763168334961,
        -133.90151977539062,
        161.4371337890625
      ],
      [
        121.27057647705078,
        123.23243713378906,
        27.204788208007812
      ],
      [
        -194.20799255371094,
        -51.17070007324219,
        83.01480865478516
      ]
    ],
    "origin": [
      7.347132205963135,
      -5.334546089172363,
      94.32096099853516
    ],
    "direction": [
      -0.17524749040603638,
      0.5731646418571472,
      0.8004814386367798
    ],
    "length": 100.0,
    "radius": 2,
    "expected": {
      "distance": -2.0,
      "point": [
        7.347114562988281,
        -5.334556579589844,
        94.32096862792969
      ],
      "normal": [
        0.7484441995620728,
        -0.6631978154182434,
        0.0
      ]
    }
  },
  {
    "vertices": [
      [
        183.3177032470703,
        93.50382995605469,
        -151.92860412597656
      ],
      [
        -176.10421752929688,
        -197.50128173828125,
        -157.26727294921875
      ],
      [
        -49.73384475708008,
        -187.98056030273438,
        -96.46965789794922
      ]
    ],
    "origin": [
      183.31787109375,
      93.50363159179688,
      -151.9289093017578
    ],
    "direction": [
      -0.4077313244342804,
      0.48944950103759766,
      0.770840048789978
    ],
    "length": 100.0,
    "radius": 4,
    "expected": {
      "distance": -4.0,
      "point": [
        183.3177032470703,
        93.50382995605469,
        -151.92860412597656
      ],
      "normal": [
        0.0,
        0.0,
        1.0
      ]
    }
  },
  {
    "vertices": [
      [
        -140.28611755371094,
        -128.8333282470703,
        115.2330551147461
      ],
      [
        -1.0878405570983887,
        92.32776641845703,
        76.42910766601562
      ],
      [
        -130.97128295898438,
        -143.2506561279297,
        -29.534414291381836
      ]
    ],
    "origin": [
      -140.28543090820312,
      -128.833740234375,
      115.23313903808594
    ],
    "direction": [
      -0.8498309254646301,
      0.5162664651870728,
      -0.1060957983136177
    ],
    "length": 100.0,
    "radius": 8,
    "expected": {
      "distance": -8.0,
      "point": [
        -140.28611755371094,
        -128.8333282470703,
        115.2330551147461
      ],
      "normal": [
        0.0,
        -0.9950775504112244,
        0.09909933805465698
      ]
    }
  },
  {
    "vertices": [
      [
        -114.8167495727539,
        -179.8770751953125,
        15.303553581237793
      ],
      [
        195.59848022460938,
        70.47217559814453,
        141.87680053710938
      ],
      [
        123.65432739257812,
        30.655866622924805,
        -63.74337387084961
      ]
    ],
    "origin": [
      66.53276824951172,
      -24.349409103393555,
      31.341917037963867
    ],
    "direction": [
      0.6450362801551819,
      -0.7601088285446167,
      -0.0785033255815506
    ],
    "length": 100.0,
    "radius": 5,
    "expected": {
      "distance": -2.500007152557373,
      "point": [
        68.14535522460938,
        -26.249675750732422,
        31.145658493041992
      ],
      "normal": [
        -0.6450362801551819,
        0.7601088285446167,
        0.07850325852632523
      ]
    }
  },
  {
    "vertices": [
      [
        -3.9684300422668457,
        165.5289306640625,
        116.58065032958984
      ],
      [
        93.68286895751953,
        -189.76756286621094,
        101.04594421386719
      ],
      [
        -64.35787200927734,
        -58.18876647949219,
        -135.73486328125
      ]
    ],
    "origin": [
      -2.241093873977661,
      166.0416259765625,
      115.71263122558594
    ],
    "direction": [
      -0.8636680841445923,
      -0.25635063648223877,
      0.43400663137435913
    ],
    "length": 100.0,
    "radius": 1,
    "expected": {
      "distance": 0.9999847412109375,
      "point": [
        -3.968416690826416,
        165.5289306640625,
        116.58063507080078
      ],
      "normal": [
        0.8636680841445923,
        0.25635063648223877,
        -0.4340066909790039
      ]
    }
  },
  {
    "vertices": [
      [
        107.73042297363281,
        70.40455627441406,
        -68.2851333618164
      ],
      [
        87.41276550292969,
        -61.947914123535156,
        -125.99691772460938
      ],
      [
        -186.04319763183594,
        72.17464447021484,
        55.411033630371094
      ]
    ],
    "origin": [
      2.3329265117645264,
      27.715177536010742,
      -47.96576690673828
    ],
    "direction": [
      0.3502020239830017,
      -0.41904154419898987,
      0.8377127647399902
    ],
    "length": 100.0,
    "radius": 4,
    "expected": {
      "distance": -1.9999971389770508,
      "point": [
        3.0333316326141357,
        26.877092361450195,
        -46.29033660888672
      ],
      "normal": [
        -0.3502020835876465,
        0.41904154419898987,
        -0.837712824344635
      ]
    }
  },
  {
    "vertices": [
      [
        -65.69690704345703,
        165.86172485351562,
        -34.50429153442383
      ],
      [
        108.47392272949219,
        -90.05000305175781,
        -83.99630737304688
      ],
      [
        181.36380004882812,
        -158.65728759765625,
        -147.15623474121094
      ]
    ],
    "origin": [
      73.13786315917969,
      -28.52760887145996,
      -89.37964630126953
    ],
    "direction": [
      0.7878687381744385,
      0.45621076226234436,
      0.413684219121933
    ],
    "length": 100.0,
    "radius": 4,
    "expected": {
      "distance": -2.0000038146972656,
      "point": [
        74.7136001586914,
        -27.615190505981445,
        -88.55227661132812
      ],
      "normal": [
        -0.7878687381744385,
        -0.45621076226234436,
        -0.41368424892425537
      ]
    }
  }
];
test("synthetic native controls preserve depth, contact and degenerate normals", () => {
  for (const fixture of cases) {
    const hit=sweepSphereTriangle(fixture), expected=fixture.expected;
    assert.ok(hit);
    assert.ok(Math.abs(hit.distance-expected.distance)<=1e-5);
    assert.ok(Math.hypot(...hit.point.map((v,i)=>v-expected.point[i]))<=1e-4);
    assert.ok(hit.normal.reduce((sum,v,i)=>sum+v*expected.normal[i],0)>=.999999);
  }
});
test("a separated sphere misses when moving away and hits before crossing a plane", () => {
  const input={vertices:[[-100,-100,0],[100,-100,0],[0,100,0]],origin:[0,0,10],direction:[0,0,-1],length:20,radius:1};
  const hit=sweepSphereTriangle(input);
  assert.equal(hit.distance,9);assert.deepEqual(hit.point,[0,0,0]);
  assert.ok(hit.normal[0]===0 && hit.normal[1]===0 && hit.normal[2]===1);
  assert.equal(sweepSphereTriangle({...input,direction:[0,0,1]}),null);
  assert.equal(sweepSphereTriangle({...input,length:8}),null);
});
test("sphere frames scale shared triangles, retain cm radius and restore the world point", () => {
  const pose={translationCm:[1000,2000,3000],rotationQuaternion:[0,0,0,1],scale3d:[2,3,.5]};
  const cast=createSchoolNativeSphereSweep({startCm:[1000,2000,3100],endCm:[1000,2000,2900]},pose,5);
  const triangle=new THREE.Triangle(new THREE.Vector3(-100,-100,0),new THREE.Vector3(100,-100,0),new THREE.Vector3(0,100,0));
  const before=triangle.a.toArray(), hit=cast(triangle);
  assert.equal(hit.signedDistanceM,.95);
  assert.equal(hit.timeFraction,Math.fround(95/200));
  assert.deepEqual(hit.point.toArray(),[10,30,20]);
  assert.deepEqual(hit.normal.toArray(),[0,1,0]);
  assert.deepEqual(triangle.a.toArray(),before);
});
test("invalid inputs and unsupported large triangles fail explicitly", () => {
  const input={vertices:[[0,0,0],[1,0,0],[0,1,0]],origin:[0,0,10],direction:[0,0,-1],length:20,radius:1};
  assert.throws(()=>sweepSphereTriangle({...input,radius:NaN}),/Invalid/);
  assert.throws(()=>sweepSphereTriangle({...input,vertices:[[0,0,0],[200000,0,0],[0,200000,0]]}),/large-triangle/);
});
