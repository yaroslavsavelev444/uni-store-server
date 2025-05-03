const {Schema, model} = require('mongoose');

const OrderShema = new Schema({
    user: {type: Schema.Types.ObjectId, ref: 'User'},
    products: [
        {
            product: {type: Schema.Types.ObjectId, ref: 'Product'},
            count: {type: Number, required: true},
            price: {type: Number, required: true},
            priceWithDiscount: {type: Number, required: true},
        }
    ],
   addressDetails: {
       city: {type: String, required: true},
       street: {type: String, required: true},
       house: {type: String, required: true},
   },
    deliveryType: {type: String, enum: ['delivery', 'pickup'], required: true},
    totalPrice: {type: Number, required: true},
    discountedPrice: {type: Number, required: true},
    status: {type: String, enum: ['pending', 'confirmed', 'rejected', 'packed', 'sent', 'cancelled'], required: true, default: 'pending'},
    cancelData:{
        cancelReason: {type: String, required: true},
        cancelDate: {type: Date, required: true},
    },
    companyData: {
        company: {type: Schema.Types.ObjectId, ref: 'Company'},
    }
}, {
    timestamps: true,
});

module.exports = model('Order', OrderShema);
