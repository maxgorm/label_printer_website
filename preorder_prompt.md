# Sentimo Pre-Order Product Page + Stripe Integration Implementation Prompt

You are a senior full-stack product engineer, conversion-focused ecommerce designer, and careful implementation specialist. Build a production-ready pre-order system and product page for **Sentimo** on **sentimonotes.com**.

## Core goal

Implement a polished, trustworthy, high-converting **pre-order flow** for Sentimo that:
- clearly discloses that this is a **pre-order**
- states that **shipping is expected to begin in August 2026**
- states that if Sentimo is **unable to fulfill orders, customers will receive a full refund**
- integrates **Stripe Checkout** for payment collection
- reduces chargeback risk through strong customer communication and transparent checkout copy
- includes customer email confirmations and a pre-order update system
- is visually consistent with the current Sentimo landing page aesthetic

Use the current site style as the visual baseline:
- soft cream background
- dark navy primary text
- pink accent color
- minimal, premium, emotionally warm design
- clean modern typography
- rounded UI elements
- mobile-first responsive layout

## Product context

Sentimo is a paired physical messaging product: two small printers connected through the Sentimo mobile app so one person can send a note, doodle, or image that prints for the other person. The emotional angle matters more than technical jargon.

Do not position Sentimo as a generic printer product. Position it as a connection product.

## Existing business context

Use these facts consistently throughout the implementation:
- Brand name: **Sentimo**
- Legal entity: **Sentimo L.L.C.**
- Trademark footer language may reference: **“Sentimo™ is a trademark of Sentimo L.L.C.”**
- The product is sold as a **2-pack**
- Entry pricing can start at **$39 for 2 printers** if needed in teaser copy, but the implementation should support changing price easily from a config value
- Shipping messaging must say: **“Expected to begin shipping in August 2026”**
- Refund messaging must say: **“If we are unable to fulfill your order, you will receive a full refund.”**

## Compliance and risk requirements

Treat this as an internet pre-order flow that must be transparent and low-risk.

Implement the UX so the customer sees pre-order disclosures in **three places**:
1. product page near the call-to-action
2. checkout or immediately before checkout
3. Terms / Pre-Order Policy page

Write the system assuming the business should have a reasonable basis for the advertised shipping timeframe, and that if shipping is delayed beyond the promised timeframe, the customer must be notified and offered either the option to consent to the delay or cancel for a prompt refund.

Do not hide or bury these disclosures.

## Recommended technical approach

Use **Stripe** as the payment platform.

Preferred implementation:
- **Stripe Checkout** for the actual payment step
- create a product / price model that supports one-time pre-orders
- store order metadata including:
  - order type = pre-order
  - expected ship month = August 2026
  - product SKU
  - quantity
  - customer email
  - order status
  - fulfillment status
  - refund status
- use Stripe webhooks to mark orders paid
- store all successful pre-orders in the application database

Also implement:
- order confirmation page
- email confirmation after purchase
- internal admin-friendly order record schema
- clear support/refund messaging

Do **not** use delayed authorization/capture as the main default flow unless already available and robust in the existing stack. Assume the safer practical route is transparent upfront payment with clear refund rights, strong disclosure, and proactive updates.

## Stack assumptions

If the existing site already has a framework, extend it. Otherwise, implement in a clean modern web stack that is easy to deploy and maintain.

Preferred stack if needed:
- Next.js
- TypeScript
- Tailwind CSS
- Stripe Checkout + Stripe webhooks
- lightweight database integration such as Supabase / Postgres / Prisma if no existing DB is present
- Resend, Postmark, or SendGrid for transactional email

If there is already a CMS or backend, integrate cleanly instead of rebuilding unnecessarily.

## Assets and file organization

Assume assets can live in a standard public asset structure such as:

- `/public/images/products/hero-main.png`
- `/public/images/products/sentimo-pink-angle.png`
- `/public/images/products/sentimo-duo-pack.png`
- `/public/images/lifestyle/couple-desk-note.png`
- `/public/images/lifestyle/printed-note-closeup.png`
- `/public/images/brand/logo-sentimo.svg`
- `/public/images/brand/favicon.png`

Use the current hero image and related product shots where available. If exact assets are not present yet, create obvious placeholders and comments for replacement.

Also allow for:
- gallery images
- lifestyle imagery
- packaging mockups
- close-up detail shots
- optional FAQ illustrations or simple icons

## Required pages and flows

Build the following:

### 1. Main product / pre-order page
A premium long-form product page with:
- hero section
- benefits section
- “how it works” section
- product gallery
- pricing / pre-order CTA
- trust / transparency block
- FAQ
- footer

### 2. Stripe checkout launch flow
- CTA button should say **“Pre-Order Now”** or **“Reserve Your Sentimo”**
- button launches Stripe Checkout
- quantity selection supported
- customer email collected
- success URL and cancel URL configured

### 3. Confirmation page
Include:
- thank-you message
- order confirmed message
- reminder that this is a pre-order
- expected shipping month
- support email placeholder
- note that updates will be sent by email

