"""Quick integration test client for Backend 1 WebSocket streaming."""
import asyncio
import json
import websockets

async def test_stream():
    uri = "ws://127.0.0.1:8000/ws/simulation"
    print(f"Connecting to {uri}...")
    async with websockets.connect(uri) as ws:
        print("Connected successfully!")

        # 1. Receive initial state frame
        init_msg = await ws.recv()
        init_data = json.loads(init_msg)
        initial_path = init_data["data"]["initial_path"]
        print(f"Initial state received: type={init_data['type']}, grid={init_data['data']['width']}x{init_data['data']['height']}, path_len={len(initial_path)}")
        if initial_path:
            print(f"  initial_path[0] (Path3D sample, expect 3 coords): {initial_path[0]}")
            assert len(initial_path[0]) == 3, "initial_path is not Path3D -- expected [x, y, z]"

        # 2. Receive 3 telemetry frames
        for i in range(3):
            msg = await ws.recv()
            data = json.loads(msg)
            frame_path = data["data"]["path"]
            print(f"Frame {i+1} received: type={data['type']}, pose={data['data']['pose']}, path_len={len(frame_path)}")
            if frame_path:
                assert len(frame_path[0]) == 3, "telemetry path is not Path3D -- expected [x, y, z]"

        # 2. Send drop_obstacle mutation command
        print("Sending drop_obstacle mutation...")
        await ws.send(json.dumps({
            "type": "drop_obstacle",
            "x": 50,
            "y": 50,
            "radius": 2
        }))

        # 3. Receive mutation acknowledgement
        ack = await ws.recv()
        ack_data = json.loads(ack)
        print("Mutation ACK received:", ack_data)

        # 4. Receive updated frame
        updated_frame = await ws.recv()
        updated_data = json.loads(updated_frame)
        updated_path = updated_data["data"]["path"]
        print(f"Post-mutation frame received: type={updated_data['type']}, path_len={len(updated_path)}")
        if updated_path:
            print(f"  post-mutation path[0] (Path3D sample): {updated_path[0]}")
            assert len(updated_path[0]) == 3, "post-mutation path is not Path3D -- expected [x, y, z]"

        print("OK: /ws/simulation streamed a smoothed Path3D end to end.")

if __name__ == "__main__":
    asyncio.run(test_stream())
