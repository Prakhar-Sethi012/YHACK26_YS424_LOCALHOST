"""
AEGIS-NAV Backend 1: Stateless Simulation & Algorithmic Compute Engine
FastAPI + WebSocket Server streaming at 20 Hz.
"""

import asyncio
import json
import logging
from typing import Dict, Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from simulation.rover_sim import RoverSimulationSession
import numpy as np

def to_serializable(obj):
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        return float(obj)
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("AEGIS-NAV-BACKEND")

app = FastAPI(
    title="AEGIS-NAV Simulation Engine",
    description="Stateless high-performance pathfinding & kinematic simulation service",
    version="1.0.0"
)

# Enable CORS for local frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    """Health check for deployment and orchestrators."""
    return {"status": "online", "service": "AEGIS-NAV-Backend-1", "frequency_hz": 20}


@app.websocket("/ws/sim")
async def websocket_simulation_endpoint(websocket: WebSocket):
    """
    Primary 20 Hz bidirectional telemetry & command stream.
    Stateless: Each active WebSocket manages its own in-memory simulation world.
    """
    await websocket.accept()
    logger.info("Client connected to /ws/sim. Initializing fresh in-memory simulation session...")

    # Instantiate isolated stateless simulation world for this connection
    session = RoverSimulationSession(width=100, height=100)

    # Send initial environment map, elevation grid, and static obstacles
    await websocket.send_text(json.dumps({
        "type": "initial_state",
        "data": session.get_initial_map()
    }, default=to_serializable))

    # Queue to ingest client mutation events asynchronously
    incoming_commands: asyncio.Queue[Dict[str, Any]] = asyncio.Queue()

    async def client_listener():
        """Listens for map mutations (e.g. drop obstacle, add heat zone) from frontend."""
        try:
            while True:
                data_text = await websocket.receive_text()
                try:
                    payload = json.loads(data_text)
                    await incoming_commands.put(payload)
                except json.JSONDecodeError:
                    logger.warning("Received invalid JSON payload from client")
        except WebSocketDisconnect:
            pass
        except Exception as e:
            logger.error(f"Error in client listener: {e}")

    # Launch incoming listener in background
    listener_task = asyncio.create_task(client_listener())

    tick_interval = 0.05  # 20 Hz = 50 ms per tick

    try:
        while True:
            t_start = asyncio.get_event_loop().time()

            # 1. Process all pending client mutation commands
            while not incoming_commands.empty():
                cmd = incoming_commands.get_nowait()
                logger.info(f"Processing client mutation: {cmd.get('type')}")
                mutation_result = session.handle_mutation(cmd)
                # Send mutation acknowledgement and benchmark results immediately
                await websocket.send_text(json.dumps({
                    "type": "mutation_ack",
                    "data": mutation_result
                }, default=to_serializable))

            # 2. Advance physics, kinematics, and power draw by dt
            telemetry_frame = session.step(dt=tick_interval)

            # 3. Stream 20 Hz telemetry frame to client
            await websocket.send_text(json.dumps({
                "type": "telemetry",
                "timestamp": asyncio.get_event_loop().time(),
                "data": telemetry_frame
            }, default=to_serializable))

            # 4. Precise frequency regulation to 20 Hz
            elapsed = asyncio.get_event_loop().time() - t_start
            sleep_duration = max(0.001, tick_interval - elapsed)
            await asyncio.sleep(sleep_duration)

    except WebSocketDisconnect:
        logger.info("Client disconnected from /ws/sim.")
    except Exception as e:
        logger.error(f"Simulation loop encountered error: {e}")
    finally:
        listener_task.cancel()
        logger.info("Cleaned up simulation session.")


if __name__ == "__main__":
    import uvicorn
    # Launch with uvicorn on port 8000
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
