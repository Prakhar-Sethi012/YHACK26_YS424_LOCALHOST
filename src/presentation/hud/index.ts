import { useMissionStore } from "@/state/store";

export function mountHud(container: HTMLElement) {
  container.innerHTML = `
    <div class="flex items-center gap-6 px-4 py-2 text-xs">
      <span>Fuel: <span id="hud-fuel" class="text-tactical-amber"></span> L</span>
      <span>Battery: <span id="hud-battery" class="text-tactical-green"></span> Wh</span>
      <span>SOS Log: <span id="hud-sos" class="text-tactical-red">0</span> survivor(s)</span>
    </div>
  `;

  const fuelEl = container.querySelector("#hud-fuel")!;
  const batteryEl = container.querySelector("#hud-battery")!;
  const sosEl = container.querySelector("#hud-sos")!;

  useMissionStore.subscribe((state) => {
    fuelEl.textContent = state.resources.fuelLiters.toFixed(1);
    batteryEl.textContent = state.resources.batteryWh.toFixed(1);
    sosEl.textContent = String(state.sosLog.length);
  });

  const initial = useMissionStore.getState();
  fuelEl.textContent = initial.resources.fuelLiters.toFixed(1);
  batteryEl.textContent = initial.resources.batteryWh.toFixed(1);
}
