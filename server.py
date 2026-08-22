"""Serve the game and compute exact CSS distances with ILPQEC/HiGHS."""

from __future__ import annotations

import json
from functools import lru_cache
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import numpy as np
from ilpqec import CSSCode


ROOT = Path(__file__).resolve().parent
MAX_BODY_BYTES = 8 * 1024 * 1024


def _binary_matrix(value: object, name: str) -> np.ndarray:
    matrix = np.asarray(value)
    if matrix.ndim != 2:
        raise ValueError(f"{name} must be a two-dimensional matrix")
    if matrix.shape[1] > 1000 or matrix.shape[0] > 1000:
        raise ValueError(f"{name} is too large")
    if np.any((matrix != 0) & (matrix != 1)):
        raise ValueError(f"{name} must be binary")
    return matrix.astype(np.uint8)


@lru_cache(maxsize=128)
def _distance_cached(hx_json: str, hz_json: str) -> dict[str, object]:
    hx = _binary_matrix(json.loads(hx_json), "hx")
    hz = _binary_matrix(json.loads(hz_json), "hz")
    code = CSSCode.from_parity_check_matrices(hx, hz)
    if code.k == 0:
        return {"d": "inf", "dx": "inf", "dz": "inf"}

    result = code.distance(solver="highs", threads=1)
    return {"d": result.d, "dx": result.dx, "dz": result.dz}


class GameHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_POST(self) -> None:
        if self.path != "/api/distance":
            self.send_error(404)
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_BODY_BYTES:
                raise ValueError("Invalid request size")
            payload = json.loads(self.rfile.read(length))
            hx_json = json.dumps(payload["hx"], separators=(",", ":"))
            hz_json = json.dumps(payload["hz"], separators=(",", ":"))
            result = _distance_cached(hx_json, hz_json)
            self._send_json(200, result)
        except (KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
            self._send_json(400, {"error": str(error)})
        except Exception as error:
            self._send_json(422, {"error": str(error)})

    def _send_json(self, status: int, payload: dict[str, object]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    print("Serving surgery game with ILP distance API at http://localhost:8765")
    ThreadingHTTPServer(("localhost", 8765), GameHandler).serve_forever()
