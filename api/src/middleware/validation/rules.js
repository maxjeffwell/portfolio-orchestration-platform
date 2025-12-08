import { body, param, query } from 'express-validator';

// Auth validations
export const authLogin = [
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Username is required')
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be 3-30 characters'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

// Deployment validations
export const deploymentName = [
  param('name')
    .trim()
    .notEmpty()
    .withMessage('Deployment name is required')
    .matches(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/)
    .withMessage('Invalid deployment name format')
];

export const deploymentNamespace = [
  query('namespace')
    .optional()
    .trim()
    .matches(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/)
    .withMessage('Invalid namespace format')
];

export const scaleDeployment = [
  ...deploymentName,
  ...deploymentNamespace,
  body('replicas')
    .notEmpty()
    .withMessage('Replicas is required')
    .isInt({ min: 0, max: 100 })
    .withMessage('Replicas must be an integer between 0 and 100')
];

// Pod validations
export const podName = [
  param('name')
    .trim()
    .notEmpty()
    .withMessage('Pod name is required')
];

export const podNamespace = [
  query('namespace')
    .optional()
    .trim()
    .matches(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/)
    .withMessage('Invalid namespace format')
];

export const podLogs = [
  ...podName,
  ...podNamespace,
  query('container')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Container name cannot be empty if provided'),
  query('tail')
    .optional()
    .isInt({ min: 1, max: 10000 })
    .withMessage('Tail must be an integer between 1 and 10000')
];

// Metrics validations
export const metricsNamespace = [
  query('namespace')
    .optional()
    .trim()
    .matches(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/)
    .withMessage('Invalid namespace format')
];
