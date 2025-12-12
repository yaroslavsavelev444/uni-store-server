module.exports = {
  "leave-review": {
    required: ["listingId"]
  },
  "order-updated": {
    required: ["orderId", "status"]
  },
  "chat": {
    required: ["roomId"]
  },
  "login-from-new-device": {
    required: ["ip", "ua"]
  },
  "system": {
    required: []
  },
  "new_complaint_admin": {
    required: ["complaintId"]
  },
  "complaint_created": {
    required: ["status", "complaintId"]
  },
  "complaint_status_changed": {
    required: ["status", "complaintId"]
  }
};