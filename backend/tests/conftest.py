import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from aegis_backend.api.main import app
from aegis_backend.api.state import engine_state
from aegis_backend.services.energy import EnergyState


@pytest_asyncio.fixture
async def client():
    engine_state.grid = None
    engine_state.dstar_initialized = False
    engine_state.active_path = []
    engine_state.energy = EnergyState()

    # ASGITransport talks to the app in-process without a real socket and,
    # unlike the sync TestClient, stays on the single event loop pytest-asyncio
    # already opened for this test -- TestClient spins up a fresh loop per
    # `with` block, which starves the module-level async DB engine (bound to
    # whichever loop touched it first) and asyncpg throws "another operation
    # in progress" on the second test. None of these tests hit the DB, so
    # lifespan (which would call init_models()) is intentionally not invoked.
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
