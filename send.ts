
const nodemailer = require('nodemailer');

async function sendEmail() {
    // Create transporter object using SMTP transport
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
            user: 'agronara24@gmail.com',
            pass: 'foqo rpae yded ohlh'
        },
        tls: {
            rejectUnauthorized: false
        },
        debug: true,
        logger: true,
        connectionTimeout: 30000, // Adding 30 second connection timeout
        greetingTimeout: 30000
    });

    try {
        // Verify SMTP connection configuration
        console.log("passed verify code");
        await transporter.verify();
        // Send mail with defined transport object
        const info = await transporter.sendMail({
            from: '"Trey Teichelman" <agronara24@gmail.com>',
            to: '"BBBBBBB" <aleksnadarpetkovic@gmail.com>',
            subject: 'Test Email from Bluehost SMTP',
            text: 'This is the plain text version of the email.',
            html: 'This is a test email sent using Bluehost SMTP and PHPMailer.'
        });

        console.log('Message has been sent successfully!');
        return info;
    } catch (error) {
        console.error('Message could not be sent. Error:', error);
        throw error;
    }
}

// Call the function
sendEmail().catch(console.error);