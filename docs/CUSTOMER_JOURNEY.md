# Customer Journey — WhatsApp Business Types

> Each business type has a tailored AI experience. The customer interacts entirely through WhatsApp.
> Screenshots of real chats can be appended to each section.

---

## Table of Contents

1. [Logistics / Courier](#1-logistics--courier)
2. [Restaurant](#2-restaurant)
3. [Hotel](#3-hotel)
4. [Hotel + Restaurant](#4-hotel--restaurant)
5. [General Business (Catalogue)](#5-general-business-catalogue)

---

## 1. Logistics / Courier

**Business types:** `logistics_delivery`, `courier`

### Tools available
- `search_offerings` — search delivery services
- `get_delivery_zones` — list zones + pricing
- `preview_delivery_order` — create order preview with Confirm/Edit/Cancel
- `get_order_by_number` — track order status
- `get_customer_orders` — list customer's order history
- `check_working_hours` — business hours

### Journey

#### Step 1 — Customer initiates
```
Customer: I need to send a package from Westlands to CBD
```

#### Step 2 — AI searches services + pricing
```
AI calls: search_offerings(query="package delivery")
AI calls: get_delivery_zones()

AI:
📦 *Delivery Services*

1. *Same-Day Delivery* — KES 350
   Fast pickup and drop within the city

2. *Express Delivery* — KES 500
   Priority delivery within 2 hours

*Zones:*
• CBD — KES 200
• Westlands — KES 250
• Karen — KES 400

What would you like to send and from where?
```

#### Step 3 — AI collects details
```
Customer: 2 boxes, from Westlands to CBD

AI calls: preview_delivery_order(
  items=["2 boxes"],
  pickup_location="Westlands",
  dropoff_location="CBD",
  zone_type="CBD",
  weight_kg=5
)
```

#### Step 4 — Preview with buttons
```
AI:
📝 *Delivery Order Preview*

*From:* Westlands
*To:* CBD
*Zone:* CBD
*Items:*
• 2 boxes

*Total:* KES 200

[✅ Confirm]  [✏️ Edit]  [❌ Cancel]
```

#### Step 5 — Customer confirms
```
Customer taps: ✅ Confirm
```
Handler creates order via `next_order_number()` RPC, assigns best available rider.

#### Step 6 — Order confirmation
```
AI:
✅ *Order Confirmed!*

*Order #:* ORD-00042
*Items:*
• 2 boxes

*From:* Westlands
*To:* CBD
*Zone:* CBD
*Total:* KES 200
*Rider:* John M.
```

#### Step 7 — Payment details
```
AI:
💳 *Payment Details*

*Amount:* KES 200
*Ref:* ORD-00042

*Payment Methods:*
• *M-Pesa Till* (M-Pesa Till)
  Till: 123456

Forward your payment confirmation message once paid.
```

#### Step 8 — Customer checks status later
```
Customer: Where is my order?

AI calls: get_customer_food_orders(phone="+254...")

AI:
Your order *ORD-00042* (KES 200) is currently *confirmed*.
Rider: John M.
Placed just now.
```

#### Step 9 — Rider updates status
Rider marks as `delivered` from their inbox → customer gets notified.

---

[Insert chat screenshot here]

---

## 2. Restaurant

**Business types:** `restaurant`

### Tools available
- `search_menu_items` — search menu (paginated, 10 per page)
- `get_menu_item` — single item details + image
- `preview_food_order` — create food order with Confirm/Edit/Cancel
- `preview_reservation` — create table reservation
- `get_customer_food_orders` — order history
- `check_working_hours` — business hours

### Journey — Food Order

#### Step 1 — Customer asks for menu
```
Customer: What's on the menu?
```

#### Step 2 — AI shows first 10 items (paginated)
```
AI calls: search_menu_items(query="", offset=0)

AI:
🍽️ *Menu*

1. *Chicken Biryani* — KES 450
   Tender chicken with aromatic rice, served with raita

2. *Beef Burger* — KES 380
   Double patty with cheese, lettuce, and house sauce

3. *Caesar Salad* — KES 280
   Fresh romaine lettuce with parmesan and croutons

... (8 more items)

Do you want to see more?

[See More →]
```

#### Step 3 — Customer taps "See More" (NO AI — direct handler)
```
Customer taps: [See More →]
```
Handler reads search params from conversation metadata, calls `searchMenuItems()` directly.

```
AI:
📋 *Menu (continued)*

11. *Fish & Chips* — KES 420
    Crispy battered fish with golden fries

12. *Pasta Carbonara* — KES 380
    Classic Italian with bacon and cream sauce

... (8 more items)

Do you want to see more?

[See More →]
```

#### Step 4 — Customer picks items
```
Customer: I want 2 Biryani and 1 Burger
```

#### Step 5 — AI creates order preview
```
AI calls: search_menu_items(query="Biryani")  ← to get prices
AI calls: search_menu_items(query="Burger")
AI calls: preview_food_order(items=[...], order_type="takeaway")
```

#### Step 6 — Preview with image + buttons
```
AI:
📷 [Image of Chicken Biryani]

📝 *Order Summary*

• 2× Chicken Biryani @ KES 450 = KES 900
• 1× Beef Burger @ KES 380 = KES 380

💰 *Total: KES 1280*

Type: Takeaway

[✅ Confirm]  [✏️ Edit]  [❌ Cancel]
```

#### Step 7 — Customer confirms
```
Customer taps: ✅ Confirm
```
Handler creates order via `next_order_number()` RPC.

#### Step 8 — Confirmation + payment
```
AI:
✅ *Order Confirmed!*

*Order #:* ORD-00087
*Type:* Takeaway
*Items:*
• 2× Chicken Biryani
• 1× Beef Burger

*Total:* KES 1280

Your order is being prepared. We'll notify you when it's ready!

---

💳 *Payment Details*

*Amount:* KES 1280
*Ref:* ORD-00087

*Payment Methods:*
• *M-Pesa Till* (M-Pesa Till)
  Till: 123456

Forward your payment confirmation message once paid.
```

#### Step 9 — Customer tracks order
```
Customer: Where's my food?

AI calls: get_customer_food_orders(phone="+254...")

AI:
Your order *ORD-00087* (KES 1280) is currently *confirmed*.
Type: Takeaway
Placed just now.
```

---

### Journey — Table Reservation

#### Step 1 — Customer wants to reserve
```
Customer: I want to reserve a table for 4 on Saturday at 7pm
```

#### Step 2 — AI collects details
```
AI calls: preview_reservation(
  guest_name="Customer Name",
  party_size=4,
  date="2026-09-13",
  time="19:00"
)
```

#### Step 3 — Preview with buttons
```
AI:
📝 *Reservation Preview*

*Guest:* Customer Name
*Party Size:* 4
*Date:* Saturday, Sep 13
*Time:* 7:00 PM

[✅ Confirm]  [✏️ Edit]  [❌ Cancel]
```

#### Step 4 — Customer confirms → confirmation message

---

[Insert chat screenshot here]

---

## 3. Hotel

**Business types:** `hotel`

### Tools available
- `search_rooms` — search rooms (paginated, 10 per page)
- `get_room` — single room details + images
- `preview_booking` — create booking with Confirm/Edit/Cancel
- `get_customer_bookings` — booking history
- `check_working_hours` — business hours

### Journey

#### Step 1 — Customer asks for rooms
```
Customer: What rooms do you have?
```

#### Step 2 — AI shows first 10 rooms (paginated)
```
AI calls: search_rooms(offset=0)

AI:
🏨 *Available Rooms*

1. *Standard Single* — KES 3,000/night
   👥 Up to 1 guest | 🛏️ Single
   ✨ WiFi, TV

2. *Deluxe Double* — KES 5,500/night
   👥 Up to 2 guests | 🛏️ Queen
   ✨ WiFi, TV, Mini Bar, Pool View

3. *Executive Suite* — KES 8,000/night
   👥 Up to 2 guests | 🛏️ King
   ✨ WiFi, TV, Mini Bar, Ocean View, Jacuzzi

... (7 more rooms)

Do you want to see more?

[See More →]
```

#### Step 3 — Customer taps "See More" (NO AI — direct handler)
```
Customer taps: [See More →]
```

```
AI:
🏨 *Available Rooms*

11. *Family Room* — KES 7,000/night
    👥 Up to 4 guests | 🛏️ 2 Queens
    ✨ WiFi, TV, Mini Bar, Playground View

12. *Presidential Suite* — KES 15,000/night
    👥 Up to 3 guests | 🛏️ King
    ✨ WiFi, TV, Full Bar, Private Pool, Butler Service

That's all we have available!
```

#### Step 4 — Customer picks a room
```
Customer: Tell me more about the Deluxe Double
```

#### Step 5 — AI shows full details
```
AI calls: get_room(room_id="...")

AI:
📷 [Image of Deluxe Double]

🛏️ *Deluxe Double*

*Price:* KES 5,500/night
*Max Guests:* 2
*Bed Type:* Queen
*Room Size:* 35 sqm
*Amenities:* WiFi, TV, Mini Bar, Pool View

*Check-in:* 2:00 PM
*Check-out:* 11:00 AM
*Cancellation:* Free cancellation up to 24 hours before check-in

Would you like to book this room?
```

#### Step 6 — Customer wants to book
```
Customer: Yes, book it for Sep 15-17, 2 guests
```

#### Step 7 — AI creates booking preview
```
AI calls: preview_booking(
  room_id="...",
  guest_name="Customer Name",
  check_in_date="2026-09-15",
  check_out_date="2026-09-17",
  guests=2
)
```

#### Step 8 — Preview with image + buttons
```
AI:
📷 [Image of Deluxe Double]

📝 *Booking Summary*

*Room:* Deluxe Double
*Guest:* Customer Name
*Check-in:* Mon, Sep 15
*Check-out:* Wed, Sep 17
*Nights:* 2
*Guests:* 2

💰 *Total: KES 11,000*

[✅ Confirm]  [✏️ Edit]  [❌ Cancel]
```

#### Step 9 — Customer confirms
```
Customer taps: ✅ Confirm
```
Handler creates booking via `next_booking_number()` RPC.

#### Step 10 — Confirmation + payment
```
AI:
✅ *Booking Confirmed!*

*Booking #:* BK-00018
*Room:* Deluxe Double
*Guest:* Customer Name
*Check-in:* Mon, Sep 15
*Check-out:* Wed, Sep 17
*Nights:* 2
*Guests:* 2

*Total:* KES 11,000

We look forward to welcoming you!

---

💳 *Payment Details*

*Amount:* KES 11,000
*Ref:* BK-00018

*Payment Methods:*
• *M-Pesa Paybill* (M-Pesa Paybill)
  Paybill: 123456
  Account: BK-00018

Forward your payment confirmation message once paid.
```

#### Step 11 — Customer checks booking
```
Customer: Show my bookings

AI calls: get_customer_bookings(phone="+254...")

AI:
Your bookings:

1. *BK-00018* — Deluxe Double
   Sep 15-17 (2 nights) | 2 guests
   Status: *confirmed*
   Total: KES 11,000
```

---

[Insert chat screenshot here]

---

## 4. Hotel + Restaurant

**Business types:** `hotel_restaurant`

This combines both hotel and restaurant tools. The customer can browse rooms AND order food.

### Tools available
All hotel tools + All restaurant tools

### Journey

#### Step 1 — Hotel browsing + room booking
(Same as Hotel journey above)

#### Step 2 — Customer also orders food
```
Customer: Can I also order room service? I want a burger and fries
```

#### Step 3 — AI handles food order (with room_service type)
```
AI calls: search_menu_items(query="burger")
AI calls: preview_food_order(
  items=[{name:"Beef Burger", quantity:1, unit_price:380}, {name:"Fries", quantity:1, unit_price:150}],
  order_type="room_service",
  room_number="205"
)
```

#### Step 4 — Food order preview
```
AI:
📝 *Order Summary*

• 1× Beef Burger @ KES 380 = KES 380
• 1× Fries @ KES 150 = KES 150

💰 *Total: KES 530*

Type: Room Service (Room 205)

[✅ Confirm]  [✏️ Edit]  [❌ Cancel]
```

#### Step 5 — Confirmation + payment (same pattern)

---

[Insert chat screenshot here]

---

## 5. General Business (Catalogue)

**Business types:** `retailer`, `wholesaler`, `service_business`, `professional_services`, `education`, `ngo_nonprofit`, `property_real_estate`, `healthcare`, `events`, `cleaning_services`, `maintenance`, `beauty_wellness`, `fitness`, `automotive`, `pet_services`, `healthcare_clinic`, `other`

### Tools available
- `search_offerings` — search catalogue (products, services, courses, etc.)

### AI behavior
Uses the generic catalogue prompt. The AI searches the business catalogue and presents real data. No specialized order/booking flow — the AI handles conversations naturally based on what the business offers.

### Journey example — Retailer
```
Customer: Do you have wireless headphones?

AI calls: search_offerings(query="wireless headphones")

AI:
Yes! Here's what we have:

1. *SoundMax Pro* — KES 3,500
   Premium wireless headphones with noise cancellation

2. *BassBeat 200* — KES 1,200
   Affordable wireless earbuds with deep bass

Would you like to order or need more details?
```

### Journey example — Education
```
Customer: What courses do you offer?

AI calls: search_offerings(query="courses")

AI:
Here are our courses:

1. *Web Development Bootcamp* — KES 45,000
   12-week intensive program covering HTML, CSS, JS, React

2. *Data Science Fundamentals* — KES 35,000
   8-week course on Python, ML, and data analysis

Would you like to enroll or know more about a specific course?
```

---

[Insert chat screenshot here]

---

## Appendix: Button ID Patterns

| Business Type | Button Pattern | Handler | AI Required? |
|---------------|---------------|---------|-------------|
| Logistics | `order_confirm_{uuid}` | `handleOrderButton` | No |
| Logistics | `order_edit_{uuid}` | `handleOrderButton` | No |
| Logistics | `order_cancel_{uuid}` | `handleOrderButton` | No |
| Restaurant | `food_order_confirm_{uuid}` | `handleFoodOrderButton` | No |
| Restaurant | `food_order_edit_{uuid}` | `handleFoodOrderButton` | No |
| Restaurant | `food_order_cancel_{uuid}` | `handleFoodOrderButton` | No |
| Restaurant | `reservation_confirm_{uuid}` | `handleReservationButton` | No |
| Restaurant | `reservation_edit_{uuid}` | `handleReservationButton` | No |
| Restaurant | `reservation_cancel_{uuid}` | `handleReservationButton` | No |
| Hotel | `booking_confirm_{uuid}` | `handleBookingButton` | No |
| Hotel | `booking_edit_{uuid}` | `handleBookingButton` | No |
| Hotel | `booking_cancel_{uuid}` | `handleBookingButton` | No |
| Restaurant | `menu_more_{offset}` | `handleMenuMore` | No |
| Hotel | `room_more_{offset}` | `handleRoomMore` | No |

All buttons are independent — they execute directly without consuming AI credits.

---

## Appendix: Payment Flow

All business types share the same payment step via `buildPaymentMessage()`:

1. Fetches `payment_methods` from `tenant_settings`
2. Formats M-Pesa Till / Paybill / Bank / Cash details
3. Sends "Forward your payment confirmation message once paid"
4. Falls back to "payment handler will reach out" if no methods configured

---

## Appendix: Image Flow

When a tool returns `image_url`:

1. `auto-reply.ts` captures `finalImageUrl` from tool results
2. Sends image via `engineSendMedia()` **first**
3. Then sends text/buttons as a separate message

Customer sees: 📷 Image → 📝 Message + Buttons