### 4. Terms / Pre-Order Policy page
Include a dedicated policy section written in plain English.

### 5. Admin / data handling
At minimum:
- persist order records after webhook confirmation
- capture Stripe session ID, payment intent ID, amount, currency, email, quantity, timestamp
- mark order state with values like:
  - `pending`
  - `paid`
  - `refunded`
  - `fulfilled`
  - `canceled`

## Copy to use on the product page

Use or closely adapt the following copy. Improve wording only if needed for clarity, consistency, or conversion.

---

## HERO SECTION

### Headline
**Send a message.  
They feel it.**

### Subheadline
Connect with someone you love through little notes, doodles, and memories that print in their space.

### Body copy
Sentimo turns everyday messages into something physical. Send a note from the app, and it prints on your partner’s Sentimo printer in seconds.

### CTA buttons
Primary: **Pre-Order Now**  
Secondary: **See How It Works**

### Microcopy under CTA
**Pre-order now. Expected to begin shipping in August 2026.**  
**If we are unable to fulfill your order, you will receive a full refund.**

---

## TRUST / DISCLOSURE BLOCK NEAR CTA

### Section title
**Pre-order information**

### Copy
This product is currently available for pre-order. By placing an order, you understand that Sentimo is in pre-production and is expected to begin shipping in August 2026.

If manufacturing or logistics timelines change, we will keep you updated by email. If we are unable to fulfill your order, you will receive a full refund to your original payment method.

Add a required checkbox near checkout initiation with this exact or substantially similar text:
**I understand that this is a pre-order, that shipping is expected to begin in August 2026, and that I will be refunded if Sentimo is unable to fulfill my order.**

---

## HOW IT WORKS

### Section title
**How Sentimo works**

### Step 1
**Pair your printers**  
Each Sentimo set comes with two printers made to stay connected through the Sentimo app.

### Step 2
**Send something meaningful**  
Write a note, draw a doodle, or send a memory from your phone.

### Step 3
**It prints for them**  
Your message appears in their space as a real printed note they can keep.

---

## BENEFITS SECTION

### Section title
**Why it feels different**

### Benefit cards
**More than a text**  
A message they can actually hold onto.

**Built for connection**  
Designed for couples, long-distance relationships, and everyday closeness.

**Simple and instant**  
Send from the app. Print in their space.

**Made to keep**  
Little notes that end up on mirrors, desks, nightstands, and inside books.

---

## PRODUCT SECTION

### Section title
**What’s included**

### Copy
Each Sentimo set includes:
- 2 Sentimo printers
- starter paper
- charging cables
- quick setup materials

Add a note:
**Sold as a 2-pack so you can start using it together right away.**

---

## PRICING SECTION

### Section title
**Reserve your Sentimo**

### Price copy
**Starting at $39 for 2 printers**

### Supporting copy
Secure your Sentimo early and be part of our first production run.

### Pre-order note
This is a pre-order. Shipping is expected to begin in August 2026. If we are unable to fulfill your order, you will receive a full refund.

### CTA
**Pre-Order Now**

---

## FAQ SECTION

### FAQ 1
**Is this a pre-order?**  
Yes. Sentimo is currently available for pre-order.

### FAQ 2
**When will orders ship?**  
We currently expect shipping to begin in August 2026.

### FAQ 3
**What happens if timelines change?**  
If manufacturing or logistics timelines change, we will email customers with updates. If we cannot fulfill your order, you will receive a full refund.

### FAQ 4
**What comes in the box?**  
Each Sentimo set includes two printers plus starter materials so you can begin using them together.

### FAQ 5
**Do I pay now or later?**  
Customers complete payment at checkout to reserve a unit from the first production run.

### FAQ 6
**Can I cancel before it ships?**  
Yes. Pre-orders are fully refundable any time before shipment.

---

## FOOTER COPY

**Sentimo™ is a trademark of Sentimo L.L.C.**

Also include links for:
- FAQ
- Terms
- Pre-Order Policy
- Privacy Policy
- Contact / Support
- Instagram
- TikTok

## Pre-Order Policy page copy

Create a dedicated page called **Pre-Order Policy** with a clean, easy-to-read layout. Use this copy as the baseline:

### Title
**Pre-Order Policy**

### Intro
When you place a pre-order for Sentimo, you are reserving a unit from an upcoming production run.

### Section: Payment
Payment is collected at the time you place your pre-order.

### Section: Estimated shipping
We currently expect Sentimo pre-orders to begin shipping in August 2026. This is our estimated timeline, not a guaranteed delivery date.

### Section: Delays
Manufacturing, freight, customs, and fulfillment timelines can change. If there is a material delay to your order, we will notify you by email and provide an updated timeline. If required, customers will have the option to continue waiting or cancel for a refund.

### Section: Refunds
Pre-orders are fully refundable at any time before shipment. If Sentimo is unable to fulfill your order, you will receive a full refund to your original payment method.

