const {Schema, model} = require('mongoose');

const OrderShema = new Schema({
    user: {type: Schema.Types.ObjectId, ref: 'User'},
    deliveryMethod: {type: String, enum: ['delivery', 'pickup'], required: true},
    deliveryData: {
        tk: {type: String},
        address: {type: String,},
        comment: {type: String},
    },
    recipientData:{
        name: {type: String, required: true},
        phone: {type: String, required: true},
    },
    priceDetails: {
        totalPrice: {type: Number, required: true},
        totalPriceWithDiscount: {type: Number, required: true},
    },
    isCompany: {type: Boolean, required: true, default: false},
    companyData: {
        company: {type: Schema.Types.ObjectId, ref: 'Company'},
    },
    products: [
        {
            product: {type: Schema.Types.ObjectId, ref: 'Product' ,required: true},
            quantity: {type: Number, required: true},
            price: {type: Number, required: true},
            priceWithDiscount: {type: Number},
            totalPrice: {type: Number, required: true},
            totalPriceWithDiscount: {type: Number, required: true},
        }
    ],
    status: {type: String, enum: ['pending', 'confirmed', 'rejected', 'packed', 'sent', 'cancelled'], required: true, default: 'pending'},
    cancelData:{
        cancelReason: {type: String,},
        cancelDate: {type: Date,},
    },
}, {
    timestamps: true,
});

module.exports = model('Order', OrderShema);
