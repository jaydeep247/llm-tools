"""
EventPublisher — thread-isolated RabbitMQ publisher.

Problem being solved
--------------------
Scrapy uses an asyncio/Twisted reactor that owns the main thread for the
entire duration of a crawl.  pika's BlockingConnection does raw socket I/O
in the calling thread, which means:
  1. Its heartbeat frames are never sent while Scrapy keeps the reactor busy.
  2. RabbitMQ closes the stale connection after the heartbeat timeout (~60 s).
  3. The next basic_publish() raises ConnectionResetError.

Solution
--------
All pika I/O is confined to a single dedicated daemon thread (_publisher_loop).
emit_event() is non-blocking: it puts a (routing_key, body) tuple into a
bounded in-process queue and returns immediately.  The background thread drains
that queue, calls connection.process_data_events() regularly so heartbeats are
honoured, and reconnects transparently on any error.

The queue is bounded (QUEUE_MAX = 2 000) so a broker outage never causes OOM.
close() signals the thread to drain remaining messages before stopping.
"""

import json
import os
import queue
import threading
import time

import pika

from utils.config import config
from utils.logger import logger


class EventPublisher:
    # Capacity of the in-process message buffer.
    _QUEUE_MAX = 2_000
    # Max seconds close() waits for the queue to drain before giving up.
    _DRAIN_TIMEOUT = 20
    # How many messages to publish per heartbeat-tick before yielding back
    # to process_data_events (prevents heartbeat starvation on bursts).
    _BATCH_PER_TICK = 50

    def __init__(self):
        self.url = config.RABBITMQ_URL
        self.exchange = "job.events"
        self._msg_queue: queue.Queue = queue.Queue(maxsize=self._QUEUE_MAX)
        self._thread: threading.Thread | None = None
        self._stop_evt = threading.Event()
        self._lock = threading.Lock()
        self._owner_pid: int | None = None

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _ensure_thread_running(self) -> None:
        """Start (or restart after fork) the background publisher thread."""
        current_pid = os.getpid()
        with self._lock:
            if self._owner_pid != current_pid:
                # We have been forked — the parent's thread is gone; reset.
                self._stop_evt.set()
                self._thread = None
                self._stop_evt = threading.Event()
                self._owner_pid = current_pid

            if self._thread is None or not self._thread.is_alive():
                self._thread = threading.Thread(
                    target=self._publisher_loop,
                    daemon=True,
                    name="pika-publisher",
                )
                self._thread.start()

    def _make_connection(self):
        """Open a fresh pika BlockingConnection and declare the exchange."""
        params = pika.URLParameters(self.url)
        # 10-minute heartbeat — the thread calls process_data_events every
        # ~0.5 s so RabbitMQ always gets a heartbeat well within this window.
        params.heartbeat = 600
        params.socket_timeout = 15
        params.blocked_connection_timeout = 300
        conn = pika.BlockingConnection(params)
        ch = conn.channel()
        ch.exchange_declare(
            exchange=self.exchange, exchange_type="topic", durable=True
        )
        return conn, ch

    def _publisher_loop(self) -> None:
        """
        Background thread: owns the pika connection exclusively.
        Continuously drains the message queue and processes heartbeats.
        Reconnects automatically on any error.
        """
        conn = None
        ch = None
        _props = pika.BasicProperties(
            delivery_mode=2, content_type="application/json"
        )

        while not self._stop_evt.is_set():
            # ── ensure we have a live connection ───────────────────────────
            if conn is None or conn.is_closed:
                try:
                    conn, ch = self._make_connection()
                    logger.debug("📡 EventPublisher thread: connected to RabbitMQ")
                except Exception as exc:
                    logger.error(f"❌ EventPublisher: RabbitMQ connect failed: {exc}")
                    # Back-off before retrying so we don't spin on a dead broker.
                    self._stop_evt.wait(timeout=5)
                    conn = None
                    continue

            # ── process inbound frames (heartbeats, flow-control, etc.) ────
            try:
                conn.process_data_events(time_limit=0.5)
            except Exception as exc:
                logger.warning(f"⚠️  EventPublisher: process_data_events error: {exc}")
                conn = None
                continue

            # ── publish up to _BATCH_PER_TICK messages ─────────────────────
            published = 0
            while published < self._BATCH_PER_TICK:
                try:
                    routing_key, body = self._msg_queue.get_nowait()
                except queue.Empty:
                    break

                try:
                    ch.basic_publish(
                        exchange=self.exchange,
                        routing_key=routing_key,
                        body=body,
                        properties=_props,
                    )
                    self._msg_queue.task_done()
                    published += 1
                except Exception as exc:
                    logger.warning(
                        f"⚠️  EventPublisher: publish error ({routing_key}): {exc}"
                    )
                    # Re-enqueue once so critical events aren't silently lost.
                    try:
                        self._msg_queue.put_nowait((routing_key, body))
                    except queue.Full:
                        pass  # Queue full — drop rather than OOM on a dead broker.
                    # Force reconnect on next iteration.
                    try:
                        conn.close()
                    except Exception:
                        pass
                    conn = None
                    ch = None
                    break

        # ── graceful drain after stop_evt is set ──────────────────────────
        if conn and not conn.is_closed:
            deadline = time.monotonic() + self._DRAIN_TIMEOUT
            while not self._msg_queue.empty() and time.monotonic() < deadline:
                try:
                    routing_key, body = self._msg_queue.get_nowait()
                    conn.process_data_events(time_limit=0)
                    ch.basic_publish(
                        exchange=self.exchange,
                        routing_key=routing_key,
                        body=body,
                        properties=pika.BasicProperties(
                            delivery_mode=2, content_type="application/json"
                        ),
                    )
                    self._msg_queue.task_done()
                except Exception:
                    break
            try:
                conn.close()
                logger.debug("📤 EventPublisher thread: connection closed cleanly")
            except Exception:
                pass

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def connect(self) -> None:
        """Legacy compatibility shim — starts the background thread."""
        self._ensure_thread_running()

    def close(self) -> None:
        """
        Signal the background thread to drain the queue and exit cleanly.
        Blocks up to _DRAIN_TIMEOUT seconds to ensure in-flight events
        (e.g. JOB_COMPLETED) are delivered before the process exits.
        """
        self._stop_evt.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=self._DRAIN_TIMEOUT + 2)
        with self._lock:
            self._thread = None
            self._owner_pid = None

    def emit_event(self, job_id: str, event_type: str, payload: dict, retries: int = 3) -> bool:
        """
        Non-blocking enqueue of a job event.

        Returns True if the message was accepted, False if the internal
        queue was full (broker outage).  The `retries` parameter is kept
        for backwards-compatibility; reconnect/retry is handled
        transparently by the background thread.

        Routing key: job.{job_id}.{event_type}
        """
        self._ensure_thread_running()

        if isinstance(payload, dict) and "job_id" not in payload:
            payload["job_id"] = job_id

        routing_key = f"job.{job_id}.{event_type}"
        message = {
            "jobId": job_id,
            "eventType": event_type,
            "payload": payload,
            "timestamp": int(time.time() * 1000),
        }
        body = json.dumps(message)

        try:
            self._msg_queue.put_nowait((routing_key, body))
            return True
        except queue.Full:
            logger.warning(
                f"⚠️  Publisher queue full, dropping event {routing_key}"
            )
            return False


# Process-level singleton.  Each spawned subprocess gets its own instance.
publisher = EventPublisher()
