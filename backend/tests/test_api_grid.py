async def test_health(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


async def test_grid_init_then_costmap(client):
    resp = await client.post("/api/grid/init", json={"width": 10, "height": 10, "obstacles": [[5, 5]]})
    assert resp.status_code == 200
    body = resp.json()
    assert body["width"] == 10
    assert body["obstacle_count"] == 1

    resp = await client.get("/api/grid/costmap")
    assert resp.status_code == 200
    costmap = resp.json()
    assert costmap["width"] == 10
    assert costmap["costs"][5][5] == -1.0  # obstacle cell is reported as impassable


async def test_costmap_without_init_returns_400(client):
    resp = await client.get("/api/grid/costmap")
    assert resp.status_code == 400


async def test_plan_baseline_returns_a_path(client):
    await client.post("/api/grid/init", json={"width": 15, "height": 15})
    resp = await client.post("/api/plan/baseline", json={"start": [0, 0], "goal": [14, 14]})
    assert resp.status_code == 200
    body = resp.json()
    assert body["found"] is True
    assert body["path"][0] == [0, 0]
    assert body["path"][-1] == [14, 14]


async def test_mutate_triggers_incremental_replan(client):
    await client.post("/api/grid/init", json={"width": 15, "height": 15})
    await client.post("/api/plan/baseline", json={"start": [0, 7], "goal": [14, 7]})

    changed_cells = [[7, y] for y in range(0, 12)]
    resp = await client.post(
        "/api/grid/mutate", json={"changed_cells": changed_cells, "blocked": [True] * len(changed_cells)}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["found"] is True
    assert body["replan_latency_ms"] < 25.0
    assert all(not (x == 7 and y < 12) for x, y in body["path"])


async def test_hazard_circle_raises_costmap_values(client):
    await client.post("/api/grid/init", json={"width": 10, "height": 10})
    before = (await client.get("/api/grid/costmap")).json()["costs"][5][5]

    await client.post(
        "/api/grid/hazards",
        json={"circles": [{"center": [5, 5], "radius": 2, "thermal_hazard": 90, "structural_risk": 0.5}]},
    )
    after = (await client.get("/api/grid/costmap")).json()["costs"][5][5]

    assert after > before
