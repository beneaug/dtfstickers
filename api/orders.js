/**
 * Sticker Orders API Endpoint
 * Handles creating Stripe checkout sessions for sticker orders
 */

import Stripe from 'stripe';
import { insertStickerOrder } from './lib/db.js';

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' })
  : null;

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      jobName,
      material,
      materialId,
      size,
      cutting,
      cuttingId,
      quantity,
      notes,
      fileUrl,
      fileKey,
      fileName,
      unitPriceCents,
      totalPriceCents
    } = req.body;

    // Validate required fields
    if (!jobName || !material || !materialId || !size || !cutting || !cuttingId || !quantity) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!fileUrl || !fileKey || !fileName) {
      return res.status(400).json({ error: 'File must be uploaded before checkout' });
    }

    if (!unitPriceCents || !totalPriceCents) {
      return res.status(400).json({ error: 'Pricing information required' });
    }

    // Validate quantities and prices
    if (quantity < 1 || quantity > 9999) {
      return res.status(400).json({ error: 'Invalid quantity' });
    }

    if (unitPriceCents < 0 || totalPriceCents < 0) {
      return res.status(400).json({ error: 'Invalid pricing' });
    }

    if (!stripe) {
      return res.status(500).json({ error: 'Stripe not configured' });
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Custom Stickers: ${jobName}`,
              description: `${size} · ${material} · ${cutting} · Qty: ${quantity}`,
              metadata: {
                type: 'sticker',
                jobName,
                material,
                size,
                cutting,
                quantity: String(quantity)
              }
            },
            unit_amount: unitPriceCents
          },
          quantity: quantity
        }
      ],
      success_url: `${process.env.BASE_URL || 'http://localhost:3000'}/thank-you?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.BASE_URL || 'http://localhost:3000'}/order?canceled=1`,
      metadata: {
        type: 'sticker',
        jobName,
        materialId,
        material,
        size,
        cuttingId,
        cutting,
        quantity: String(quantity),
        fileKey,
        fileUrl,
        fileName
      }
    });

    // Insert order into database
    await insertStickerOrder({
      jobName,
      materialId,
      materialName: material,
      size,
      cuttingId,
      cuttingName: cutting,
      quantity: parseInt(quantity, 10),
      notes: notes || null,
      fileKey,
      fileUrl,
      fileName,
      unitPriceCents: parseInt(unitPriceCents, 10),
      totalPriceCents: parseInt(totalPriceCents, 10),
      stripeSessionId: session.id,
      cartOrderId: null
    });

    return res.status(200).json({
      checkoutUrl: session.url,
      sessionId: session.id
    });
  } catch (error) {
    console.error('Order creation failed:', error);
    return res.status(500).json({
      error: 'Failed to create order',
      message: error.message
    });
  }
}
