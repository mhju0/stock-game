"""Interactive API docs must not be served in production.

They enumerate every route including /admin/*, which lowers the cost of
reconnaissance. Gated on ENABLE_DEV_TOOLS, the same flag app/routes/admin.py
already uses to decide it is running in a developer environment.
"""

DOC_PATHS = ("/docs", "/redoc", "/openapi.json")


def test_doc_endpoints_absent_without_dev_tools(client):
    """conftest never sets ENABLE_DEV_TOOLS, so this is the production posture."""
    for path in DOC_PATHS:
        assert client.get(path).status_code == 404


def test_dev_tools_flag_enables_docs():
    from app.main import resolve_doc_urls

    dev = resolve_doc_urls({"ENABLE_DEV_TOOLS": "true"})
    assert dev == {
        "docs_url": "/docs",
        "redoc_url": "/redoc",
        "openapi_url": "/openapi.json",
    }


def test_docs_fail_closed_on_absent_or_unexpected_flag():
    from app.main import resolve_doc_urls

    for value in ("", "1", "yes", "false", "TRUE ", "on"):
        assert resolve_doc_urls({"ENABLE_DEV_TOOLS": value})["docs_url"] is None
    assert resolve_doc_urls({})["docs_url"] is None
