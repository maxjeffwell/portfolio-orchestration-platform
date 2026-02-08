import { Kafka, logLevel } from 'kafkajs';

let consumer = null;
let isRunning = false;
let eventHandlers = [];

/**
 * Start Kafka consumer for AI gateway events.
 * Uses an ephemeral consumer group so each pod restart re-reads all
 * retained events and populates the in-memory buffer.
 */
export async function startConsumer() {
  if (isRunning) return;

  const brokers = process.env.KAFKA_BROKERS
    ? process.env.KAFKA_BROKERS.split(',')
    : ['vertex-kafka-kafka-bootstrap.microservices.svc:9092'];
  const clientId = process.env.KAFKA_CLIENT_ID || 'graphql-gateway';
  const groupId = `graphql-gateway-${Date.now()}`;
  const topic = process.env.KAFKA_AI_EVENTS_TOPIC || 'ai.gateway.events';

  const kafka = new Kafka({
    clientId,
    brokers,
    logLevel: logLevel.ERROR,
    retry: { initialRetryTime: 100, retries: 8 },
  });

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
