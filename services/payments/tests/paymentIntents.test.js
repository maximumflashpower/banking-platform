// services/payments/tests/paymentIntents.test.js

const request = require('supertest');
const app = require('../../../../app'); // Asegúrate de que app.js esté configurado correctamente

describe('Payment Intents API', () => {
    it('should create a new Payment Intent', async () => {
        const response = await request(app)
            .post('/public/v1/finance/payment-intents')
            .send({
                amount: 100,
                currency: 'USD',
                idempotency_key: 'unique-key-123',
                correlation_id: 'correlation-123'
            });

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('id');
        expect(response.body.amount).toBe(100);
    });

    it('should cancel an existing Payment Intent', async () => {
        // Create a Payment Intent first
        const createResponse = await request(app)
            .post('/public/v1/finance/payment-intents')
            .send({
                amount: 100,
                currency: 'USD',
                idempotency_key: 'unique-key-123',
                correlation_id: 'correlation-123'
            });

        const paymentIntentId = createResponse.body.id;

        // Now cancel the created Payment Intent
        const cancelResponse = await request(app)
            .post(`/public/v1/finance/payment-intents/${paymentIntentId}/cancel`);

        expect(cancelResponse.status).toBe(200);
        expect(cancelResponse.body.state).toBe('canceled');
    });
});