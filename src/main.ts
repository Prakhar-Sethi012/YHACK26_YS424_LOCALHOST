import "./style.css";
import { useMissionStore } from "@/state/store";
import { mountViewportA } from "@/presentation/viewportA";
import { mountViewportB } from "@/presentation/viewportB";
import { mountHud } from "@/presentation/hud";

const app = document.getElementById("app")!;

app.innerHTML = `
  <div class="flex h-screen w-screen flex-col font-mono">
    <header class="flex items-center justify-between border-b border-tactical-border bg-tactical-panel px-4 py-2 text-sm">
      <span class="font-bold tracking-wide text-tactical-cyan">AEGIS-NAV</span>
      <span class="text-slate-400">AUTONOMOUS RESCUE COMMAND &amp; CONTROL</span>
      <span id="mission-status" class="text-tactical-green">STATUS: MISSION ACTIVE</span>
    </header>
    <div class="flex flex-1 overflow-hidden">
      <div id="viewport-a" class="relative h-full w-[65%] border-r border-tactical-border"></div>
      <div id="viewport-b" class="relative h-full w-[35%]"></div>
    </div>
    <div id="hud" class="border-t border-tactical-border bg-tactical-panel"></div>
  </div>
`;

mountViewportA(document.getElementById("viewport-a")!);
mountViewportB(document.getElementById("viewport-b")!);
mountHud(document.getElementById("hud")!);

useMissionStore.getState().startMission();
