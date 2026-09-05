"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties } from "react";
import type { RuntimeStationEquipmentResolver } from "./runtime-wiki-attack-source.ts";
import type { RuntimeVehicleWeaponOperationStore } from "../lib/runtime-vehicle-weapon-operation-store.ts";
import { createVehicleWeaponOperation, presentVehicleWeaponOperation, vehicleWeaponMagazineRounds } from "../lib/vehicle-weapon-operation-state.ts";
import { sourceMagazineDepletedTexture, sourceMagazineColor, sourceHudCssColor, sourceWeaponFireModeLabel, type VehicleFiringPresentation } from "../lib/vehicle-firing-presentation.ts";
import { wikiUrl } from "../lib/wiki-source.ts";

export function VehicleWeaponHud({
  document, store, equipmentRefs, activeEquipmentRef, equipmentResolver, onSelect, infiniteAmmoEnabled = false,
}: {
  document: VehicleFiringPresentation;
  store: RuntimeVehicleWeaponOperationStore;
  equipmentRefs: readonly string[];
  activeEquipmentRef: string;
  equipmentResolver: RuntimeStationEquipmentResolver;
  onSelect: (id: string) => void;
  infiniteAmmoEnabled?: boolean;
}) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const binding = equipmentResolver(activeEquipmentRef);
  const spec = binding?.operation;
  const source = document.weapons[binding?.firingPresentation?.weaponClassPath ?? ""];
  const state = useMemo(() => spec
    ? snapshot.states.get(activeEquipmentRef) ?? createVehicleWeaponOperation(spec, 0, infiniteAmmoEnabled) : null,
  [snapshot, activeEquipmentRef, spec, infiniteAmmoEnabled]);
  const [now, setNow] = useState(0);
  const [inventoryShown, showInventory] = useState(true);
  const [pinned, pinInventory] = useState(false);
  const endsAt = state?.reloadEndsAtMs ?? 0;
  useEffect(() => {
    setNow(performance.now());
    if (performance.now() >= endsAt) return;
    const timer = window.setInterval(() => {
      const time = performance.now();
      setNow(time);
      if (time >= endsAt) window.clearInterval(timer);
    }, 50);
    return () => window.clearInterval(timer);
  }, [state, endsAt]);
  useEffect(() => {
    showInventory(true);
    const timer = window.setTimeout(() => showInventory(false), document.hud.inventory.fadeDelaySeconds * 1000);
    return () => window.clearTimeout(timer);
  }, [activeEquipmentRef, document]);
  if (!state || !spec || !source || !binding) return null;
  const presentation = presentVehicleWeaponOperation(state, spec, now);
  const status = presentation.weaponReloading ? "reloading" : presentation.roundsRemaining <= 0 ? "empty" : "ready";
  const icons = document.iconSets[source.magazineIconSet];
  const textureUrl = (ref: string | null | undefined) => ref && document.textures[ref] ? wikiUrl(document.textures[ref].pathname) : undefined;
  const magazineRounds = vehicleWeaponMagazineRounds(state, spec, now);
  const remaining = presentation.magazinesRemaining + (presentation.roundsRemaining > 0 ? 1 : 0);
  const iconCount = Math.min(24, Math.max(1, spec.numberOfMags));
  const statusLabel = infiniteAmmoEnabled ? "无限弹药 · 无需装填" : presentation.weaponReloading ? "装填中" : status === "empty" ? "弹药耗尽" : "已装填";
  const layout = document.hud.layout;
  const sourceUnit = (pixels: number) => `calc(${pixels} * 100cqh / 1080)`;
  const nativeStyles = {
    "--source-item-width": sourceUnit(layout.selectedItem.X), "--source-item-height": sourceUnit(layout.selectedItem.Y),
    "--source-category-size": sourceUnit(layout.categoryIcon.X), "--source-magazine-size": sourceUnit(layout.magazineIcon.X),
    "--source-weapon-font": sourceUnit(layout.fonts.weaponName), "--source-inventory-font": sourceUnit(layout.fonts.inventoryName),
    "--source-details-font": sourceUnit(layout.fonts.fireMode),
    "--source-unselected-alpha": document.hud.inventory.unselectedAlpha,
  } as CSSProperties;

  return (
    <aside className="crew-view-weapon-status source-weapon-hud" data-state={status}
      style={nativeStyles}
      data-infinite-ammo={infiniteAmmoEnabled}
      data-rounds-remaining={presentation.roundsRemaining}
      data-magazine-capacity={presentation.magazineCapacity}
      data-reserve-magazines={presentation.magazinesRemaining}
      aria-label={`${binding.equipment.displayName}：${statusLabel}`}>
      <div className="source-weapon-hud__frame">
      <div className="source-weapon-hud__inventory" data-visible={pinned || inventoryShown}
        style={{ transitionDuration: `${document.hud.inventory.fadeDurationSeconds}s` }}
        onPointerDown={(e) => e.stopPropagation()} role="group" aria-label="游戏内武器栏">
        {equipmentRefs.map((id) => {
          const item = equipmentResolver(id);
          const slots = item?.firingPresentation?.inventorySlotNumbers;
          const data = document.weapons[item?.firingPresentation?.weaponClassPath ?? ""];
          if (!item || !data || !slots) return null;
          const selected = id === activeEquipmentRef;
          const itemState = snapshot.states.get(id) ?? createVehicleWeaponOperation(item.operation, 0, infiniteAmmoEnabled);
          const itemAmmo = presentVehicleWeaponOperation(itemState, item.operation, now);
          const count = data.showMagCount ? itemAmmo.magazinesRemaining + (itemAmmo.roundsRemaining > 0 ? 1 : 0)
            : data.showItemCount ? itemAmmo.roundsRemaining : null;
          return <button type="button" key={id} data-selected={selected} data-inventory-slot={slots[0]}
            aria-pressed={selected} aria-label={`${slots.join("/")}：${item.equipment.displayName}`}
            onClick={(e) => { onSelect(id); e.currentTarget.blur(); }}>
            <span className="source-weapon-hud__item-name">{selected ? item.equipment.displayName : ""}</span>
            <span className="source-weapon-hud__item-picture">
              {/* Source HUD textures are already small webp images; do not re-encode through Next/Image. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {textureUrl(selected ? data.selectionIcon : data.categoryIcon) ? <img
                src={textureUrl(selected ? data.selectionIcon : data.categoryIcon)} alt="" draggable={false} /> : null}
              <kbd>{slots.join("/")}</kbd>
              {selected && (infiniteAmmoEnabled || count !== null) ? <small>{infiniteAmmoEnabled ? "∞" : count}</small> : null}
            </span>
          </button>;
        })}
      </div>
      <div className="source-weapon-hud__ammo">
        <button type="button" className="source-weapon-hud__weapon-name"
          aria-label="展开或收起武器栏" aria-expanded={pinned || inventoryShown}
          onClick={(e) => {
            if (pinned || inventoryShown) { pinInventory(false); showInventory(false); }
            else pinInventory(true);
            e.currentTarget.blur();
          }}>
          {binding.equipment.displayName}
        </button>
        <div className="source-weapon-hud__details">
          {(infiniteAmmoEnabled || source.showAmmoDataInHud || document.hud.showAmmoInMag) ? <span className="source-weapon-hud__round-count" aria-label={infiniteAmmoEnabled ? "无限弹药，无需装填" : undefined}>{infiniteAmmoEnabled ? "∞" : `${presentation.roundsRemaining}/${presentation.magazineCapacity}`}</span> : null}
          {spec.allowRoundInChamber && presentation.roundsRemaining > 0 ? <span
            className="source-weapon-hud__chamber" aria-label="膛内有弹"
            style={{
              width: sourceUnit(layout.chamberedRound.size.X), height: sourceUnit(layout.chamberedRound.size.Y),
              marginRight: sourceUnit(layout.chamberedRound.paddingRight),
              transform: `rotate(${layout.chamberedRound.angle}deg)`,
              maskImage: `url("${textureUrl(layout.chamberedRound.texture)}")`,
              WebkitMaskImage: `url("${textureUrl(layout.chamberedRound.texture)}")`,
            }} /> : null}
          <span>{sourceWeaponFireModeLabel(document, spec)}</span>
        </div>
        {icons && !infiniteAmmoEnabled ? <div className="source-weapon-hud__magazines" aria-label={`剩余 ${remaining} 个弹匣或弹药单元`}>
          {Array.from({ length: iconCount }, (_, index) => {
            const fullness = Math.min(1, (magazineRounds[index] ?? 0) / presentation.magazineCapacity);
            const foreground = textureUrl(sourceMagazineDepletedTexture(icons, fullness));
            const mask = (url: string | undefined) => ({ maskImage: `url("${url}")`, WebkitMaskImage: `url("${url}")` });
            return <span className="source-weapon-hud__magazine" key={index} data-fullness={fullness.toFixed(3)}
              title={`${Math.round(fullness * 100)}%`}>
              {icons.depleted.length ? <i style={{ ...mask(textureUrl(icons.base)), backgroundColor: sourceHudCssColor(document.hud.magazineColors.Refillable) }} /> : null}
              <i style={{ ...mask(foreground), backgroundColor: sourceHudCssColor(sourceMagazineColor(document, fullness)) }} />
            </span>;
          })}
        </div> : null}
        <span className="source-weapon-hud__accessible-state">{statusLabel}</span>
      </div>
      </div>
    </aside>
  );
}
