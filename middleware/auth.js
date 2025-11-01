const { StatusCodes } = require('http-status-codes');
const ApiError = require('../utils/ApiError');

const authenticate = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  
  if (!apiKey) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'API key is required');
  }

  if (apiKey !== process.env.API_KEY) {
    throw new ApiError(StatusCodes.FORBIDDEN, 'Invalid API key');
  }

  next();
};

module.exports = authenticate;
