const { Schema, model, Types } = require('mongoose');

const ProductSchema = new Schema({
  // Basic info
  title: { type: String, required: true }, 
  description: { type: String, required: true }, 
  isAvailable: { type: Boolean, required: true }, 

  // Pricing
  priceIndividual: { type: Number, required: true }, 
  hasUridPrice: { type: Boolean, required: true, default: false },
  priceLegalEntity: { type: Number }, 
  hasDiscount: { type: Boolean, default: false },
  discountPersentage: { type: Number, default: 0 }, 
  discountFromQuantity: { type: Number, default: 0 }, 
  status : { type: String, enum: ['active', 'archived', 'preorder'], default: 'active' },
  // Quantity
  totalQuantity: { type: Number, default: 0 }, 

  // Media
  
  // Category
  categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true },

  // Visibility
  showOnMainPage: { type: Boolean, default: false }, 

  images: [String], // массив путей к изображениям
  instructionPath: { type: String }, // путь к инструкции

  // Dynamic product features
  customAttributes: [{
    name: { type: String, required: true }, 
    value: { type: String, required: true },
  }],

  associatedProductIds: [{ type: Types.ObjectId, ref: 'Product' }],
  relatedProducts: [{ type: Types.ObjectId, ref: 'Product' }], 
}, {
  timestamps: true
});

module.exports = model('Product', ProductSchema);