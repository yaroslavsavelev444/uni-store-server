const ApiError = require("../exceptions/api-error");
const { OrderModel, ProductModel, CompanyModel } = require("../models/index.models");
const { sendEmailNotification } = require("../queues/taskQueues");
const { getCart, clearCart } = require("./cartService");
const { archieveProduct } = require("./productService");
const path = require("path");
const fs = require("fs");

const getOrders = async (userData) => {
  try {
    const orders = await OrderModel.find({ user: userData.id })
    .populate("products.product")
    .populate("companyData.company")
    .sort({ createdAt: -1 });
    return orders;
  } catch (error) {
    throw ApiError.InternalServerError(error.message || "Произошла ошибка");
  }
};


//ТО ЧТО БЫЛО В ORDER SERVICE

const getOrdersAdmin = async () => {
  try {
    const orders = await OrderModel.find()
      .populate("products.product")
      .populate("user")
      .populate("companyData.company")
      .sort({ createdAt: -1 });
    return orders;
  } catch (error) {
    throw ApiError.InternalServerError(error.message || "Произошла ошибка");
  }
};

const getOrderAdmin = async (orderId) => {
  try {
    const order = await OrderModel.findById(orderId)
      .populate("products.product")
      .populate("user")
      .populate("companyData.company");
    return order;
  } catch (error) {
    throw ApiError.InternalServerError(error.message || "Произошла ошибка");
  }
}
const updateOrderStatus = async (orderId, status, userId) => {
  try {
    const order = await OrderModel.findById(orderId).populate("products.product", "title").populate("user", "email");
    order.status = status;
    order.statusHistory.push({
      status,
      changedAt: Date.now(),
      changedBy: userId,
    })

    if(status === 'ready' && order.deliveryMethod === 'pickup'){
      sendEmailNotification(order.user.email, "orderPickupReady", {
        order
      })
    }
    else if(status === 'sent' && order.deliveryMethod === 'delivery'){
      sendEmailNotification(order.user.email, "orderDeliverySent", {
        orderData: order.toObject(),
      })
    }
    return await order.save();
  } catch (error) {
    throw ApiError.InternalServerError(error.message || "Произошла ошибка");
  }
};

const uploadOrderFile = async (fileData, orderId) => {
  console.log("uploadOrderFile", fileData, orderId);
  const order = await OrderModel.findById(orderId).populate("user", "email");

  if (!order) {
    throw ApiError.NotFoundError("Заказ не найден");
  }

  order.file = {
    path: fileData.path,
    name: fileData.name,
  };

  await order.save();

  sendEmailNotification(order.user.email, "orderFileUploaded", {
    orderData: order.toObject(),
  });

  return order;
};

const deleteOrderFile = async (id) => {
  try {
    const orderData = await OrderModel.findById(id);

    if (!orderData) {
      throw ApiError.NotFoundError("Заказ не найден");
    }
    const filePath = path.resolve(process.cwd(), "src", "uploads", orderData.file.path);

    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    } else {
      console.warn("Файл не найден на диске:", filePath);
    }

    orderData.file = {
      path: "",
      name: "",
    };

    return await orderData.save();

  } catch (e) {
    throw ApiError.InternalServerError(e.message || "Ошибка загрузки продукта");
  }
};

const cancelOrderAdmin = async (orderId, text) => {
  try {
    const orderData = await OrderModel.findById(orderId).populate("user", "email").populate("products.product", "title");
    orderData.cancelData.cancelReason = text;
    orderData.cancelData.cancelDate = Date.now();
    orderData.status = "cancelled";
    const newOrderData = await orderData.save();

    sendEmailNotification(orderData.user.email, "orderCancelledByAdmin", {
      orderData: newOrderData.toObject(),
    });

    return;
  } catch (e) {
    throw ApiError.InternalServerError(e.message || "Ошибка загрузки продукта");
  }
};

const createOrder = async (userData, orderData) => {
  if (!userData.id) throw ApiError.BadRequest("User ID обязателен");

  const { items, totalPrice, totalPriceWithoutDiscount } = await getCart(
    userData.id
  );

  if (!items.length)
    throw ApiError.BadRequest("Корзина пуста или товары недоступны");

  let company = null;
  if (orderData.isCompany && orderData.companyData) {

    
   let company = await CompanyModel.findOne({ user: userData.id });
if (!company) {
  const companyDataWithUser = {
    ...orderData.companyData,
    user: userData.id,
  };

  company = await CompanyModel.create(companyDataWithUser);
}
  }

  const orderPayload = {
    user: userData.id,
    deliveryMethod: orderData.deliveryMethod,
    deliveryData: {
      tk: orderData.deliveryData.tk,
      address: orderData.deliveryData.address,
      comment: orderData.deliveryData.comment,
    },
    recipientData: orderData.recipientData,
    priceDetails: {
      totalPrice: totalPriceWithoutDiscount,
      totalPriceWithDiscount: totalPrice,
    },
    isCompany: orderData.isCompany,
    companyData: company ? { company: company._id } : undefined,
    products: items.map((item) => ({
      product: item.productId,
      quantity: item.quantity,
      price: item.originalPrice,
      priceWithDiscount: item.priceWithDiscount,
      totalPrice: item.totalWithoutDiscount,
      totalPriceWithDiscount: item.totalWithDiscount,
    })),

    statusHistory: [
      {
        status: "created",
        changedAt: Date.now(),
        changedBy: userData.id,
        
      },
    ],
  };

  const createdOrder = await OrderModel.create(orderPayload);

  await clearCart(userData.id);

  await Promise.all(
    items.map(async (item) => {
      const product = await ProductModel.findById(item.productId);
      product.totalQuantity -= item.quantity;
      await product.save();

      if (product.totalQuantity >= 0 && product.status !== "archived") {
        await archieveProduct(product._id);
        await sendEmailNotification(process.env.SMTP_USER, "productArchived", {
          productData: product.toObject(),
        });
      }
    })
  );

  //Отправляем на почту админу
  await sendEmailNotification(process.env.SMTP_USER, "newOrderAdmin", {
    orderData: orderPayload,
  }, true);

  //Отправляем на почту юзеру
  await sendEmailNotification(userData.email, "newOrderUser", {
    orderData: orderPayload,
  });

  return createdOrder;
};
module.exports = {
  updateOrderStatus,
  uploadOrderFile,
  getOrdersAdmin,
  cancelOrderAdmin,
  getOrders,
  createOrder,
  deleteOrderFile,
  getOrderAdmin
};
