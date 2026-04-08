const axios = require('axios');
const { v4: uuid } = require('uuid');
const ApiError = require('../exceptions/api-error');
const { yooApiUrl, DEFAULT } = require('../constants/checkout');

class YooCheckout {
    constructor(options) {
        this.options = options;
        this.shopId = this.options.shopId;
        this.secretKey = this.options.secretKey;
        this.debug = options.debug || DEFAULT.DEFAULT_DEBUG;
        this.root = yooApiUrl;

        // Basic Auth заголовок (аналогично curl -u shopId:secretKey из документации)
        // Теперь всё через Authorization, без метода authData()
        this.authHeader = `Basic ${Buffer.from(`${this.shopId}:${this.secretKey}`).toString('base64')}`;
    }

    buildQuery(filters) {
        const entries = Object.entries(filters);
        const queryString = entries.reduce((sum, [param, value], index) => (
            value && typeof value === 'object' && value.value && value.mode
                ? `${sum}${param}.${value.mode}=${value.value}${index < entries.length - 1 ? '&' : ''}`
                : `${sum}${param}=${value}${index < entries.length - 1 ? '&' : ''}`
        ), '?');
        return queryString === '?' ? '' : queryString;
    }

    normalizeFilter(filters) {
        if (!filters) {
            return {};
        }
        return { ...filters };
    }

    handleError(error, reqContext = null) {
        if (error instanceof ApiError) {
            throw error;
        }
        if (error.response) {
            // Ошибка от API ЮKassa
            const status = error.response.status;
            const apiErrorData = error.response.data;

            throw ApiError.create(
                status,
                apiErrorData.description || error.message,
                [{
                    code: apiErrorData.code,
                    parameter: apiErrorData.parameter,
                    type: apiErrorData.type
                }],
                reqContext
            );
        } else if (error.request) {
            // Ошибка сети/таймаут
            throw ApiError.GatewayError('Сервис ЮKassa недоступен', reqContext);
        } else {
            // Внутренняя ошибка
            throw ApiError.InternalServerError(error.message, reqContext);
        }
    }

    /**
     * Create payment
     * @see 'https://yookassa.ru/developers/api#create_payment'
     */
    async createPayment(payload, idempotenceKey = uuid()) {
        try {
            const options = {
                headers: {
                    'Authorization': this.authHeader,
                    'Idempotence-Key': idempotenceKey
                }
            };
            const { data } = await axios.post(`${this.root}/payments`, payload, options);
            return data;
        } catch (error) {
            this.handleError(error, { method: 'createPayment', payload });
        }
    }

    /**
     * Get payment by id
     * @see 'https://yookassa.ru/developers/api#get_payment'
     */
    async getPayment(paymentId) {
        try {
            const options = {
                headers: {
                    'Authorization': this.authHeader
                }
            };
            const { data } = await axios.get(`${this.root}/payments/${paymentId}`, options);
            return data;
        } catch (error) {
            this.handleError(error, { method: 'getPayment', paymentId });
        }
    }

    /**
     * Capture payment
     * @see 'https://yookassa.ru/developers/api#capture_payment'
     */
    async capturePayment(paymentId, payload, idempotenceKey = uuid()) {
        try {
            const options = {
                headers: {
                    'Authorization': this.authHeader,
                    'Idempotence-Key': idempotenceKey
                }
            };
            const { data } = await axios.post(`${this.root}/payments/${paymentId}/capture`, payload, options);
            return data;
        } catch (error) {
            this.handleError(error, { method: 'capturePayment', paymentId, payload });
        }
    }

    /**
     * Cancel payment
     * @see 'https://yookassa.ru/developers/api#cancel_payment'
     */
    async cancelPayment(paymentId, idempotenceKey = uuid()) {
        try {
            const options = {
                headers: {
                    'Authorization': this.authHeader,
                    'Idempotence-Key': idempotenceKey
                }
            };
            const { data } = await axios.post(`${this.root}/payments/${paymentId}/cancel`, {}, options);
            return data;
        } catch (error) {
            this.handleError(error, { method: 'cancelPayment', paymentId });
        }
    }

    /**
     * Get payment list
     * @see 'https://yookassa.ru/developers/api#get_payments_list'
     */
    async getPaymentList(filters = {}) {
        const f = this.normalizeFilter(filters);
        try {
            const options = {
                headers: {
                    'Authorization': this.authHeader
                }
            };
            const { data } = await axios.get(`${this.root}/payments${this.buildQuery(f)}`, options);
            return data;
        } catch (error) {
            this.handleError(error, { method: 'getPaymentList', filters });
        }
    }

    /**
     * Create refund
     * @see 'https://yookassa.ru/developers/api#create_refund'
     */
    async createRefund(payload, idempotenceKey = uuid()) {
        try {
            const options = {
                headers: {
                    'Authorization': this.authHeader,
                    'Idempotence-Key': idempotenceKey
                }
            };
            const { data } = await axios.post(`${this.root}/refunds`, payload, options);
            return data;
        } catch (error) {
            this.handleError(error, { method: 'createRefund', payload });
        }
    }

