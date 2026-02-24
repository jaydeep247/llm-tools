import json
import time
import os
import pika
from utils.config import config
from utils.logger import logger

class EventPublisher:
    def __init__(self):
        self.url = config.RABBITMQ_URL
        self.exchange = 'job.events'
        self.connection = None
        self.channel = None
        # Track which process created the connection to avoid fork issues
        self._owner_pid = None

    def connect(self):
        current_pid = os.getpid()
        
        # If we forked, reset connections (they're not valid in child)
        if self._owner_pid is not None and self._owner_pid != current_pid:
            self.connection = None
            self.channel = None
        
        if self.connection and not self.connection.is_closed:
            return

        try:
            params = pika.URLParameters(self.url)
            self.connection = pika.BlockingConnection(params)
            self.channel = self.connection.channel()
            self.channel.exchange_declare(exchange=self.exchange, exchange_type='topic', durable=True)
            self._owner_pid = current_pid  # Track which process owns this connection
            logger.info(f"✅ Connected to RabbitMQ exchange: {self.exchange}")
        except Exception as e:
            logger.error(f"❌ Failed to connect to RabbitMQ: {e}")
            # Don't raise here to allow retry in emit
            self.connection = None
            self._owner_pid = None

    def close(self):
        """Clean up RabbitMQ connection - only if we own it"""
        current_pid = os.getpid()
        
        # Only close if this process owns the connection
        if self._owner_pid is not None and self._owner_pid != current_pid:
            # Connection was created in parent process, don't touch it
            self.channel = None
            self.connection = None
            self._owner_pid = None
            return
        
        try:
            if self.channel and self.channel.is_open:
                self.channel.close()
            if self.connection and not self.connection.is_closed:
                self.connection.close()
                logger.debug("📤 EventPublisher connection closed cleanly")
        except Exception as e:
            # Ignore errors during cleanup
            pass
        finally:
            self.channel = None
            self.connection = None
            self._owner_pid = None

    def emit_event(self, job_id, event_type, payload):
        """
        Emits a job event to RabbitMQ.
        Routing key: job.{job_id}.{event_type}
        """
        if not self.connection or self.connection.is_closed:
            self.connect()

        if not self.channel:
            logger.error("❌ Channel not available, cannot emit event")
            return

        routing_key = f"job.{job_id}.{event_type}"
        
        message = {
            "jobId": job_id,
            "eventType": event_type,
            "payload": payload,
            "timestamp": int(time.time() * 1000)
        }

        try:
            self.channel.basic_publish(
                exchange=self.exchange,
                routing_key=routing_key,
                body=json.dumps(message),
                properties=pika.BasicProperties(
                    delivery_mode=2,  # make message persistent
                    content_type='application/json'
                )
            )
            logger.debug(f"📤 Emitted event: {routing_key}")
        except Exception as e:
            logger.error(f"❌ Failed to emit event {routing_key}: {e}")
            # Try to reconnect and retry once
            try:
                self.connect()
                if self.channel:
                    self.channel.basic_publish(
                        exchange=self.exchange,
                        routing_key=routing_key,
                        body=json.dumps(message),
                        properties=pika.BasicProperties(
                            delivery_mode=2,
                            content_type='application/json'
                        )
                    )
            except Exception as retry_e:
                logger.error(f"❌ Failed to retry emit event: {retry_e}")

# Global instance
publisher = EventPublisher()
