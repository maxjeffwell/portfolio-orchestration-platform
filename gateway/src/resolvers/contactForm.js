import { sendNotification } from '../lib/gotifyClient.js';

// Simple in-memory rate limiter: max 3 submissions per IP per 10 minutes
const submissions = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 3;

function checkRateLimit(ip) {
  const now = Date.now();
  const key = ip || 'unknown';
  const record = submissions.get(key);

  if (!record || now - record.windowStart > WINDOW_MS) {
    submissions.set(key, { windowStart: now, count: 1 });
    return true;
  }

  if (record.count >= MAX_PER_WINDOW) {
    return false;
  }

  record.count++;
  return true;
}

export const contactFormResolvers = {
  Mutation: {
    submitContactForm: async (_parent, { input }, context) => {
      const ip =
        context.request?.headers?.get('x-forwarded-for') ||
        context.request?.socket?.remoteAddress ||
        '';

      if (!checkRateLimit(ip)) {
        return {
          success: false,
          message: 'Too many submissions. Please try again later.',
        };
      }

      const { name, email, message } = input;

      const title = `Contact Form: ${name}`;
      const body = [
        `From: ${name}`,
        `Email: ${email}`,
        ``,
        `Message:`,
        message,
      ].join('\n');

      try {
        await sendNotification({ title, message: body, priority: 7 });
        return { success: true, message: 'Message sent successfully!' };
      } catch (err) {
        console.error('[ContactForm] Gotify error:', err.message);
        return {
          success: false,
          message: 'Failed to send message. Please try again later.',
        };
      }
    },
  },
};
