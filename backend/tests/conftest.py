import pytest
from fastapi.testclient import TestClient

from app import main
from app.content import load_content


@pytest.fixture(scope="session")
def content():
    return load_content()


@pytest.fixture()
def client():
    """A test client with no saved state. Requests without a session header share one session."""
    main.sessions.clear()
    yield TestClient(main.app)
    main.sessions.clear()
