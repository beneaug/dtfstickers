/**
 * Cart Checkout API
 * 
 * Handles checkout for multiple cart items in a single Stripe session.
 * Stores cart data in database due to Stripe metadata limits (500 chars).
 */

const { Pool } = require("pg");
const Stripe = require("stripe");
const { withRateLimit } = require("./middleware/rateLimit");
const { setCorsHeaders } = require("./lib/cors");
const { calculatePrice } = require("./lib/pricing");
const { captureException } = require("./lib/sentry");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Normalize gang sheet size format: "22" x 12"" -> "22x12"
function normalizeGangSheetSize(size) {
  if (!size) return "22x12";
  // Remove quotes, spaces, and standardize
  const normalized = size.replace(/["\s]/g, '').replace(/x/gi, 'x');
  // Handle common formats
  if (normalized.includes('x')) {
    const parts = normalized.split('x');
    if (parts.length === 2) {
      return `${parts[0]}x${parts[1]}`;
    }
  }
  return normalized;
}

// Read JSON body
async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

const handler = async (req, res) => {
  // CORS
  if (setCorsHeaders(req, res)) return;

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  }

  try {
    const body = await readJsonBody(req);
    const { items } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ error: "Cart is empty" }));
    }

    console.log(`Processing cart with ${items.length} items`);

    // Generate a unique cart ID
    const cartId = `cart_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Validate and calculate prices server-side
    const lineItems = [];
    const processedItems = [];
    let cartTotalCents = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      let unitPriceCents;
      let totalPriceCents;
      let name;
      let description;
      let normalizedSize;
      const qty = parseInt(item.quantity, 10) || 1;

      if (item.type === 'gang-sheet') {
        normalizedSize = normalizeGangSheetSize(item.sheetSize || item.size);
      } else {
        normalizedSize = item.size;
      }

      // Calculate price using shared pricing logic
      const priceResult = calculatePrice(
        item.type === 'gang-sheet' ? 'gang-sheet' : 'single-image',
        normalizedSize,
        qty
      );

      if (!priceResult) {
        console.error(`Invalid pricing for item ${i}: type=${item.type}, size=${normalizedSize}, qty=${qty}`);
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({ 
          error: `Invalid pricing for item ${i + 1} (${item.type} - ${normalizedSize})` 
        }));
      }

      unitPriceCents = priceResult.unitPriceCents;
      totalPriceCents = priceResult.totalPriceCents;

      if (item.type === 'gang-sheet') {
        name = item.name || `Gang Sheet (${normalizedSize})`;
        description = `${normalizedSize} gang sheet`;
        console.log(`Gang sheet ${i}: size=${normalizedSize}, unit=${unitPriceCents}, qty=${qty}, total=${totalPriceCents}`);
      } else {
        name = item.transferName || item.name || 'DTF Transfer';
        description = `${item.size} · Qty: ${qty}`;
        console.log(`Single image ${i}: size=${item.size}, unit=${unitPriceCents}, qty=${qty}, total=${totalPriceCents}`);
      }

      cartTotalCents += totalPriceCents;

      // Build file metadata
      // For gang sheets, we may have multiple files - store them as JSON
      let filesJson = '[]';
      if (item.uploadedFiles && item.uploadedFiles.length > 0) {
        // Gang sheet with multiple uploaded files
        filesJson = JSON.stringify(item.uploadedFiles.map(f => ({
          key: f.key,
          filename: f.filename,
          mimetype: f.mimetype,
        })));
        console.log(`Gang sheet ${i}: ${item.uploadedFiles.length} files`);
      } else if (item.fileKey) {
        // Single image with one file
        filesJson = JSON.stringify([{
          key: item.fileKey,
          filename: item.fileName || 'artwork',
          mimetype: item.fileType || 'image/png',
        }]);
      }

      // Create Stripe line item - attach metadata to product for webhook to retrieve
      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: {
            name: name,
            description: description,
            metadata: {
              cartItemIndex: String(i),
              itemType: item.type || 'single-image',
              size: normalizedSize,
              quantity: String(item.quantity || 1),
              garmentColor: item.garmentColor || '',
              transferName: item.transferName || item.name || '',
              notes: item.notes || '',
              // Store all files as JSON array (works for both single and multi-file)
              files: filesJson,
              // Store gang sheet layout data if present (for reconstruction)
              hasGangSheetData: item.gangSheetData ? 'true' : 'false',
            },
          },
          unit_amount: unitPriceCents,
        },
        quantity: parseInt(item.quantity, 10) || 1,
      });

      // Store processed item info (for reference - files already uploaded)
      // For uploaded gang sheets, ensure gangSheetData is set
      let itemGangSheetData = item.gangSheetData || null;
      if (item.type === 'gang-sheet' && !itemGangSheetData) {
        // If it's a gang sheet but no gangSheetData, it's likely an uploaded sheet
        // Mark it as uploaded-sheet
        itemGangSheetData = { type: 'uploaded-sheet' };
      }
      
      processedItems.push({
        id: item.id,
        type: item.type || 'single-image',
        name: name,
        size: normalizedSize,
        quantity: parseInt(item.quantity, 10) || 1,
        unitPriceCents,
        totalPriceCents,
        garmentColor: item.garmentColor || '',
        notes: item.notes || '',
        transferName: item.transferName || item.name || '',
        gangSheetData: itemGangSheetData,
        fileUrl: item.fileUrl || null, // S3 URL (already uploaded)
        fileKey: item.fileKey || null,
        fileName: item.fileName || null,
        fileType: item.fileType || null,
      });
    }

    console.log(`Cart total: ${cartTotalCents} cents`);

    // Create Stripe checkout session with minimal metadata
    // The full cart data will be stored client-side and sent after checkout
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "payment",
      success_url: `${process.env.STRIPE_SUCCESS_URL || 'https://www.12ozd.tf/thank-you'}?session_id={CHECKOUT_SESSION_ID}&cart_id=${cartId}`,
      cancel_url: `${process.env.STRIPE_CANCEL_URL || 'https://www.12ozd.tf/order'}?canceled=1`,
      shipping_address_collection: {
        allowed_countries: ["US", "CA"],
      },
      phone_number_collection: {
        enabled: true,
      },
      metadata: {
        cartId: cartId,
        itemCount: String(items.length),
        isCartOrder: 'true',
      },
    });

    console.log(`Created Stripe session: ${session.id}`);

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
      checkoutUrl: session.url,
      sessionId: session.id,
      cartId: cartId,
      processedItems: processedItems,
    }));

  } catch (err) {
    console.error("Cart checkout error:", err);
    captureException(err, { endpoint: '/api/cart-checkout' });
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ 
      error: "Failed to create checkout session",
      message: err.message,
    }));
  }
};

module.exports = withRateLimit(handler, {
  requests: 20,
  window: "1h",
});
