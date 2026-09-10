async def test_telemetry_before_any_tick_is_json_serializable(client):
    # Regression test: estimated_range_km used to return float('inf') here,
    # which Starlette's JSONResponse (allow_nan=False) refuses to serialize
    # and turns into a 500.
    resp = await client.get("/api/simulation/telemetry")
    assert resp.status_code == 200
    assert resp.json()["estimated_range_km"] is None


async def test_tick_then_telemetry_reports_finite_range(client):
    await client.post(
        "/api/simulation/tick", json={"distance_m": 5, "speed_mps": 1.5, "dt_s": 3, "ambient_hazard": 20}
    )
    resp = await client.get("/api/simulation/telemetry")
    assert resp.status_code == 200
    body = resp.json()
    assert body["estimated_range_km"] is not None
    assert body["estimated_range_km"] > 0
