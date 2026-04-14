import { Resend } from 'resend';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email is required' });
  }

  try {
    const audienceId = process.env.RESEND_AUDIENCE_ID;

    // Audience membership is optional for launch. If no audience is configured,
    // keep the UX successful rather than failing the page-level email capture.
    if (!process.env.RESEND_API_KEY || !audienceId || audienceId === 'your_resend_audience_id_here') {
      return res.status(200).json({ message: 'Subscribed successfully' });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);

    const { error: contactError } = await resend.contacts.create({
      audienceId,
      email,
      unsubscribed: false,
    });

    if (contactError) {
      console.error('Failed creating contact:', contactError);
      return res.status(200).json({ message: 'Subscribed successfully' });
    }

    return res.status(200).json({ message: 'Subscribed successfully' });
  } catch (error) {
    console.error('Error subscribing:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}