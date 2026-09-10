"""Quick integration test client for Backend 1 WebSocket streaming."""
import asyncio
import json
import websockets

async def test_stream():
    uri = "ws://127.0.0.1:8000/ws/sim"
    print(f"Connecting to {uri}...")
    async with websockets.connect(uri) as ws:
        print("Connected successfully!")
        
        # 1. Receive initial state frame
        init_msg = await ws.recv()
        init_data = json.loads(init_msg)
        print(f"Initial state received: type={init_data['type']}, grid={init_data['data']['width']}x{init_data['data']['height']}, path_len={len(init_data['data']['initial_path'])}")

        # 2. Receive 3 telemetry frames
        for i in range(3):
            msg = await ws.recv()
            data = json.loads(msg)
            print(f"Frame {i+1} received: type={data['type']}, pose={data['data']['pose']}")

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
        print("Post-mutation frame received:", json.loads(updated_frame)["type"])

if __name__ == "__main__":
    asyncio.run(test_stream())
