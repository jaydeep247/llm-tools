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
            # Reset connection state
            self.connection = None
            self.channel = None
            
            params = pika.URLParameters(self.url)
            # Enable heartbeat to keep connection alive
            params.socket_timeout = 10
            params.heartbeat = 60
            
            self.connection = pika.BlockingConnection(params)
            self.channel = self.connection.channel()
            self.channel.exchange_declare(exchange=self.exchange, exchange_type='topic', durable=True)
            self._owner_pid = current_pid  # Track which process owns this connection
        except Exception as e:
            logger.error(f"❌ Failed to connect to RabbitMQ: {e}")
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


    def emit_event(self, job_id, event_type, payload, retries=3):
        """
        Emits a job event to RabbitMQ with retry logic.
        Routing key: job.{job_id}.{event_type}
        """
        routing_key = f"job.{job_id}.{event_type}"
        
        message = {
            "jobId": job_id,
            "eventType": event_type,
            "payload": payload,
            "timestamp": int(time.time() * 1000)
        }
        
        # Add job_id to payload if missing (crucial for frontend/backend matching)
        if isinstance(payload, dict) and 'job_id' not in payload:
            payload['job_id'] = job_id
        
        body = json.dumps(message)
        properties = pika.BasicProperties(
            delivery_mode=2,  # make message persistent
            content_type='application/json'
        )

        for attempt in range(retries):
            try:
                # Ensure connection is open
                if not self.connection or self.connection.is_closed:
                    self.connect()
                
                # If connection failed, wait and retry
                if not self.connection or self.connection.is_closed:
                    raise pika.exceptions.AMQPConnectionError("Connection unavailable")

                # Ensure channel is open
                if not self.channel or self.channel.is_closed:
                    try:
                        self.channel = self.connection.channel()
                    except:
                        # Force reconnect if channel creation fails
                        self.connection.close()
                        self.connect()
                
                if self.channel and self.channel.is_open:
                    self.channel.basic_publish(
                        exchange=self.exchange,
                        routing_key=routing_key,
                        body=body,
                        properties=properties
                    )
                    logger.debug(f"📤 Emitted event: {routing_key}")
                    return True
                else:
                    raise pika.exceptions.AMQPChannelError("Channel unavailable")
                    
            except (pika.exceptions.AMQPConnectionError, pika.exceptions.AMQPChannelError, Exception) as e:
                logger.warning(f"⚠️ Failed to emit event {routing_key} (attempt {attempt+1}/{retries}): {e}")
                
                # Force reset on error
                try:
                    if self.connection and not self.connection.is_closed:
                        self.connection.close()
                except:
                    pass
                self.connection = None
                self.channel = None
                
                # Wait before retry with exponential backoff
                if attempt < retries - 1:
                    time.sleep(1 * (2 ** attempt)) # Increased wait time
                
        logger.error(f"❌ Failed to emit event {routing_key} after {retries} attempts")
        return False

# Global instance
publisher = EventPublisher()
