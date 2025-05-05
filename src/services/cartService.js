const ApiError = require("../exceptions/api-error");
const { ProductModel, CartModel } = require("../models/indexModels");

const setCartItem = async (userId, productId, quantity) => {
  if (!userId || !productId || quantity < 0) {
    console.log(userId, productId, quantity);
    throw ApiError.BadRequest("Некорректные данные для обновления корзины");
  }

  const product = await ProductModel.findById(productId);
  if (!product) throw ApiError.NotFound("Продукт не найден");

  if (quantity > product.totalQuantity) {
    throw ApiError.BadRequest("Недостаточно товара в наличии");
  }

  let cart = await CartModel.findOne({ user: userId });
  if (!cart) {
    if (quantity === 0) return null; // нет смысла создавать корзину ради удаления
    cart = new CartModel({ user: userId, items: [] });
  }

  const itemIndex = cart.items.findIndex(item => item.productId.toString() === productId);

  if (quantity === 0) {
    if (itemIndex !== -1) {
      cart.items.splice(itemIndex, 1);
    }
    // Если корзина пуста после удаления — можно добавить очистку, если надо
  } else {
    const itemData = {
      productId,
      quantity,
      price: product.priceIndividual,
    };

    if (itemIndex === -1) {
      cart.items.push(itemData);
    } else {
      cart.items[itemIndex] = itemData;
    }
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
  console.log(cart);
  if (!cart) throw ApiError.NotFound("Корзина не найдена");

  return cart;
};

module.exports = {
  removeFromCartProduct,
  clearCart,
  setCartItem,
  getCart,
};