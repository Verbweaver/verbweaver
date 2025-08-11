import os
import uvicorn


def main() -> None:
    port_str = os.environ.get("PORT", "8000")
    try:
        port = int(port_str)
    except ValueError:
        port = 8000

    # Import lazily so PyInstaller can resolve the module graph
    from app.main import app  # type: ignore

    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")


if __name__ == "__main__":
    main()


