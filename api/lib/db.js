/**
 * Database connection and utilities
 */

import { neon } from '@neondatabase/serverless';

let sql = null;

/**
 * Get database connection
 */
export function getDb() {
  if (!sql) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    sql = neon(connectionString);
  }
  return sql;
}

/**
 * Insert a sticker order into the database
 */
export async function insertStickerOrder(orderData) {
  const sql = getDb();

  const result = await sql`
    INSERT INTO sticker_orders (
      job_name,
      material_id,
      material_name,
      size,
      cutting_id,
      cutting_name,
      quantity,
      notes,
      file_key,
      file_url,
      file_name,
      unit_price_cents,
      total_price_cents,
      stripe_session_id,
      cart_order_id
    ) VALUES (
      ${orderData.jobName},
      ${orderData.materialId},
      ${orderData.materialName},
      ${orderData.size},
      ${orderData.cuttingId},
      ${orderData.cuttingName},
      ${orderData.quantity},
      ${orderData.notes || null},
      ${orderData.fileKey},
      ${orderData.fileUrl},
      ${orderData.fileName},
      ${orderData.unitPriceCents},
      ${orderData.totalPriceCents},
      ${orderData.stripeSessionId},
      ${orderData.cartOrderId || null}
    )
    RETURNING id
  `;

  return result[0];
}

/**
 * Update order with customer details from Stripe webhook
 */
export async function updateOrderWithCustomerDetails(stripeSessionId, customerData) {
  const sql = getDb();

  await sql`
    UPDATE sticker_orders
    SET
      customer_email = ${customerData.email || null},
      customer_name = ${customerData.name || null},
      customer_phone = ${customerData.phone || null},
      shipping_address = ${customerData.shippingAddress ? JSON.stringify(customerData.shippingAddress) : null},
      status = 'completed'
    WHERE stripe_session_id = ${stripeSessionId}
  `;
}

/**
 * Get orders by cart ID
 */
export async function getOrdersByCartId(cartOrderId) {
  const sql = getDb();

  return await sql`
    SELECT * FROM sticker_orders
    WHERE cart_order_id = ${cartOrderId}
    ORDER BY created_at DESC
  `;
}

/**
 * Get order by Stripe session ID
 */
export async function getOrderByStripeSession(stripeSessionId) {
  const sql = getDb();

  const result = await sql`
    SELECT * FROM sticker_orders
    WHERE stripe_session_id = ${stripeSessionId}
    LIMIT 1
  `;

  return result[0] || null;
}
