# 12oz Stickers - Custom Sticker Ordering Platform

A modern, single-page configurator for custom sticker orders with real-time pricing, multi-dimensional options, and Stripe checkout integration.

## Features

- **Single-Page Configurator** - All options visible at once for optimal UX
- **8 Material Options** - Premium vinyl, glossy, matte, clear, holographic, glitter, metallic, economy
- **4 Cutting Styles** - Die-cut, kiss-cut, rectangle, circle
- **Interactive Size Slider** - 1" to 12" with live visual preview
- **Quantity Tier Discounts** - Up to 25% off for bulk orders
- **Real-Time Pricing** - Instant calculation as options change
- **Cart System** - Add multiple designs before checkout
- **File Upload** - Drag & drop with S3 storage
- **Stripe Integration** - Secure payment processing
- **Mobile Optimized** - Responsive design with sticky pricing

## Tech Stack

- **Frontend**: Vanilla JavaScript (ES6 modules), HTML5, CSS3
- **Backend**: Vercel Serverless Functions (Node.js)
- **Database**: Neon PostgreSQL
- **Storage**: AWS S3
- **Payments**: Stripe
- **Deployment**: Vercel

## Setup Instructions

### 1. Clone and Install

```bash
cd /path/to/12ozstickers
npm install
```

### 2. Environment Configuration

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Required environment variables:

- `DATABASE_URL` - Your Neon PostgreSQL connection string
- `AWS_ACCESS_KEY_ID` - AWS access key
- `AWS_SECRET_ACCESS_KEY` - AWS secret key
- `AWS_REGION` - AWS region (e.g., us-east-1)
- `AWS_S3_BUCKET` - Your S3 bucket name
- `STRIPE_SECRET_KEY` - Stripe secret key (sk_...)
- `STRIPE_PUBLISHABLE_KEY` - Stripe publishable key (pk_...)
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook secret (whsec_...)
- `BASE_URL` - Your site URL (for Stripe redirects)

### 3. Database Setup

Run the schema to create tables:

```bash
psql $DATABASE_URL < database/schema.sql
```

Or manually execute the SQL in `database/schema.sql` in your Neon dashboard.

### 4. S3 Bucket Configuration

1. Create an S3 bucket
2. Set CORS policy to allow uploads from your domain
3. Configure IAM user with PutObject permissions

Example CORS policy:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT", "POST"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": []
  }
]
```

### 5. Stripe Configuration

1. Get your API keys from Stripe Dashboard
2. Set up webhook endpoint: `https://yourdomain.com/api/stripe-webhook`
3. Subscribe to events: `checkout.session.completed`
4. Copy webhook signing secret to `.env`

### 6. Local Development

```bash
vercel dev
```

Visit `http://localhost:3000`

### 7. Deploy to Vercel

```bash
vercel --prod
```

## Project Structure

```
/Users/augustbenedikt/12ozstickers/
├── index.html              # Landing page
├── order.html              # Order configurator
├── order.js                # Order form logic
├── order.css               # Order page styles
├── styles.css              # Global styles
├── video-loader.js         # Landing page video loader
├── lib/
│   ├── sticker-config.js   # Product configuration
│   ├── sticker-pricing.js  # Pricing engine
│   ├── order-cart.js       # Cart management
│   └── cart-ui.js          # Cart drawer UI
├── api/
│   ├── upload-file.js      # S3 file upload endpoint
│   ├── orders.js           # Single order checkout
│   ├── cart-checkout.js    # Multi-item checkout
│   ├── stripe-webhook.js   # Stripe webhook handler
│   └── lib/
│       └── db.js           # Database utilities
├── database/
│   └── schema.sql          # PostgreSQL schema
├── .env.example            # Environment template
├── vercel.json             # Vercel config
└── package.json            # Dependencies

```

## Pricing Structure

### Base Prices (per sticker, single quantity)
- 1": $0.45 → 12": $5.40 (smooth progression)

