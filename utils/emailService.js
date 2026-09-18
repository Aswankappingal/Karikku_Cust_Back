require('dotenv').config();
// const nodemailer = require('nodemailer');

// Configure the transporter
/*
const transporter = nodemailer.createTransport({
    service: 'gmail', // Use 'gmail' or your preferred service (e.g., SendGrid, Mailgun)
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});
*/

/**
 * Send an email confirmation for a successfully placed order
 * @param {string} userEmail - The recipient's email address
 * @param {object} orderDetails - Object containing order info (orderId, amount, items)
 */
const sendOrderConfirmationEmail = async (userEmail, orderDetails) => {
    console.log('Email sending functionality is currently commented out.');
    /*
    if (!userEmail) {
        console.log('No user email provided for order confirmation.');
        return;
    }

    const { orderId, totalAmount, items } = orderDetails;

    // A basic HTML template for the order confirmation
    const mailOptions = {
        from: `"KARIKKU" <${process.env.EMAIL_USER}>`,
        to: userEmail,
        subject: `Order Confirmation - KARIKKU (Order #${orderId})`,
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #4CAF50;">Thank you for your order!</h2>
                <p>Hi there,</p>
                <p>Your order <strong>#${orderId}</strong> has been successfully placed.</p>
                <p><strong>Total Amount:</strong> ₹${totalAmount}</p>
                <p>We'll notify you again when your order is on its way!</p>
                <br />
                <p>Best regards,</p>
                <p><strong>The KARIKKU Team</strong></p>
            </div>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`Order confirmation email sent to ${userEmail}: ${info.messageId}`);
    } catch (error) {
        console.error('Error sending order confirmation email:', error);
    }
    */
};

/**
 * Send an email notification when an order is in transit
 * @param {string} userEmail - The recipient's email address
 * @param {object} orderDetails - Object containing order info (orderId)
 */
const sendOrderInTransitEmail = async (userEmail, orderDetails) => {
    console.log('Email sending functionality is currently commented out.');
    /*
    if (!userEmail) {
        console.log('No user email provided for in-transit notification.');
        return;
    }

    const { orderId } = orderDetails;

    const mailOptions = {
        from: `"KARIKKU" <${process.env.EMAIL_USER}>`,
        to: userEmail,
        subject: `Your Order is In Transit! - KARIKKU (Order #${orderId})`,
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #4CAF50;">Good News! Your order is on the way.</h2>
                <p>Hi there,</p>
                <p>Your order <strong>#${orderId}</strong> is now in transit and will be reaching you soon.</p>
                <p>Please keep an eye out for our delivery partner.</p>
                <br />
                <p>Best regards,</p>
                <p><strong>The KARIKKU Team</strong></p>
            </div>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`In-transit email sent to ${userEmail}: ${info.messageId}`);
    } catch (error) {
        console.error('Error sending in-transit email:', error);
    }
    */
};

module.exports = {
    sendOrderConfirmationEmail,
    sendOrderInTransitEmail
};

