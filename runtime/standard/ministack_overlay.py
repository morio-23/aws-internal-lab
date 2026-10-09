# AWS Internal Lab Phase 0 overlay for MiniStack 1.5.22.
#
# MiniStack persists service state during lifespan shutdown. Suspend needs the
# same persistence step while the source Runtime remains alive so an EBS
# snapshot failure can roll back without destroying the learner's Lab.
#
# This module deliberately reuses MiniStack's own persistence functions instead
# of duplicating service-specific state logic. The endpoint is reachable only
# on the MiniStack container port; Runtime security groups never expose 4566.

import asyncio
import json
import os
from pathlib import Path
import time
import logging

import ministack.app as upstream


_UPSTREAM_APP = upstream.app
_PERSIST_PATH = "/_aws_internal_lab/persist"
_LOG = logging.getLogger(__name__)


async def _send_json(send, status: int, body: dict) -> None:
    payload = json.dumps(body).encode("utf-8")
    await send(
        {
            "type": "http.response.start",
            "status": status,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(payload)).encode("ascii")),
            ],
        }
    )
    await send({"type": "http.response.body", "body": payload})


async def app(scope, receive, send):
    if (
        scope.get("type") == "http"
        and scope.get("method") == "POST"
        and scope.get("path") == _PERSIST_PATH
    ):
        if not upstream.PERSIST_STATE:
            await _send_json(send, 409, {"error": "PERSIST_STATE_DISABLED"})
            return

        # Serialize against MiniStack's reset operation. Lab Gateway quiescing
        # prevents learner mutations before this endpoint is called.
        try:
            async with upstream._get_reset_lock():
                state_dir = Path(upstream.save_all.__globals__["STATE_DIR"])
                started_ns = time.time_ns()
                expected = set()
                collector_errors = []

                def checked_getter(name, getter):
                    try:
                        state = getter()
                    except Exception as exc:
                        collector_errors.append((name, exc))
                        raise
                    if state is not None:
                        expected.add(name)
                    return state

                collectors = {
                    name: (lambda name=name, getter=getter: checked_getter(name, getter))
                    for name, getter in upstream._build_persistence_save_dict().items()
                }
                await asyncio.to_thread(upstream.save_all, collectors)
                if collector_errors:
                    raise RuntimeError("persistence collector failed")
                for name in expected:
                    path = state_dir / f"{name}.json"
                    if not path.is_file() or path.stat().st_mtime_ns < started_ns:
                        raise RuntimeError(f"persistence write failed for {name}")
                # save_state closes/replaces every JSON file. sync additionally
                # pushes filesystem dirty pages before the EBS snapshot request.
                await asyncio.to_thread(os.sync)
        except Exception:
            _LOG.exception("MiniStack live persist failed")
            await _send_json(send, 500, {"error": "MINISTACK_PERSIST_FAILED"})
            return

        await _send_json(send, 200, {"persisted": True})
        return

    await _UPSTREAM_APP(scope, receive, send)


def main() -> None:
    # upstream.main() resolves its module-global 'app' when starting Hypercorn.
    upstream.app = app
    upstream.main()


if __name__ == "__main__":
    main()
