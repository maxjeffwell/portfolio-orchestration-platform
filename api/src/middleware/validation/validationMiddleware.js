import { validationResult } from 'express-validator';
import logger from '../../utils/logger.js';

const validate = (validations) => async (req, res, next) => {
  try {
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const formatted = errors.array().map(err => ({
        field: err.path || err.param,
        message: err.msg,
        value: err.value
      }));

      const requestId = req.requestId || 'unknown';
      logger.warn('Validation errors', {
        requestId,
        errors: formatted,
        path: req.path,
        method: req.method
      });

      return res.status(400).json({
        success: false,
        errors: formatted,
        requestId
      });
    }

    next();
  } catch (err) {
    logger.error('Validation middleware error', {
      requestId: req.requestId || 'unknown',
      error: err.message
    });
    next(err);
  }
};

export default validate;
