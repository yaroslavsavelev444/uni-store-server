const { Schema, model } = require('mongoose');

const categorySchema = new Schema({
    title: { type: String, required: true },
    subTitle: { type: String },
    description: { type: String },
    image: { type: String, required: true },
}, {
  timestamps: true
});

module.exports = model('Category', categorySchema);