const nodemailer = require('nodemailer');

let transporter = null;

// Initialize the mail transporter
const getTransporter = async () => {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && user && pass) {
    console.log(`[MAIL SERVICE] Using configured SMTP server: ${host}:${port}`);
    transporter = nodemailer.createTransport({
      host,
      port: parseInt(port, 10),
      secure: parseInt(port, 10) === 465,
      auth: {
        user,
        pass
      }
    });
  } else {
    console.log('[MAIL SERVICE] No SMTP credentials configured. Generating a temporary Ethereal mock SMTP account...');
    try {
      const testAccount = await nodemailer.createTestAccount();
      console.log(`[MAIL SERVICE] Ethereal account generated: ${testAccount.user}`);
      transporter = nodemailer.createTransport({
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        }
      });
    } catch (err) {
      console.error('[MAIL SERVICE] Failed to generate Ethereal mock account. Falling back to log-only transport.', err);
      // Fallback log-only transporter
      transporter = {
        sendMail: async (options) => {
          console.log(`\n--- FALLBACK MAIL DUMP ---`);
          console.log(`To: ${options.to}`);
          console.log(`Subject: ${options.subject}`);
          console.log(`Body: ${options.text || options.html}`);
          console.log(`--------------------------\n`);
          return { messageId: 'log-only-fallback' };
        }
      };
    }
  }

  return transporter;
};

const sendEmail = async ({ to, subject, text, html }) => {
  try {
    const client = await getTransporter();
    const from = process.env.SMTP_FROM || '"VidyaFlow Support" <no-reply@vidyaflow.com>';
    
    const info = await client.sendMail({
      from,
      to,
      subject,
      text,
      html
    });

    console.log(`[MAIL SERVICE] Email dispatched successfully to: ${to}. Message ID: ${info.messageId}`);
    
    // If Ethereal test account, print preview URL
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log(`\n======================================================================`);
      console.log(`[MAIL SERVICE] Real OTP Email sent to: ${to}`);
      console.log(`[MAIL SERVICE] Preview URL: ${previewUrl}`);
      console.log(`======================================================================\n`);
    }
    return info;
  } catch (err) {
    console.error(`[MAIL SERVICE] Failed to send email to ${to}:`, err);
    throw err;
  }
};

module.exports = { sendEmail };
