// server.js - Express.js RESTful API for Product Management

// Import required modules
require('dotenv').config();
const express = require('express');
const { body, validationResult } = require('express-validator');
const morgan = require('morgan');
const cors = require('cors');
const mongoose = require('mongoose');
const { StatusCodes } = require('http-status-codes');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/productsDB')
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Custom error classes
class NotFoundError extends Error {
  constructor(message = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
    this.statusCode = StatusCodes.NOT_FOUND;
  }
}

class ValidationError extends Error {
  constructor(message = 'Validation failed', errors = []) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = StatusCodes.BAD_REQUEST;
    this.errors = errors;
  }
}

// Authentication middleware
const authenticate = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(StatusCodes.UNAUTHORIZED).json({
      success: false,
      message: 'Invalid or missing API key'
    });
  }
  next();
};

// Validation middleware
const validateProduct = [
  body('name').notEmpty().withMessage('Name is required'),
  body('description').notEmpty().withMessage('Description is required'),
  body('price').isNumeric().withMessage('Price must be a number'),
  body('category').notEmpty().withMessage('Category is required'),
  body('inStock').optional().isBoolean().withMessage('inStock must be a boolean'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        errors: errors.array()
      });
    }
    next();
  }
];

// Product Model
const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [100, 'Name cannot be more than 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
    maxlength: [1000, 'Description cannot be more than 1000 characters']
  },
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [0, 'Price must be a positive number']
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: {
      values: ['electronics', 'clothing', 'home', 'kitchen', 'sports', 'other'],
      message: '{VALUE} is not a valid category'
    },
    lowercase: true
  },
  inStock: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

const Product = mongoose.model('Product', productSchema);

// Routes
app.get('/', (req, res) => {
  res.send('Welcome to the Product API! Go to /api/products to see all products.');
});

// Get all products with filtering and pagination
app.get('/api/products', async (req, res, next) => {
  try {
    const { category, inStock, search, page = 1, limit = 10, sort = '-createdAt' } = req.query;
    
    // Build query
    const query = {};
    
    // Filter by category
    if (category) {
      query.category = category;
    }
    
    // Filter by inStock status
    if (inStock === 'true' || inStock === 'false') {
      query.inStock = inStock === 'true';
    }
    
    // Search by name or description
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Execute query with pagination
    const total = await Product.countDocuments(query);
    const products = await Product.find(query)
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();
    
    // Return response with pagination metadata
    res.json({
      success: true,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: products
    });
  } catch (error) {
    next(error);
  }
});

// Get product by ID
app.get('/api/products/:id', async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      throw new NotFoundError('Product not found');
    }
    res.json({
      success: true,
      data: product
    });
  } catch (error) {
    next(error);
  }
});

// Create a new product (protected by authentication)
app.post('/api/products', authenticate, validateProduct, async (req, res, next) => {
  try {
    const product = new Product(req.body);
    await product.save();
    res.status(StatusCodes.CREATED).json({
      success: true,
      data: product
    });
  } catch (error) {
    next(error);
  }
});

// Update a product (protected by authentication)
app.put('/api/products/:id', authenticate, validateProduct, async (req, res, next) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: Date.now() },
      { new: true, runValidators: true }
    );
    
    if (!product) {
      throw new NotFoundError('Product not found');
    }
    
    res.json({
      success: true,
      data: product
    });
  } catch (error) {
    next(error);
  }
});

// Delete a product (protected by authentication)
app.delete('/api/products/:id', authenticate, async (req, res, next) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    
    if (!product) {
      throw new NotFoundError('Product not found');
    }
    
    res.status(StatusCodes.NO_CONTENT).send();
  } catch (error) {
    next(error);
  }
});

// Get product statistics
app.get('/api/products/statistics', async (req, res, next) => {
  try {
    const stats = await Product.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          avgPrice: { $avg: '$price' },
          minPrice: { $min: '$price' },
          maxPrice: { $max: '$price' },
          totalValue: { $sum: '$price' }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);
    
    const totalProducts = await Product.countDocuments();
    const inStockCount = await Product.countDocuments({ inStock: true });
    
    res.json({
      success: true,
      data: {
        totalProducts,
        inStock: inStockCount,
        outOfStock: totalProducts - inStockCount,
        byCategory: stats
      }
    });
  } catch (error) {
    next(error);
  }
});

// Search products by name or description
app.get('/api/products/search', async (req, res, next) => {
  try {
    const { q } = req.query;
    
    if (!q) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Search query parameter "q" is required'
      });
    }
    
    const products = await Product.find({
      $or: [
        { name: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } }
      ]
    });
    
    res.json({
      success: true,
      count: products.length,
      data: products
    });
  } catch (error) {
    next(error);
  }
});

// 404 handler
app.use((req, res, next) => {
  throw new NotFoundError('Endpoint not found');
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  // Default to 500 server error
  const statusCode = err.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;
  const message = err.message || 'Internal Server Error';
  
  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('Available endpoints:');
  console.log(`  GET    /api/products`);
  console.log(`  GET    /api/products/:id`);
  console.log(`  POST   /api/products (requires authentication)`);
  console.log(`  PUT    /api/products/:id (requires authentication)`);
  console.log(`  DELETE /api/products/:id (requires authentication)`);
  console.log(`  GET    /api/products/statistics`);
  console.log(`  GET    /api/products/search?q=<search term>`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  server.close(() => process.exit(1));
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  server.close(() => process.exit(1));
});

// Export the app for testing purposes
module.exports = { app, server };