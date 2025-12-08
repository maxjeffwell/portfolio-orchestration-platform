import crypto from 'crypto';
import logger from '../utils/logger.js';

/**
 * JWT Configuration and Security Validation
 * 
 * This module handles secure JWT secret management with the following rules:
 * - In production: MUST have a strong JWT_SECRET set, fails fast if missing
 * - In development: Auto-generates a secure random secret with a warning
 * - Never accepts known weak/default secrets
 */

const WEAK_SECRETS = [
  'your-secret-key-change-in-production',
  'secret',
  'jwt-secret',
  'change-me',
  'default',
];

const MIN_SECRET_LENGTH = 32; // 256 bits

/**
 * Validates if a JWT secret is strong enough
 */
function isWeakSecret(secret) {
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    return true;
  }
  
  // Check against known weak secrets
  if (WEAK_SECRETS.includes(secret.toLowerCase())) {
    return true;
  }
  
  return false;
}

/**
 * Generates a cryptographically secure random JWT secret
 */
function generateSecureSecret() {
  return crypto.randomBytes(64).toString('hex');
}

/**
 * Gets and validates the JWT secret with environment-aware behavior
 */
function getJWTSecret() {
  const envSecret = process.env.JWT_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Production: Fail fast if secret is missing or weak
  if (isProduction) {
    if (!envSecret) {
      logger.error('FATAL: JWT_SECRET environment variable is not set in production');
      logger.error('Generate a secure secret with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
      process.exit(1);
    }
    
    if (isWeakSecret(envSecret)) {
      logger.error('FATAL: JWT_SECRET is too weak or uses a known default value');
      logger.error('Generate a secure secret with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
      process.exit(1);
    }
    
    logger.info('JWT secret validated successfully');
    return envSecret;
  }
  
  // Development: Warn and auto-generate if missing
  if (!envSecret || isWeakSecret(envSecret)) {
    const generatedSecret = generateSecureSecret();
    
    logger.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.warn('⚠️  JWT_SECRET Warning');
    logger.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.warn('JWT_SECRET is not set or is using a weak default value.');
    logger.warn('A secure random secret has been auto-generated for this session.');
    logger.warn('');
    logger.warn('⚠️  This secret will change on restart!');
    logger.warn('⚠️  All existing tokens will become invalid!');
    logger.warn('');
    logger.warn('For persistent authentication, add to your .env file:');
    logger.warn(`JWT_SECRET=${generatedSecret}`);
    logger.warn('');
    logger.warn('Or generate a new one with:');
    logger.warn('node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
    logger.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    return generatedSecret;
  }
  
  logger.info('JWT secret loaded from environment');
  return envSecret;
}

// Initialize and export configuration
export const JWT_SECRET = getJWTSecret();
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// Export helper for tests
export { isWeakSecret, generateSecureSecret };
