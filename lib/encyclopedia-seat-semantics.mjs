function normalizedSignature(values) {
  return values
    .filter((value) => typeof value === "string" && value.length > 0)
    .join(" ")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function vehicleWeaponSignature(weapon) {
  return normalizedSignature([
    weapon?.displayName,
    weapon?.gunName,
    weapon?.projectile,
    weapon?.projectileName,
  ]);
}

export function isAncillaryVehicleWeapon(weapon) {
  return /(?:smoke|countermeasure|flare|blank)/.test(
    vehicleWeaponSignature(weapon),
  );
}

export function classifyVehicleWeaponKind(weapon) {
  const signature = vehicleWeaponSignature(weapon);

  if (
    /(?:^| )(?:rocket|rockets|ub 32|s 5|hydra|sneb)(?: |$)/.test(signature)
  ) {
    return "rocket";
  }
  if (
    /(?:^| )(?:atgm|guided missile|anti tank guided|tow|kornet|konkurs|refleks|lahat|malyutka|at 3|hj 8|hj 9|hj[89][a-z0-9]*|zt3|milan|javelin|spike|rbs 56|ingwe|bastion|metis|sagger)(?: |$)/.test(
      signature,
    )
  ) {
    return "missile";
  }
  if (
    /(?:^| )(?:grenade|mk 19|mk19|ags \d+|qlz \d+|l134a1)(?: |$)/.test(
      signature,
    )
  ) {
    return "grenade";
  }
  if (
    /(?:^| )(?:machine gun|machinegun|browning|m2a1|m2|m240[a-z0-9]*|mg 3|mg3|kord|nsv|nsvt|pkt|pkm|pkp|kpvt|qjy[a-z0-9]*|qjz[a-z0-9]*|qjc[a-z0-9]*|c6a1|c6|dshk|maxim|minigun|gpmg|l7a2|l37a2|l11a1|m85|gau 17|gau17|gau 19|gau19|gau 21|gau21|mag 58|mag58|m134|m60d|m1919|dp 28|dp28|m3p|hmg|lmg)(?: |$)/.test(
      signature,
    )
  ) {
    return "machine-gun";
  }
  return "cannon";
}

function stationSignature(seat, weapons) {
  return normalizedSignature([
    seat?.turretName,
    seat?.pawnName,
    ...weapons.flatMap((weapon) => [weapon?.displayName, weapon?.gunName]),
  ]);
}

function isRemoteWeaponStation(seat, weapons) {
  return /(?:rws|crows|rcws|remote|sancak|arbalet|enforcer|protector|sarp)/.test(
    stationSignature(seat, weapons),
  );
}

function roleForWeaponKinds(weaponKinds) {
  if (weaponKinds.length !== 1) return "gunner";
  if (weaponKinds[0] === "machine-gun") return "machine-gunner";
  if (weaponKinds[0] === "grenade") return "grenadier";
  if (weaponKinds[0] === "missile") return "missile-operator";
  if (weaponKinds[0] === "rocket") return "rocket-operator";
  return "gunner";
}

export function deriveSeatSemantics(seat, index, vehicle) {
  const turretName =
    typeof seat?.turretName === "string" && seat.turretName.length > 0
      ? seat.turretName
      : null;
  const directWeapons =
    turretName !== null && Array.isArray(vehicle?.weapons)
      ? vehicle.weapons.filter(
          (weapon) =>
            weapon?.turretName === turretName && !isAncillaryVehicleWeapon(weapon),
        )
      : [];
  const weaponKinds = [
    ...new Set(directWeapons.map(classifyVehicleWeaponKind)),
  ].sort((left, right) => left.localeCompare(right, "en"));

  if (index === 1) {
    return {
      role: "driver",
      stationKind:
        directWeapons.length === 0
          ? null
          : isRemoteWeaponStation(seat, directWeapons)
            ? "remote-weapon-station"
            : "weapon-station",
      directWeaponCount: directWeapons.length,
      weaponKinds,
    };
  }

  if (turretName === null) {
    return {
      role: "passenger",
      stationKind: null,
      directWeaponCount: 0,
      weaponKinds: [],
    };
  }

  if (directWeapons.length > 0) {
    return {
      role: roleForWeaponKinds(weaponKinds),
      stationKind: isRemoteWeaponStation(seat, directWeapons)
        ? "remote-weapon-station"
        : "weapon-station",
      directWeaponCount: directWeapons.length,
      weaponKinds,
    };
  }

  const signature = stationSignature(seat, []);
  if (/(?:commander|cmdr|periscope|scope)/.test(signature)) {
    return {
      role: "commander",
      stationKind: "observation-station",
      directWeaponCount: 0,
      weaponKinds: [],
    };
  }

  return {
    role: null,
    stationKind: null,
    directWeaponCount: 0,
    weaponKinds: [],
  };
}
