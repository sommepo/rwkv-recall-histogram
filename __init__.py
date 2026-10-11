"""RWKV recall histogram below the deck list.

The RWKV scheduler owns the prediction. This add-on asks the fork for the same
per-percent RWKV retrievability series the Stats screen uses and draws it under
the deck list: x is RWKV R now, y is the number of cards at that R, and the
vertical line is the desired retention.

The reviewer's bottom bar shows the same bars as a small text-free chart.
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from types import SimpleNamespace
from typing import Any

from aqt import gui_hooks, mw
from aqt.qt import QTimer
from aqt.reviewer import ReviewerBottomBar

_DIR = Path(__file__).parent
_ADDON = __name__

DEFAULTS: dict[str, Any] = {
    "desired_retention": 0.80,
    "search": "-is:suspended",
    "min_percent": 50,
    "near_target_points": 3,
    "refresh_seconds": 20,
    "show_in_reviewer": True,
}
PENDING_RETRY_MS = 3000
MAX_PENDING_RETRIES = 40

# Last histogram, kept so the deck list never has to wait for the scheduler.
_buckets: dict[int, int] | None = None
_computed_at = 0.0
_in_flight = False
_stale = False
_pending_retries = 0


def _config() -> dict[str, Any]:
    """Read optional user settings without preventing Anki from starting."""
    try:
        loaded = mw.addonManager.getConfig(_ADDON)
    except Exception:
        loaded = None
    config = dict(DEFAULTS)
    if isinstance(loaded, dict):
        config.update(loaded)
    return config


def _number(config: dict[str, Any], key: str) -> float:
    try:
        return float(config[key])
    except (TypeError, ValueError):
        return float(DEFAULTS[key])


def _settings() -> dict[str, Any]:
    config = _config()
    target = _number(config, "desired_retention")
    if target > 1:  # accept 80 as well as 0.80
        target /= 100
    return {
        "target": min(100.0, max(0.0, target * 100)),
        "min": int(min(99, max(0, _number(config, "min_percent")))),
        "near": max(0.0, _number(config, "near_target_points")),
    }


def _search() -> str:
    value = _config().get("search")
    return value if isinstance(value, str) else DEFAULTS["search"]


def _rwkv_buckets(search: str) -> dict[int, int] | None:
    """Cards per whole percent of RWKV R; None while the scheduler is not ready.

    Not ready covers warm-up, a busy backend and a state cache that is still
    loading, all of which clear up on their own.
    """
    from aqt import rwkv_scheduler

    reviewer = getattr(mw, "reviewer", None) or SimpleNamespace(mw=mw)
    status = rwkv_scheduler.prepare_stats_retrievability_scores(
        reviewer, search, wait_for_warmup=False
    )
    if status != rwkv_scheduler.RwkvStatsPreparationStatus.READY:
        return None
    graphs = mw.col._backend.graphs(search=search, days=0)
    return {
        int(percent): int(count)
        for percent, count in graphs.retrievability.rwkv.retrievability.items()
    }


def _payload() -> str:
    data = dict(_settings())
    data["buckets"] = _buckets
    return json.dumps(data)


def _in_reviewer() -> bool:
    return mw.state == "review" and bool(_config().get("show_in_reviewer", True))


def _push(error: str | None = None) -> None:
    if mw.state == "deckBrowser":
        args = _payload() + ("" if error is None else ", " + json.dumps(error))
        mw.deckBrowser.web.eval(f"window.__rwkvRecallSet && __rwkvRecallSet({args});")
    elif _in_reviewer():  # no text there, so an error just leaves it empty
        mw.reviewer.bottom.web.eval(
            f"window.__rwkvRecallMini && __rwkvRecallMini({_payload()});"
        )


def _retry_pending() -> None:
    if mw.col is not None and (mw.state == "deckBrowser" or _in_reviewer()):
        _refresh(force=True)


def _refresh(force: bool = False) -> None:
    """Recount off the main thread; the deck list is updated in place after."""
    global _in_flight, _stale
    if mw.col is None:
        return
    if _in_flight:
        # a forced recount that lands mid-count runs once that count is in
        _stale = _stale or force
        return
    max_age = max(0.0, _number(_config(), "refresh_seconds"))
    if not force and _buckets is not None and time.monotonic() - _computed_at < max_age:
        return
    _in_flight = True
    search = _search()

    def done(future) -> None:
        global _buckets, _computed_at, _in_flight, _pending_retries, _stale
        _in_flight = False
        if _stale:
            _stale = False
            QTimer.singleShot(0, _retry_pending)
        try:
            buckets = future.result()
        except Exception as error:  # never break the deck list
            print(f"RWKV Recall Histogram: {error}")
            if _buckets is None:
                _push("RWKV recall is unavailable")
            return
        if buckets is None:
            if _pending_retries < MAX_PENDING_RETRIES:
                _pending_retries += 1
                QTimer.singleShot(PENDING_RETRY_MS, _retry_pending)
            elif _buckets is None:
                _push("RWKV recall is unavailable")
            return
        _pending_retries = 0
        _buckets = buckets
        _computed_at = time.monotonic()
        _push()

    mw.taskman.run_in_background(lambda: _rwkv_buckets(search), done)


def _asset(name: str) -> str:
    return (_DIR / name).read_text(encoding="utf-8")


def _on_deck_browser(_deck_browser, content) -> None:
    try:
        content.stats += (
            f"<style>{_asset('chart.css')}</style>"
            '<div id="rwkv-recall"></div>'
            f"<script>{_asset('chart.js')}\n__rwkvRecallSet({_payload()});</script>"
        )
        _refresh()
    except Exception as error:  # never break the deck list
        print(f"RWKV Recall Histogram: {error}")


def _on_content(web_content, context) -> None:
    try:
        if isinstance(context, ReviewerBottomBar) and _config().get("show_in_reviewer", True):
            web_content.head += (
                f"<style>{_asset('chart.css')}</style>"
                f"<script>{_asset('chart.js')}\n{_asset('reviewer.js')}\n"
                f"__rwkvRecallMini({_payload()});</script>"
            )
    except Exception as error:  # never break the reviewer
        print(f"RWKV Recall Histogram: {error}")


def _on_question(*_args) -> None:
    try:
        if _in_reviewer():  # every card, like the fork's own RWKV numbers
            _refresh(force=True)
    except Exception as error:  # never break reviewing
        print(f"RWKV Recall Histogram: {error}")


def _on_profile_close() -> None:
    global _buckets, _computed_at, _pending_retries
    _buckets = None
    _computed_at = 0.0
    _pending_retries = 0


gui_hooks.deck_browser_will_render_content.append(_on_deck_browser)
gui_hooks.webview_will_set_content.append(_on_content)
gui_hooks.reviewer_did_show_question.append(_on_question)
gui_hooks.profile_will_close.append(_on_profile_close)
