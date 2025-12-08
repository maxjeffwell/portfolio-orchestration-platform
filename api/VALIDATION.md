# API Input Validation

This document describes the input validation system implemented for the Portfolio Orchestration Platform API.

## Overview

The API uses `express-validator` to provide comprehensive input validation for all routes. Validation is applied at the route level using middleware, ensuring that all requests are properly sanitized and validated before reaching the controller logic.

## Architecture

### Validation Middleware

The validation middleware is located at `api/src/middleware/validation/validationMiddleware.js`. It:

1. Runs validation chains on incoming requests
2. Collects validation errors
3. Returns a standardized 400 error response if validation fails
4. Passes control to the next middleware if validation succeeds

Example response for validation errors:

```json
{
  "success": false,
  "errors": [
    {
      "field": "username",
      "message": "Username is required",
      "value": ""
    }
  ]
}
```

### Validation Rules

All validation rules are centralized in `api/src/middleware/validation/rules.js`. This file exports validation chains for different endpoints:

- **Auth Routes**: `authLogin`
- **Deployment Routes**: `deploymentName`, `deploymentNamespace`, `scaleDeployment`
- **Pod Routes**: `podName`, `podNamespace`, `podLogs`
- **Metrics Routes**: `metricsNamespace`

### Error Handler

A dedicated error handler middleware is registered last in the application (`api/src/middleware/errorHandler.js`). It:

1. Logs all unhandled errors with context
2. Returns standardized error responses
3. Prevents sensitive error details from leaking in production

## Adding Validation to New Endpoints

To add validation to a new endpoint:

### 1. Define Validation Rules

Add your validation rules to `api/src/middleware/validation/rules.js`:

```javascript
export const myEndpoint = [
  param('id')
    .trim()
    .notEmpty()
    .withMessage('ID is required')
    .isInt()
    .withMessage('ID must be an integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
];
```

### 2. Apply to Route

Import and apply the validation middleware to your route:

```javascript
import validate from '../middleware/validation/validationMiddleware.js';
import { myEndpoint } from '../middleware/validation/rules.js';

router.get('/:id', validate(myEndpoint), myController.getById);
```

### 3. Remove Manual Validation

Remove any manual validation checks from your controller, as they're now handled by middleware:

```javascript
// Before
async getById(req, res) {
  const { id } = req.params;
  if (!id || isNaN(id)) {
    return res.status(400).json({ error: 'Invalid ID' });
  }
  // ... rest of logic
}

// After
async getById(req, res) {
  const { id } = req.params;
  // Validation handled by middleware
  // ... rest of logic
}
```

## Available Validators

Common validators from express-validator:

- `notEmpty()`: Ensures the field is not empty
- `trim()`: Removes whitespace from beginning and end
- `isEmail()`: Validates email format
- `isInt(options)`: Validates integer with optional min/max
- `isLength(options)`: Validates string length
- `matches(pattern)`: Validates against regex pattern
- `isAlphanumeric()`: Validates alphanumeric characters only
- `optional()`: Makes the field optional

See the [express-validator documentation](https://express-validator.github.io/docs/) for a complete list.

## Validation Patterns

### Kubernetes Resource Names

Kubernetes resource names must follow DNS-1123 label standard:

```javascript
param('name')
  .trim()
  .matches(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/)
  .withMessage('Invalid resource name format')
```

### Namespace Validation

Namespaces are optional and default to 'default':

```javascript
query('namespace')
  .optional()
  .trim()
  .matches(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/)
  .withMessage('Invalid namespace format')
```

### Numeric Ranges

Use `isInt()` with options for numeric validation:

```javascript
body('replicas')
  .isInt({ min: 0, max: 100 })
  .withMessage('Replicas must be between 0 and 100')
```

## Testing Validation

### Manual Testing

Use curl or a REST client to test validation:

```bash
# Test missing required field
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": ""}'

# Expected response:
# {"success": false, "errors": [{"field": "username", "message": "Username is required"}]}
```

### Unit Tests

Unit tests for validation rules are in `api/tests/validation.test.js`:

```javascript
test('authLogin fails with empty username', async () => {
  const req = { body: { username: '', password: 'secret123' } };
  await Promise.all(authLogin.map(v => v.run(req)));
  const errors = validationResult(req);
  expect(errors.isEmpty()).toBe(false);
});
```

### Integration Tests

Integration tests verify validation at the route level in `api/tests/integration/*.test.js`.

## Security Considerations

1. **Input Sanitization**: All input is trimmed and validated before processing
2. **SQL Injection**: Parameterized queries are used with the database
3. **XSS Prevention**: Input validation prevents malicious script injection
4. **Resource Limits**: Numeric inputs have reasonable min/max bounds
5. **Error Messages**: Validation errors don't leak sensitive system information

## Troubleshooting

### Validation Not Working

1. Ensure validation middleware is imported and applied to the route
2. Check that validation rules are exported from `rules.js`
3. Verify the route order - validation must come before the controller

### Validation Passing When It Shouldn't

1. Check if fields are marked `optional()` when they should be required
2. Verify the validation rule logic matches your requirements
3. Add unit tests to verify the validation rules

### Error Format Incorrect

The validation middleware standardizes error responses. If you need a different format, modify `api/src/middleware/validation/validationMiddleware.js`.
