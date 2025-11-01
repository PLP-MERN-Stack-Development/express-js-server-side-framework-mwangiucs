const Product = require('../models/Product');
const { StatusCodes } = require('http-status-codes');

// @desc    Get all products with filtering and pagination
// @route   GET /api/products
// @access  Public
exports.getProducts = async (req, res, next) => {
  try {
    const { 
      name, 
      minPrice, 
      maxPrice, 
      category, 
      inStock,
      page = 1, 
      limit = 10,
      sort = '-createdAt'
    } = req.query;
    
    // Build query object
    const query = {};
    
    // Filter by name (case-insensitive search)
    if (name) {
      query.name = { $regex: name, $options: 'i' };
    }
    
    // Filter by price range
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }
    
    // Filter by category
    if (category) {
      query.category = { $in: category.split(',') };
    }
    
    // Filter by stock status
    if (inStock === 'true' || inStock === 'false') {
      query.inStock = inStock === 'true';
    }
    
    // Execute query with pagination
    const total = await Product.countDocuments(query);
    const products = await Product.find(query)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(Number(limit));
    
    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;
    
    res.status(StatusCodes.OK).json({
      success: true,
      count: products.length,
      total,
      page: Number(page),
      totalPages,
      hasNextPage,
      hasPreviousPage,
      data: products
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single product by ID
// @route   GET /api/products/:id
// @access  Public
exports.getProductById = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        error: `Product not found with id of ${req.params.id}`
      });
    }
    
    res.status(StatusCodes.OK).json({
      success: true,
      data: product
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create new product
// @route   POST /api/products
// @access  Private/Admin
exports.createProduct = async (req, res, next) => {
  try {
    const { name, description, price, category, inStock } = req.body;
    
    // Create product
    const product = await Product.create({
      name,
      description,
      price,
      category,
      inStock: inStock !== undefined ? inStock : true
    });
    
    res.status(StatusCodes.CREATED).json({
      success: true,
      data: product
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update product
// @route   PUT /api/products/:id
// @access  Private/Admin
exports.updateProduct = async (req, res, next) => {
  try {
    const { name, description, price, category, inStock } = req.body;
    
    let product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        error: `Product not found with id of ${req.params.id}`
      });
    }
    
    // Update fields if they are provided in the request
    if (name) product.name = name;
    if (description) product.description = description;
    if (price) product.price = price;
    if (category) product.category = category;
    if (inStock !== undefined) product.inStock = inStock;
    
    // Save the updated product
    const updatedProduct = await product.save();
    
    res.status(StatusCodes.OK).json({
      success: true,
      data: updatedProduct
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete product
// @route   DELETE /api/products/:id
// @access  Private/Admin
exports.deleteProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        error: `Product not found with id of ${req.params.id}`
      });
    }
    
    await product.deleteOne();
    
    res.status(StatusCodes.OK).json({
      success: true,
      data: {}
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get product statistics
// @route   GET /api/products/stats
// @access  Public
exports.getProductStats = async (req, res, next) => {
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
    
    // Calculate overall statistics
    const totalProducts = stats.reduce((acc, curr) => acc + curr.count, 0);
    const inStockCount = await Product.countDocuments({ inStock: true });
    
    res.status(StatusCodes.OK).json({
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
};