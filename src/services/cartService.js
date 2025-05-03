const ApiError = require("../exceptions/api-error");
const { ProductModel, CartModel } = require("../models/indexModels");

const addToCartProduct = async (userId, productId, quantity) => {
  if (!userId || !productId || !quantity || quantity < 1) {
    throw ApiError.BadRequest("Некорректные данные для добавления в корзину");
  }

  const product = await ProductModel.findById(productId);
  if (!product) throw ApiError.NotFound("Продукт не найден");

  if (product.quantity < quantity) {
    throw ApiError.BadRequest("Недостаточно товара в наличии");
  }

  const cart = await CartModel.findOne({ user: userId }) || new CartModel({ user: userId, items: [] });

  const existingItem = cart.items.find(item => item.productId.toString() === productId);

  if (existingItem) {
    existingItem.quantity += quantity;
    existingItem.price = product.price; // обновляем цену на текущую
  } else {
    cart.items.push({
      productId,
      quantity,
      price: product.price,
    });
  }

  await cart.save();
  return cart;
};

const removeFromCartProduct = async (userId, productId, quantity) => {
  if (!userId || !productId || quantity < 1) {
    throw ApiError.BadRequest("Некорректные данные для удаления из корзины");
  }

  const cart = await CartModel.findOne({ user: userId });
  if (!cart) throw ApiError.NotFound("Корзина не найдена");

  const itemIndex = cart.items.findIndex(item => item.productId.toString() === productId);
  if (itemIndex === -1) {
    throw ApiError.BadRequest("Продукт не найден в корзине");
  }

  if (cart.items[itemIndex].quantity <= quantity) {
    cart.items.splice(itemIndex, 1);
  } else {
    cart.items[itemIndex].quantity -= quantity;
  }

  await cart.save();
  return cart;
};

const clearCart = async (userId) => {
  const cart = await CartModel.findOne({ user: userId });
  if (!cart) throw ApiError.NotFound("Корзина не найдена");

  cart.items = [];
  await cart.save();
  return cart;
};

const getCart = async (userId) => {
  const cart = await CartModel.findOne({ user: userId }).populate("items.productId");
  if (!cart) throw ApiError.NotFound("Корзина не найдена");
  return cart;
};

module.exports = {
  addToCartProduct,
  removeFromCartProduct,
  clearCart,
  getCart,
};