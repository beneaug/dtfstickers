# 12ozstickers MVP (Next.js)

Conversion-first sticker ordering flow rebuilt as a mobile-first Next.js app.

## Run locally

From the repo root:

```bash
npm run local
```

That single command installs dependencies (if needed) and starts the dev server at `http://localhost:3000`.

Optional haptics debug audio:

```bash
NEXT_PUBLIC_HAPTICS_DEBUG=1 npm run dev
```

## What this ships

- One focused landing flow:
  - Headline: "Turn any photo into a premium sticker."
  - Subhead: "Upload → peel preview → order in 30 seconds."
  - One primary CTA initially: Upload photo
- Instant image upload preview with object URL
- Interactive peel preview over the uploaded image:
  - Main sticker layer clip-path peelback
  - Flipped flap layer (`scaleY(-1)`) with upward peel motion
  - SVG specular lighting (`feSpecularLighting` + `fePointLight`) tracking pointer/finger
  - Drag-to-reposition wrapper and dynamic shadow
- WebHaptics integration (`web-haptics/react`), gracefully degrading where unsupported:
  - `nudge` on first peel
  - custom micro-pattern `[6, 26, 5]` throttled during peel increase
  - `success` on snap/add-to-cart/checkout completion
- Quick options (size, quantity, finish), live pricing, and mock checkout modal

## Product assumptions (resolved without blocking)

- Checkout is intentionally client-only for MVP and does not process payments.
- Shipping is free over `$65`; otherwise a flat `$5.95`.
- Upload accepts `image/*` and uses `capture="environment"` for camera-friendly mobile behavior.

## Structure

```txt
app/
  page.tsx
  components/
    Uploader.tsx
    StickerPeelPreview.tsx
    OptionsPanel.tsx
    CheckoutModal.tsx
  lib/
    pricing.ts
    utils.ts
```

