const { default: mongoose } = require("mongoose");
const ApiError = require("../exceptions/api-error");
const { ProductModel, CartModel } = require("../models/index.models");

const setCartItem = async (userId, productId, quantity) => {
  if (!userId || !productId || quantity < 0) {
    console.log(userId, productId, quantity);
    throw ApiError.BadRequest("Некорректные данные для обновления корзины");
  }

  const product = await ProductModel.findById(productId);
  if (!product) throw ApiError.NotFoundError("Продукт не найден");

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


const deleteItem = async (userId, productId) => {
console.log(userId, productId);

  const cartData = await CartModel.findOne({ user: userId });
  if (!cartData) return null;

  // Фильтруем все элементы, кроме удаляемого
  cartData.items = cartData.items.filter(
    (item) => item.productId.toString() !== productId.toString()
  );

  await cartData.save();

  return cartData;
};

const removeFromCartProduct = async (userId, productId, quantity) => {
  if (!userId || !productId || quantity < 1) {
    throw ApiError.BadRequest("Некорректные данные для удаления из корзины");
  }

  const cart = await CartModel.findOne({ user: userId });
  if (!cart) throw ApiError.NotFoundError("Корзина не найдена");

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
  if (!cart) throw ApiError.NotFoundError("Корзина не найдена");

  cart.items = [];
  await cart.save();
  return cart;
};

const getCart = async (userId) => {
  console.log('getCart', userId);
  const cart = await CartModel.findOne({ user: userId }).populate("items.productId");
  if (!cart) throw ApiError.NotFoundError("Корзина не найдена");

  let totalPrice = 0;
  let totalPriceWithoutDiscount = 0;
  const validItems = [];

  for (const item of cart.items) {
    const product = item.productId;

    if (!product) continue; // товар удалён

    const originalQuantity = item.quantity;
    let quantity = originalQuantity;

    if (product.totalQuantity === 0) continue; // товар закончился

    if (quantity > product.totalQuantity) {
      quantity = product.totalQuantity;
    }

    const unitPrice = product.priceIndividual;

    // Новая логика скидки: сначала проверка hasDiscount
    const discountApplies = product.hasDiscount && quantity >= product.discountFromQuantity;
    const discount = discountApplies ? product.discountPersentage / 100 : 0;
    const priceWithDiscount = +(unitPrice * (1 - discount)).toFixed(2);

    const totalWithoutDiscount = unitPrice * quantity;
    const totalWithDiscount = +(priceWithDiscount * quantity).toFixed(2);

    totalPriceWithoutDiscount += totalWithoutDiscount;
    totalPrice += totalWithDiscount;

    validItems.push({
      productId: product,
      quantity,
      originalPrice: unitPrice,
      priceWithDiscount,
      totalWithoutDiscount,
      totalWithDiscount,
      discountApplied: discountApplies,
      wasQuantityReduced: quantity < originalQuantity,
    });
  }

  // Сохраняем изменения в корзине
  cart.items = validItems.map(({ productId, quantity }) => ({
    productId: productId._id,
    quantity,
  }));
  await cart.save();

  return {
    items: validItems,
    totalPrice,
    totalPriceWithoutDiscount,
    discountTotal: +(totalPriceWithoutDiscount - totalPrice).toFixed(2),
  };
};
module.exports = {
  removeFromCartProduct,
  clearCart,
  setCartItem,
  getCart,
  deleteItem
};