import type { EmailOrderData } from "../types/email.types.js";
import type { IOrder } from "../types/order.types.js";

export function mapOrderToEmailData(order: IOrder): EmailOrderData {
  const createdAt =
    order.createdAt instanceof Date ? order.createdAt : new Date();

  return {
    id: order._id.toString(),
    orderNumber: order.orderNumber,
    createdAt,
    status: order.status,
    items: order.items.map((item) => ({
      name: item.name || "Товар",
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
    })),
    pricing: {
      subtotal: order.pricing.subtotal,
      discount: order.pricing.discount,
      total: order.pricing.total,
      currency: order.pricing.currency,
    },
    recipient: {
      fullName: order.recipient.fullName,
      phone: order.recipient.phone,
      email: order.recipient.email,
    },
    delivery: {
      method: order.delivery.method,
      address: order.delivery.address,
      notes: order.delivery.notes,
    },
    cancellation: order.cancellation
      ? {
          reason: order.cancellation.reason,
          cancelledBy: order.cancellation.cancelledBy?.toString(),
          cancelledAt: order.cancellation.cancelledAt,
        }
      : undefined,
  };
}
