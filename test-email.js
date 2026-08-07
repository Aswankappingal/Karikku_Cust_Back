require('dotenv').config();
const { sendOrderConfirmationEmail } = require('./utils/emailService');

async function test() {
    console.log('EMAIL_USER:', process.env.EMAIL_USER);
    console.log('EMAIL_PASSWORD:', process.env.EMAIL_PASSWORD);
    console.log('EMAIL_PASS:', process.env.EMAIL_PASS);
    
    await sendOrderConfirmationEmail('test@example.com', {
        orderId: 'TEST-123',
        totalAmount: 999,
        items: []
    });
}
test();
