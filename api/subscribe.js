import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email is required' });
  }

  try {
    // Add contact directly
    const { data: contactData, error: contactError } = await resend.contacts.create({
      audienceId: process.env.RESEND_AUDIENCE_ID || 'default', // Fallback
      email: email,
      unsubscribed: false,
    });
    
    if (contactError) {
        console.error('Failed creating contact: ', contactError);
    }

    return res.status(200).json({ message: 'Subscribed successfully' });
  } catch (error) {
    console.error('Error subscribing:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}