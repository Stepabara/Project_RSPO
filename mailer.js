// mailer.js - настройка отправки писем
const nodemailer = require('nodemailer');
require('dotenv').config();

// Настройка транспорта для Gmail
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'ksc15356@gmail.com',
        pass: process.env.EMAIL_PASS // пароль приложения из Gmail
    }
});

// Проверка подключения
transporter.verify((error, success) => {
    if (error) {
        console.log('❌ Ошибка подключения к почте:', error);
    } else {
        console.log('✅ Почтовый сервер готов к отправке');
    }
});

// Функция отправки письма
async function sendEmail(to, subject, html) {
    try {
        const mailOptions = {
            from: '"ArmWrestle Pro" <ksc15356@gmail.com>',
            to: to,
            subject: subject,
            html: html
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ Письмо отправлено на ${to}:`, info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ Ошибка отправки письма:', error);
        return { success: false, error: error.message };
    }
}

module.exports = { sendEmail };