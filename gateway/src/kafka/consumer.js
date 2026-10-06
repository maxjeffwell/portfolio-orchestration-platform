import os from 'node:os';
import { Kafka, logLevel } from 'kafkajs';

let kafka = null;
let consumer = null;
let groupId = null;
let isRunning = false;
let eventHandlers = [];

/**
 * Start Kafka consumer for AI gateway events.
 * Retries indefinitely with exponential backoff so the gateway
 * self-heals if Kafka starts after this pod.
 *
 * Every replica must see EVERY event (each feeds its own in-memory buffer and
 * its own GraphQL subscribers), so replicas must NOT share a consumer group.
 * The group is per pod and named after the pod (os.hostname() is the pod name
 * on Kubernetes). It never commits offsets: a restart is meant to replay the
 * retained events from the beginning, and a group with no committed offsets is
 * dropped by the broker as soon as it is empty -- so restarts no longer leave
 * dead groups behind (the previous `graphql-gateway-<timestamp>` scheme had
 * accumulated 11 of them by 2026-10-06). stopConsumer() also deletes the group
 * explicitly on graceful shutdown. KAFKA_GROUP_ID overrides the name for
 * single-instance local runs only; never set it on a multi-replica deployment.
 */
export async function startConsumer() {
  if (isRunning) return;

  const brokers = process.env.KAFKA_BROKERS
    ? process.env.KAFKA_BROKERS.split(',')
    : ['vertex-kafka-kafka-bootstrap.microservices.svc:9092'];
  const clientId = process.env.KAFKA_CLIENT_ID || 'graphql-gateway';
  const topic = process.env.KAFKA_AI_EVENTS_TOPIC || 'ai.gateway.events';
  groupId = process.env.KAFKA_GROUP_ID || `graphql-gateway-${os.hostname()}`;

  kafka = new Kafka({
    clientId,
    brokers,
    logLevel: logLevel.ERROR,
    retry: { initialRetryTime: 300, retries: 8 },
  });

  const maxDelay = 30_000;
  let delay = 2_000;
  while (true) {
    try {
      consumer = kafka.consumer({
        groupId,
        sessionTimeout: 30000,
        heartbeatInterval: 3000,
      });

      await consumer.connect();
      await consumer.subscribe({ topic, fromBeginning: true });

      console.log('[Kafka] Consumer subscribed to', topic, 'as group', groupId);
      isRunning = true;

      await consumer.run({
        // No offset commits: see the note above (replay-on-restart by design,
        // and an offset-less group is garbage-collected the moment it empties).
        autoCommit: false,
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
  // Belt and braces: the group is per pod and useless once this pod is gone.
  // The broker drops it anyway (no committed offsets), but a crash mid-rebalance
  // can leave it Empty for a while, so delete it explicitly when we can.
  if (kafka && groupId) {
    const admin = kafka.admin();
    try {
      await admin.connect();
      await admin.deleteGroups([groupId]);
      console.log('[Kafka] Consumer group deleted:', groupId);
    } catch (err) {
      console.warn('[Kafka] Could not delete consumer group:', err.message);
    } finally {
      try { await admin.disconnect(); } catch {}
    }
  }
}
