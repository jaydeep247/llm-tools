import json
import time
import atexit
import pika
from utils.config import config
from utils.logger import logger

class EventPublisher:
    def __init__(self):
        self.url = config.RABBITMQ_URL
        self.exchange = 'job.events'
        self.connection = None
        self.channel = None
        # Register cleanup on exit
        atexit.register(self.close)

    def connect(self):
        if self.connection and not self.connection.is_closed:
            return

        try:
            params = pika.URLParameters(self.url)
            self.connection = pika.BlockingConnection(params)
            self.channel = self.connection.channel()
            self.channel.exchange_declare(exchange=self.exchange, exchange_type='topic', durable=True)
            logger.info(f"✅ Connected to RabbitMQ exchange: {self.exchange}")
        except Exception as e:
            logger.error(f"❌ Failed to connect to RabbitMQ: {e}")
            # Don't raise here to allow retry in emit
            self.connection = None

    def close(self):
        """Clean up RabbitMQ connection"""
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
