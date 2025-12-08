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

      logger.warn('Validation errors', { formatted });
      return res.status(400).json({
        success: false,
        errors: formatted
      });
    }

    next();
  } catch (err) {
    logger.error('Validation middleware error', err);
    next(err);
  }
};

export default validate;