### Section: Contact
If you have questions about your pre-order, contact us at: `support@sentimonotes.com`

## Email copy

Implement transactional email templates.

### 1. Order confirmation email
Subject:
**Your Sentimo pre-order is confirmed**

Body:
Hi {{first_name_or_customer}},

Thank you for reserving Sentimo.

Your pre-order has been received and confirmed. Sentimo is expected to begin shipping in August 2026.

We’ll send you updates as production progresses. If we are unable to fulfill your order, you will receive a full refund.

Order summary:
- Order number: {{order_number}}
- Product: Sentimo 2-Pack
- Quantity: {{quantity}}
- Amount paid: {{amount}}

If you have any questions, reply to this email or contact us at `support@sentimonotes.com`.

Thank you,  
Sentimo

### 2. Delay update email
Subject:
**Update on your Sentimo pre-order**

Body:
Hi {{first_name_or_customer}},

We wanted to share an update on your Sentimo pre-order.

Our shipping timeline has changed, and we now expect orders to begin shipping on or around {{updated_timeline}}.

If you would prefer not to wait, you may request a full refund before your order ships.

Thank you for your patience and support,  
Sentimo

### 3. Refund confirmation email
Subject:
**Your Sentimo refund has been processed**

Body:
Hi {{first_name_or_customer}},

Your refund for Sentimo has been processed to your original payment method.

Refund details:
- Order number: {{order_number}}
- Amount refunded: {{amount}}

Please allow your payment provider time to post the refund to your account.

Thank you,  
Sentimo

## UX requirements

- responsive and visually strong on desktop and mobile
- no clutter
- premium product storytelling
- pre-order disclosure must remain visible without feeling alarming
- strong trust design:
  - FAQ
  - timeline section
  - refund clarity
  - confirmation messaging
- use accessible contrast and semantic HTML
- make all important legal/disclosure text readable, not tiny

## Visual direction

Match the current Sentimo homepage shown in the reference:
- cream or warm off-white page background
- navy text
- pink accent
- large emotional headline
- rounded cards and image frames
- generous whitespace
- soft shadows
- clean footer
- modern DTC feel

Use product photos in:
- hero
- gallery
- “how it works”
- trust / lifestyle section

Potential section order:
1. hero
2. trust microcopy
3. how it works
4. benefits
5. gallery / lifestyle
6. what’s included
7. reserve / pre-order block
8. FAQ
9. footer

## Stripe integration requirements

Implement the following in full:

### Backend
- endpoint to create Stripe Checkout Session
- pass line items, quantity, success URL, cancel URL
- include metadata:
  - `product_slug=sentimo-2-pack`
  - `order_type=preorder`
  - `expected_ship=august-2026`
- verify webhook signatures
- handle at least:
  - `checkout.session.completed`
  - `payment_intent.succeeded`
  - `charge.refunded` or equivalent refund events

### Database
Create a pre-order orders table such as:

- id
- created_at
- updated_at
- stripe_checkout_session_id
- stripe_payment_intent_id
- stripe_customer_id
- email
- full_name
- product_slug
- quantity
- unit_price
- total_amount
- currency
- order_type
- expected_ship_label
- order_status
- fulfillment_status
- refund_status
- refund_amount
- marketing_opt_in
- shipping_name
- shipping_line1
- shipping_line2
- shipping_city
- shipping_state
- shipping_postal_code
- shipping_country
- notes

### Frontend checkout behavior
Before redirecting to Stripe Checkout:
- show pre-order disclosure
- require checkbox acceptance
- optionally collect email first for abandoned cart or save-progress flows
- disable CTA while session is creating
- handle error state gracefully

### Success page behavior
Display:
- order confirmation
- pre-order disclosure reminder
- expected ship month
- support contact
- next steps

## Quality bar

This should feel like a polished real launch, not a placeholder page.

Implement:
- reusable components
- clean design system
- strong spacing and typography
- SEO metadata for the pre-order page
- Open Graph image support
- analytics hooks for CTA clicks and checkout starts
- basic event tracking such as:
  - page_view_preorder
  - click_preorder_cta
  - checkout_started
  - checkout_completed

## Optional but strongly recommended

If easy within the current stack, also implement:
- inventory cap or “first production run” messaging
- basic email capture for people not ready to buy yet
- support for promo code field through Stripe Checkout
- admin export of preorder records to CSV
- support page or help email link
- simple announcement banner:
  - **Now accepting pre-orders**
  - **Expected to ship August 2026**

## Deliverables

Return:
1. all frontend code
2. all backend / API code
3. all Stripe integration code
4. environment variable template
5. setup instructions
6. any schema or migration files
7. final copy embedded in the implementation
8. notes on where to place or swap product image assets
9. a brief QA checklist
10. a short section explaining how to change price, date, and refund copy later from a central config

## Final implementation note

Prefer clarity and trust over hype. The page should convert, but it should also look responsible, transparent, and real.
