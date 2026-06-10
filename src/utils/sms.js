const twilio = require('twilio');

let client = null;

const getTwilioClient = () => {
  if (client) return client;

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (accountSid && authToken) {
    client = twilio(accountSid, authToken);
  }
  return client;
};

const sendSMS = async ({ to, body }) => {
  try {
    const twilioClient = getTwilioClient();
    const from = process.env.TWILIO_PHONE_NUMBER;

    if (twilioClient && from) {
      console.log(`[SMS SERVICE] Dispatching real Twilio SMS to: ${to}`);
      const message = await twilioClient.messages.create({
        body,
        from,
        to
      });
      console.log(`[SMS SERVICE] SMS sent successfully. Message SID: ${message.sid}`);
      return message;
    } else {
      console.log(`\n======================================================================`);
      console.log(`[SMS SERVICE] Warning: Twilio credentials not configured in .env.`);
      console.log(`[SMS SERVICE] Simulated SMS content:`);
      console.log(`To: ${to}`);
      console.log(`Body: ${body}`);
      console.log(`======================================================================\n`);
      return { sid: 'simulated-sms-sid' };
    }
  } catch (err) {
    console.error(`[SMS SERVICE] Failed to send SMS to ${to}:`, err);
    throw err;
  }
};

module.exports = { sendSMS };