### Material Modifiers
- Premium/Glossy/Matte Vinyl: Base price (1.0x)
- Clear Vinyl: +15% (1.15x)
- Holographic: +30% (1.3x)
- Metallic: +35% (1.35x)
- Glitter: +40% (1.4x)
- Economy: -30% (0.7x)

### Cutting Type Modifiers
- Die-cut: +$0.15 per sticker
- Kiss-cut: +$0.10 per sticker
- Rectangle/Circle: No extra charge

### Quantity Tiers
- 1-9: No discount
- 10-49: 10% off
- 50-99: 15% off
- 100-249: 20% off
- 250+: 25% off

**Formula:** `(base_size × material_mod + cutting_cost) × (1 - qty_discount) × quantity`

## API Endpoints

### POST /api/upload-file
Upload artwork to S3. Returns file URL and key.

**Request:** `multipart/form-data` with `file` field

**Response:**
```json
{
  "success": true,
  "url": "s3://bucket/path",
  "key": "path/to/file",
  "filename": "design.png"
}
```

### POST /api/orders
Create single order checkout session.

**Request:**
```json
{
  "jobName": "Brand Stickers",
  "material": "Premium Vinyl",
  "materialId": "premium-vinyl",
  "size": "3\"",
  "cutting": "Die Cut",
  "cuttingId": "die-cut",
  "quantity": 50,
  "notes": "Rush order",
  "fileUrl": "s3://...",
  "fileKey": "...",
  "fileName": "logo.png",
  "unitPriceCents": 120,
  "totalPriceCents": 6000
}
```

**Response:**
```json
{
  "checkoutUrl": "https://checkout.stripe.com/...",
  "sessionId": "cs_..."
}
```

### POST /api/cart-checkout
Create multi-item checkout session.

**Request:**
```json
{
  "items": [
    {
      "type": "sticker",
      "jobName": "...",
      "material": "...",
      "size": "...",
      "quantity": 25,
      "fileUrl": "...",
      "unitPriceCents": 100,
      "totalPriceCents": 2500
    }
  ]
}
```

### POST /api/stripe-webhook
Stripe webhook handler. Updates orders with customer details after payment.

## Customization

### Adding New Materials

Edit `/lib/sticker-config.js`:

```javascript
export const STICKER_MATERIALS = [
  // Add your material here
  {
    id: 'your-material-id',
    name: 'Your Material',
    subtitle: 'Description',
    description: 'Full description',
    priceModifier: 1.2, // 20% more expensive
    icon: '🎨',
    recommended: false,
    durability: 'outdoor',
    finish: 'your-finish'
  },
  // ...
];
```

### Adjusting Pricing

Edit `/lib/sticker-pricing.js`:

```javascript
const SIZE_BASE_PRICES = {
  1: 45,  // Adjust these values
  2: 65,
  // ...
};

const QUANTITY_TIERS = [
  { min: 1, max: 9, discount: 0 },
  { min: 10, max: 49, discount: 0.10 }, // Adjust discounts
  // ...
];
```

## Troubleshooting

### File Upload Fails
- Check S3 bucket CORS policy
- Verify AWS credentials in `.env`
- Check file size limit (50MB)

### Checkout Doesn't Work
- Verify Stripe keys in `.env`
- Check BASE_URL is set correctly
- Ensure database is accessible

### Orders Not Saving
- Run database schema: `psql $DATABASE_URL < database/schema.sql`
- Check DATABASE_URL connection string
- Verify Neon database is active

### Webhook Errors
- Set up webhook in Stripe Dashboard
- Copy signing secret to STRIPE_WEBHOOK_SECRET
- Ensure endpoint is publicly accessible

## Support

For issues or questions:
1. Check `.env` configuration
2. Review Vercel logs: `vercel logs`
3. Check database tables exist
4. Verify Stripe webhook is active

## License

Copyright 2026 12ozCollective. All rights reserved.
