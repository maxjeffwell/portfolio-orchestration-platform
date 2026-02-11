import { Kafka, logLevel } from 'kafkajs';

let consumer = null;
let isRunning = false;
let eventHandlers = [];

/**
 * Start Kafka consumer for AI gateway events.
 * Retries indefinitely with exponential backoff so the gateway
 * self-heals if Kafka starts after this pod.
 * Uses an ephemeral consumer group so each pod restart re-reads all
 * retained events and populates the in-memory buffer.
 */
export async function startConsumer() {
  if (isRunning) return;

  const brokers = process.env.KAFKA_BROKERS
    ? process.env.KAFKA_BROKERS.split(',')
    : ['vertex-kafka-kafka-bootstrap.microservices.svc:9092'];
  const clientId = process.env.KAFKA_CLIENT_ID || 'graphql-gateway';
  const topic = process.env.KAFKA_AI_EVENTS_TOPIC || 'ai.gateway.events';

  const kafka = new Kafka({
    clientId,
    brokers,
    logLevel: logLevel.ERROR,
    retry: { initialRetryTime: 300, retries: 8 },
  });

  const maxDelay = 30_000;
  let delay = 2_000;
  while (true) {
    const groupId = `graphql-gateway-${Date.now()}`;
    try {
      consumer = kafka.consumer({
        groupId,
        sessionTimeout: 30000,
        heartbeatInterval: 3000,
      });

      await consumer.connect();
      await consumer.subscribe({ topic, fromBeginning: true });

      console.log('[Kafka] Consumer subscribed to', topic);
      isRunning = true;

      await consumer.run({
        eachMessage: async ({ message }) => {
          try {
            const event = JSON.parse(message.value.toString());
            for (const handler of eventHandlers) {
              try { handler(event); } catch {}
            }
          } catch (err) {
            console.error('[Kafka] Error processing message:', err.message);
          }
        },
      });
      return;
    } catch (err) {
      console.warn(`[Kafka] Consumer connect failed: ${err.message}, retrying in ${delay}ms`);
      try { await consumer?.disconnect(); } catch {}
      consumer = null;
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, maxDelay);
    }
  }
}

/**
 * Register a handler for incoming AI events. Returns unsubscribe function.
 */
export function onAIEvent(handler) {
  eventHandlers.push(handler);
  return () => {
    eventHandlers = eventHandlers.filter((h) => h !== handler);
  };
}

/**
 * Stop consumer for graceful shutdown.
 */
export async function stopConsumer() {
  if (!consumer) return;
  try {
    await consumer.disconnect();
    isRunning = false;
    console.log('[Kafka] Consumer stopped');
  } catch (err) {
    console.error('[Kafka] Error stopping consumer:', err.message);
  }
}