    /**
     * Get refund by id
     * @see 'https://yookassa.ru/developers/api#get_refund'
     */
    async getRefund(refundId) {
        try {
            const options = {
                headers: {
                    'Authorization': this.authHeader
                }
            };
            const { data } = await axios.get(`${this.root}/refunds/${refundId}`, options);
            return data;
        } catch (error) {
            this.handleError(error, { method: 'getRefund', refundId });
        }
    }

    /**
     * Get refund list
     * @see 'https://yookassa.ru/developers/api#get_refunds_list'
     */
    async getRefundList(filters = {}) {
        const f = this.normalizeFilter(filters);
        try {
            const options = {
                headers: {
                    'Authorization': this.authHeader
                }
            };
            const { data } = await axios.get(`${this.root}/refunds${this.buildQuery(f)}`, options);
            return data;
        } catch (error) {
            this.handleError(error, { method: 'getRefundList', filters });
        }
    }

    /**
     * Create receipt
     * @see 'https://yookassa.ru/developers/api#create_receipt'
     */
    async createReceipt(payload, idempotenceKey = uuid()) {
        try {
            const options = {
                headers: {
                    'Authorization': this.authHeader,
                    'Idempotence-Key': idempotenceKey
                }
            };
            const { data } = await axios.post(`${this.root}/receipts`, payload, options);
            return data;
        } catch (error) {
            this.handleError(error, { method: 'createReceipt', payload });
        }
    }

    /**
     * Get receipt by id
     * @see 'https://yookassa.ru/developers/api#get_receipt'
     */
    async getReceipt(receiptId) {
        try {
            const options = {
                headers: {
                    'Authorization': this.authHeader
                }
            };
            const { data } = await axios.get(`${this.root}/receipts/${receiptId}`, options);
            return data;
        } catch (error) {
            this.handleError(error, { method: 'getReceipt', receiptId });
        }
    }

    /**
     * Get receipt list
     * @see 'https://yookassa.ru/developers/api#get_receipts_list'
     */
    async getReceiptList(filters = {}) {
        const f = this.normalizeFilter(filters);
        try {
            const options = {
                headers: {
                    'Authorization': this.authHeader
                }
            };
            const { data } = await axios.get(`${this.root}/receipts${this.buildQuery(f)}`, options);
            return data;
        } catch (error) {
            this.handleError(error, { method: 'getReceiptList', filters });
        }
    }

    /**
     * Create webhook (только для партнёрской программы)
     * @see 'https://yookassa.ru/developers/api#create_webhook'
     */
    async createWebHook(payload, idempotenceKey = uuid()) {
        try {
            if (!this.options.token) {
                throw ApiError.UnauthorizedError({
                    method: 'createWebHook',
                    reason: 'No OAuth token provided'
                });
            }
            const options = {
                headers: {
                    'Idempotence-Key': idempotenceKey,
                    'Authorization': `Bearer ${this.options.token}`
                }
            };
            const { data } = await axios.post(`${this.root}/webhooks`, payload, options);
            return data;
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }
            this.handleError(error, { method: 'createWebHook', payload });
        }
    }

    /**
     * Get webhook list (только для партнёрской программы)
     * @see 'https://yookassa.ru/developers/api#get_webhook_list'
     */
    async getWebHookList() {
        try {
            if (!this.options.token) {
                throw ApiError.UnauthorizedError({
                    method: 'getWebHookList',
                    reason: 'No OAuth token provided'
                });
            }
            const options = {
                headers: { 'Authorization': `Bearer ${this.options.token}` }
            };
            const { data } = await axios.get(`${this.root}/webhooks`, options);
            return data;
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }
            this.handleError(error, { method: 'getWebHookList' });
        }
    }

    /**
     * Delete webhook (только для партнёрской программы)
     * @see 'https://yookassa.ru/developers/api#delete_webhook'
     */
    async deleteWebHook(id) {
        try {
            if (!this.options.token) {
                throw ApiError.UnauthorizedError({
                    method: 'deleteWebHook',
                    reason: 'No OAuth token provided'
                });
            }
            const options = {
                headers: { 'Authorization': `Bearer ${this.options.token}` }
            };
            await axios.delete(`${this.root}/webhooks/${id}`, options);
            return { success: true };
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }
            this.handleError(error, { method: 'deleteWebHook', webhookId: id });
        }
    }

    /**
     * Get shop info (только для партнёрской программы)
     * @see 'https://yookassa.ru/developers/api#get_me'
     */
    async getShop() {
        try {
            if (!this.options.token) {
                throw ApiError.UnauthorizedError({
                    method: 'getShop',
                    reason: 'No OAuth token provided'
                });
            }
            const options = {
                headers: { 'Authorization': `Bearer ${this.options.token}` }
            };
            const { data } = await axios.get(`${this.root}/me`, options);
            return data;
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }
            this.handleError(error, { method: 'getShop' });
        }
    }
}

module.exports = { YooCheckout };