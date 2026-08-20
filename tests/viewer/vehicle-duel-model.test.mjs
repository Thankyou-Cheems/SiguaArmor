import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveVehicleDuel,
} from "../../lib/vehicle-duel-model.ts";

function weapon(id, interval = 1) {
  return {
    id,
    label: id,
    sourceLabel: id,
    assignmentId: id,
    sourceCardId: `${id}-card`,
    sourceRawName: `${id}-raw`,
    damagePerShot: 1,
    timeBetweenShotsSeconds: interval,
    magazineSize: 100,
    tacticalReloadSeconds: 4,
    dryReloadSeconds: 4,
    overheat: null,
  };
}

const target = (key, poolKind, maxHealth, damagePerShot) => ({
  key,
  poolKind,
  maxHealth,
  damagePerShot,
});
test("ammo-rack destruction is an immediate loss and cuts off later outgoing shots", () => {
  const result = resolveVehicleDuel({
    leftAttack: {
      weapon: weapon("left"),
      targets: [
        target("right-hull", "hull", 1000, 100),
        target("right-ammo", "ammo-rack", 300, 100),
      ],
    },
    rightAttack: {
      weapon: weapon("right"),
      targets: [target("left-hull", "hull", 500, 100)],
    },
  });
  assert.equal(result.winner, "left");
  assert.equal(result.decisiveTimeSeconds, 2);
  assert.equal(result.rightLoss?.poolKind, "ammo-rack");
  assert.equal(result.rightLoss?.timeSeconds, 2);
  assert.equal(result.leftAttack.actualSimulation?.killTimeSeconds, 2);
  assert.equal(result.rightAttack.actualSimulation?.killTimeSeconds, null);
  assert.equal(result.rightAttack.actualSimulation?.shots, 3);
  assert.ok(
    result.rightAttack.actualSimulation?.events.every(
      ({ timeSeconds }) => timeSeconds <= 2,
    ),
  );
});

test("hull destruction still wins when it happens before a damaged ammo rack", () => {
  const result = resolveVehicleDuel({
    leftAttack: {
      weapon: weapon("left"),
      targets: [
        target("right-hull", "hull", 200, 100),
        target("right-ammo", "ammo-rack", 1000, 100),
      ],
    },
    rightAttack: {
      weapon: weapon("right"),
      targets: [target("left-hull", "hull", 800, 100)],
    },
  });
  assert.equal(result.winner, "left");
  assert.equal(result.rightLoss?.poolKind, "hull");
  assert.equal(result.decisiveTimeSeconds, 1);
});

test("shots at the same timestamp resolve together and can produce a draw", () => {
  const result = resolveVehicleDuel({
    leftAttack: {
      weapon: weapon("left"),
      targets: [target("right-ammo", "ammo-rack", 300, 100)],
    },
    rightAttack: {
      weapon: weapon("right"),
      targets: [target("left-ammo", "ammo-rack", 300, 100)],
    },
  });
  assert.equal(result.winner, "draw");
  assert.equal(result.decisiveTimeSeconds, 2);
  assert.equal(result.leftAttack.actualSimulation?.killTimeSeconds, 2);
  assert.equal(result.rightAttack.actualSimulation?.killTimeSeconds, 2);
});

test("nonlethal component pools never replace hull or ammo-rack victory conditions", () => {
  const result = resolveVehicleDuel({
    leftAttack: {
      weapon: weapon("left"),
      targets: [
        target("right-track", "track", 100, 100),
        target("right-hull", "hull", 500, 100),
      ],
    },
    rightAttack: {
      weapon: weapon("right", 2),
      targets: [target("left-hull", "hull", 500, 100)],
    },
  });
  assert.equal(result.rightLoss?.poolKind, "hull");
  assert.equal(result.rightLoss?.timeSeconds, 4);
  assert.equal(result.winner, "left");
});
