import { Suspense } from "react";

import VehicleDuelPrototype from "./VehicleDuelPrototype";

export default function VehicleDuelPrototypePage() {
  return (
    <Suspense fallback={<div className="duel-prototype__loading">正在准备载具斗蛐蛐原型…</div>}>
      <VehicleDuelPrototype />
    </Suspense>
  );
}
