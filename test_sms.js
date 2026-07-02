require('dotenv').config();
const { sendSMS } = require('./src/utils/sms');

async function runTest() {
  console.log('--- SMS Sending Test ---');
  console.log('TWILIO_ACCOUNT_SID:', process.env.TWILIO_ACCOUNT_SID);
  console.log('TWILIO_PHONE_NUMBER (Sender):', process.env.TWILIO_PHONE_NUMBER);
  console.log('Target recipient: 8982891357');

  try {
    const result = await sendSMS({
      to: '+918982891357', // Assuming Indian country code (+91) for the 10-digit number
      body: 'Hello from VidhyaFlow! This is a test message.'
    });
    console.log('Test execution finished successfully:', result);
  } catch (error) {
    console.error('Test execution failed with error:', error);
  }
}

runTest();
