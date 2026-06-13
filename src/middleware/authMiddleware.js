const jwt = require('jsonwebtoken');
const { runWithTenantContext } = require('../config/tenantContext');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_school_erp_key';

// Middleware to extract auth token and execute the request inside the AsyncLocalStorage scope
const protect = (req, res, next) => {
  let token = null;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.query.token) {
    token = req.query.token;
  }

  let userId = null;
  let schoolId = null;
  let role = null;
  let bypassTenantFilter = false;

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      userId = decoded.id;
      schoolId = decoded.schoolId;
      role = decoded.role;
      if (role === 'SUPER_ADMIN') {
        bypassTenantFilter = true;
      }
    } catch (err) {
      // Allow request to continue; GraphQL resolvers will throw error if a query requires auth
    }
  }

  // Attach context properties to the request object so Apollo Server context resolver can access them
  req.userId = userId;
  req.schoolId = schoolId;
  req.role = role;
  req.bypassTenantFilter = bypassTenantFilter;

  // Run downstream handlers (Express + Apollo) within the tenant storage thread context
  runWithTenantContext({ userId, schoolId, role, bypassTenantFilter }, () => {
    next();
  });
};

// Role authorization guard helper for resolvers
const authorize = (context, allowedRoles = []) => {
  if (!context.userId) {
    throw new Error('Authentication required. Please log in.');
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(context.role)) {
    throw new Error(`Access denied. Role '${context.role}' is not authorized to perform this action.`);
  }
};

module.exports = {
  protect,
  authorize
};
