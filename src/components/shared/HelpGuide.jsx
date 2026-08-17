import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, BookOpen, Search, ChevronDown, ChevronUp } from 'lucide-react';

const SECTIONS = [
  {
    title: '1. First Time Setup',
    emoji: '🚀',
    content: `When you first open DineOS, create your account and set up your restaurant.

1. Open the DineOS app in your browser
2. Click "Create Account" and enter your email and password
3. Enter your restaurant name, currency (e.g. INR, USD), and country
4. Choose which Modes your restaurant needs. Start with POS and Table Management
5. Click Save — your restaurant is set up!

You only need to do this once. After setup, every staff member logs in with their own account.`
  },
  {
    title: '2. Dashboard',
    emoji: '📊',
    content: `The Dashboard shows the health of your business today.

TODAY'S NUMBERS
• Today's Sales — Total money collected today
• Active Orders — Orders being prepared or waiting for payment
• Online Orders Waiting — New web orders that need attention
• Revenue Chart — Sales graph, hour by hour

7-DAY PERFORMANCE
• Best-Selling Items — Top 3 items from the last 7 days
• Avg Kitchen Time — Average time from order placed to food ready
• Table Turnover — Groups of customers per table per day on average
• Payment Split — % of customers who paid Cash / Card / UPI

✅ TODAY'S ACTION ITEMS
This card reads your live data and gives plain English tips automatically.
• "Kitchen is slow — average cook time 28 mins. Stay under 20 mins."
• "UPI is popular today — place QR stands on every table."
Check this every morning before service begins.`
  },
  {
    title: '3. Point of Sale (POS)',
    emoji: '🧾',
    content: `The POS is where your staff takes orders and bills customers.

LAYOUT
• Left side — Your full menu organized by category
• Right side — The current order/cart

TAKING AN ORDER
1. Choose Order Type: Dine-In, Takeaway, or Online
2. If Dine-In, select the table number
3. Tap items from the menu — they appear in the cart
4. If an item has customizations (e.g. Size, Extra Cheese), a pop-up appears
5. To remove an item, tap the minus (−) button
6. To add an order note, tap "Add Note"

⭐ HIGH MARGIN ITEMS
Items with a gold star are your best profit-makers. Staff should suggest these first when customers ask for recommendations.

💡 UPSELL TIP
If the order total is below your average, the system automatically suggests offering a side, dessert, or drink.

CHECKOUT & PAYMENT
1. Tap "💳 Checkout"
2. Select payment method: Cash, Card, UPI, or Split
3. Enter a Gift Card code if the customer has one
4. Confirm — a receipt prints automatically if a printer is connected`
  },
  {
    title: '4. Table Map',
    emoji: '🗺️',
    content: `A visual layout of your restaurant floor.

TABLE COLOURS
• Grey/Empty — Table is free, ready for customers
• Green — Active order being prepared
• Yellow/Orange — Billed, waiting for payment
• Red — Waiting a long time

WHAT YOU CAN DO
• Click any occupied table → See the order, add items, or checkout
• Click a free table → Open a new order for that table
• Rearrange tables in the Floor Plan Editor to match your real layout

Go to Settings → General to add, name, or delete tables.`
  },
  {
    title: '5. Kitchen Display (KDS)',
    emoji: '🍳',
    content: `Replaces paper kitchen tickets. Orders appear on a kitchen screen automatically.

HOW IT WORKS
1. Waiter places an order and taps "Send to Kitchen"
2. Order appears on KDS showing table, items, and time elapsed
3. Cooks tap "🍳 Start Cooking" when they begin
4. When everything is ready, tap "✅ Food is Ready"
5. The waiter is notified

STATION TABS
If your kitchen has multiple stations (Grill, Cold, Bar), each station sees only their items. Use the tabs to switch.

ITEM STATUS BADGES
• ⏳ Waiting — Not started yet
• 🍳 Cooking — Being prepared right now
• ✓ Done — Ready to serve

Hover over any button on the KDS for a plain English explanation.`
  },
  {
    title: '6. Online Orders',
    emoji: '📱',
    content: `A public web page where customers can order from their phone.

FINDING YOUR LINK
1. Go to Settings → General
2. Copy your Online Order Link
3. Share it on Instagram, WhatsApp, or your website

WHEN A CUSTOMER ORDERS ONLINE
1. They browse your menu and add items to cart
2. They choose Pickup or Delivery
3. They enter their name and phone number
4. A notification appears on your Online Orders screen immediately

MANAGING ONLINE ORDERS
• Accept the order and confirm a prep time
• Reject if you are too busy or out of ingredients
• Mark as Ready when food is packaged`
  },
  {
    title: '7. Active Orders',
    emoji: '📋',
    content: `Shows all orders in progress — dine-in, takeaway, and online — in one place.

Each order card shows:
• Order type (Dine-In, Takeaway, Online)
• Table name or customer name
• Items ordered
• Current status (Pending, Cooking, Ready)
• Time elapsed since order was placed

Ideal for a manager to monitor everything at a glance.`
  },
  {
    title: '8. Menu Editor',
    emoji: '🍽️',
    content: `Create and manage your full restaurant menu.

ADDING A CATEGORY
1. Go to Menu Editor
2. Click "+ Add Category" on the left panel
3. Enter a name (e.g. "Starters", "Drinks") and an emoji
4. Click Save

ADDING A MENU ITEM
1. Select a category from the left panel
2. Click "+ Add Item"
3. Fill in: Name, Price, Description, Emoji, Station, Photo (optional)
4. Click Save

⭐ MARKING AS HIGH MARGIN
Toggle "⭐ Mark as High Margin" on any item. A gold star shows in the POS reminding staff to push this item.

MODIFIERS (CUSTOMIZATIONS)
1. Open an item → go to "Modifiers" tab
2. Click "+ Add Group"
3. Name the group (e.g. "Choose Size") and add options with prices
4. Mark as Required if staff must pick one before adding to cart

MAKING AN ITEM UNAVAILABLE
Toggle the "Available" switch off to instantly hide the item. Toggle back on when available again.`
  },
  {
    title: '9. Inventory',
    emoji: '📦',
    content: `Track your raw ingredients so you always know what's in stock.

ADDING AN INGREDIENT
1. Go to Inventory
2. Click "+ Add Item"
3. Enter name, unit (kg, litre, pieces), and current stock quantity
4. Set a Low Stock Alert level — you'll be warned when stock drops below this

AUTO DEDUCTION
If you've linked recipes to menu items, stock reduces automatically with every order. E.g. Butter Chicken uses 200g of chicken — each sale deducts 200g.

LOW STOCK WARNINGS
Items running low appear with a red/orange badge. Check Inventory every morning before service.

MANUAL ADJUSTMENTS
1. Click an ingredient
2. Click "Adjust Stock"
3. Enter the quantity received — it's added to the current total`
  },
  {
    title: '10. Transactions',
    emoji: '💳',
    content: `Complete record of every payment ever processed.

FILTERING
• Date Range — Today, Last 7 days, Last 30 days, All
• Payment Method — Cash, Card, UPI, Split
• Order Type — Dine-In, Takeaway, Online
• Staff Member — See orders from a specific staff member

SUMMARY BAR
• Total Revenue — Total money collected
• Order Count — Number of orders
• Avg Bill Size — Typical amount per order

VIEW DETAILS
Click any row to expand and see the full item list, payment method, staff who took the order, cook time, and Paid ✅ status.

🚩 FLAG FOR REVIEW
If something looks wrong (large discount, unexplained cancellation), click "Flag for Review". A red flag marks it permanently so you can investigate later.

EXPORT TO SPREADSHEET
Click the Download button to export as a CSV file — opens in Excel or Google Sheets.`
  },
  {
    title: '11. Reports',
    emoji: '📈',
    content: `Understand your performance over time and make better decisions.

SALES OVERVIEW
Total sales, number of orders, average bill, and average kitchen time for any date range.

BEST SELLERS
Ranked list of your most popular items. Use this to feature items on menu boards, promote on social media, and make sure you stock enough.

HOURLY PATTERNS
Chart showing your busiest hours. Schedule more staff during peaks, save on wages during slow times.

CASH SHIFT HISTORY
Record of cash drawer opens/closes, expected vs. actual cash, and any discrepancies.

CANCELLED ITEMS LOG
Record of every item removed from an order — who removed it and when. Use to monitor for mistakes or misuse.`
  },
  {
    title: '12. Staff Manager',
    emoji: '👥',
    content: `Add and manage your team members.

ADDING A NEW STAFF MEMBER
1. Go to Staff Manager
2. Click "+ Add Staff"
3. Enter their name, email, and role:
   • Admin — Full access including settings and reports
   • Manager — Most features but not sensitive settings
   • Staff — Can only take orders in POS
4. They'll receive an invite email to set their password

ROLES AT A GLANCE
• Admin: everything ✅
• Manager: orders, reports, menu, payroll ✅ | settings ❌
• Staff: orders only ✅

Staff check in and out through the system so you have a full attendance record.`
  },
  {
    title: '13. Payroll',
    emoji: '💸',
    content: `Calculate how much to pay each staff member based on hours worked.

SETTING UP PAY RATES
1. Go to Staff Manager → click a staff member
2. Enter their hourly rate or fixed daily rate
3. Click Save

VIEWING A PAY PERIOD
1. Go to Payroll
2. Select the date range (e.g. 1st–31st of the month)
3. See each staff member's total hours and amount owed

MARKING AS PAID
Once paid, click "Mark as Paid" to record it.

Note: Payroll uses attendance logged in the system. Make sure staff are clocking in and out correctly.`
  },
  {
    title: '14. Customers & Loyalty',
    emoji: '🤝',
    content: `Build relationships with repeat customers and reward them for coming back.

CUSTOMER PROFILES
Every online order saves the customer's name, phone, and order history automatically. Click any customer to see their full history, total spent, birthday, and loyalty points.

LOYALTY POINTS
Customers earn points for every rupee/dollar spent. Points can be redeemed for discounts. Configure the points ratio in Settings.

🎁 PREPAID GIFT CARDS
1. Go to Customers → Prepaid Gift Cards tab
2. Click "Issue Gift Card"
3. Enter customer name and amount (e.g. ₹500)
4. A unique code is generated (e.g. GC-ABCD1234) — give this to the customer

When the customer visits, staff enters the code in the payment screen and the amount is deducted automatically.`
  },
  {
    title: '15. Reservations',
    emoji: '📅',
    content: `Manage table bookings made in advance.

ADDING A RESERVATION
1. Go to Reservations
2. Click "+ New Reservation"
3. Enter customer name, phone, date, time, and number of guests
4. Select which table(s) to assign
5. Click Save

THE RESERVATION CALENDAR
View all upcoming bookings in calendar or list format. Click any reservation to confirm, modify, or cancel it.

WALK-IN WAITLIST
If all tables are full, add the waiting customer to the Waitlist. The system notifies you when a table becomes free.`
  },
  {
    title: '16. Delivery Hub',
    emoji: '🛵',
    content: `For restaurants that offer home delivery.

SETTING UP DELIVERY ZONES
1. Go to Delivery Hub → Delivery Zones
2. Define areas on a map and set a delivery fee for each zone

MANAGING YOUR RIDERS
Add your delivery riders in the Riders section. When a delivery order comes in, assign it to a specific rider.

ORDER FLOW
1. Customer places a delivery order online
2. Order appears in Delivery Hub
3. You accept and assign a rider
4. Rider picks up food and marks it as Delivered when done`
  },
  {
    title: '17. Token Display',
    emoji: '🎫',
    content: `A TV screen that shows customers their token number — ideal for QSRs and food courts.

HOW IT WORKS
1. When a staff member places an order, a token number is assigned automatically
2. Customer waits and watches the Token Display TV screen
3. When order is ready, staff press "📢 Call Token" on the KDS or Active Orders screen
4. The token appears on the TV with a sound chime and voice announcement

SETTING UP
1. Open a browser on the TV you want to use
2. Go to Settings → General and copy the Token Display Link
3. Open that link on the TV — it updates automatically
4. Leave it running`
  },
  {
    title: '18. Poster Manager',
    emoji: '📺',
    content: `Show promotional images and menus on TV screens inside your restaurant.

ADDING A SCREEN
1. Go to Poster Manager
2. Click "+ New Screen" and name it (e.g. "Main Dining TV")
3. Copy the unique link for that screen
4. Open that link on the TV

UPLOADING POSTERS
1. Select a screen
2. Click "+ Upload Poster" and choose an image from your computer
3. Set how long each poster shows (in seconds)
4. The TV plays all your posters as a slideshow automatically

Choose transition effects (fade, slide, zoom) for a professional look.`
  },
  {
    title: '19. Settings',
    emoji: '⚙️',
    content: `The control panel for your entire restaurant. Only Admins can access this.

GENERAL SETTINGS
• Restaurant Name, Logo, Address — shown on receipts and the online order page
• Currency — Select INR, USD, AED, etc.
• Tables — Add, name, and configure dining tables

MODES (FEATURES)
Turn on only the features you need:
• 🧾 Bill Only — Basic POS
• 🗺️ Table Management — Visual floor plan
• 🎫 Token / QSR — Token number queue
• 📱 Online Orders — Customer web ordering
• 🍳 Kitchen Display — KDS for the kitchen
• 📦 Inventory — Track ingredients and stock
• 💸 Staff Payroll — Calculate wages
• 🛵 Delivery Hub — Manage deliveries
• 📅 Reservations — Advance table bookings
• 🤝 Loyalty & Customers — Customer profiles and points

TAXES & PAYMENTS
• GST (India) — Tax breakdowns print automatically on every receipt
• VAT (Middle East)
• Flat Rate — Simple fixed percentage tax
• Payment Methods — Enable/disable Cash, Card, UPI, Split

PRINTERS & HARDWARE
Add receipt printers, kitchen printers, and cash drawers. For kitchen printers, set which menu categories print to each printer.`
  },
  {
    title: '20. Smart Features & Tips',
    emoji: '✨',
    content: `Built-in features that help you run a more profitable and efficient restaurant.

ℹ️ INFO TOOLTIPS
Hover over any ℹ️ icon anywhere in the system for a plain English explanation of that metric or button. Great for training new staff.

💡 UPSELL NUDGES
When a customer's order is below your average bill size, the system automatically suggests offering a side, dessert, or drink.

⭐ HIGH MARGIN PROMOTERS
Mark items as High Margin in the Menu Editor. A gold star shows in the POS reminding staff to suggest these items first.

🚩 FLAG FOR REVIEW
In Transactions, flag any suspicious order with a permanent red flag to investigate later.

📊 BEST SELLERS & INSIGHTS
Dashboard shows top-selling items from the last 7 days. Use this to stock the right ingredients and feature popular dishes.

🔔 SOUND ALERTS
Enable sound alerts in Settings so the POS or KDS plays a chime when a new order arrives.

⚠️ KEEP YOUR ADMIN LOGIN SECURE
Do not share the Admin account with general staff. Create separate accounts for each team member.`
  }
];

export default function HelpGuide({ onClose }) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);

  const filtered = SECTIONS.filter(s =>
    s.title.toLowerCase().includes(search.toLowerCase()) ||
    s.content.toLowerCase().includes(search.toLowerCase())
  );

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 999999,
    }}>
      <div onClick={onClose} style={{ 
        position: 'absolute', inset: 0, 
        background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' 
      }} />
      <div style={{
        position: 'absolute', top: 0, right: 0, bottom: 0,
        width: '420px', maxWidth: '100vw', 
        background: '#ffffff', // Force solid background to prevent bleed-through
        borderLeft: '1px solid var(--color-separator)', 
        display: 'flex', flexDirection: 'column',
        boxShadow: '-8px 0 40px rgba(0,0,0,0.15)', 
        animation: 'slideInRight 0.2s ease',
      }}>
        <div style={{
          padding: '20px 20px 16px', borderBottom: '1px solid var(--color-separator)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, background: 'var(--color-accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <BookOpen size={18} color="white" />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-label)' }}>Owner's Guide</div>
              <div style={{ fontSize: 12, color: 'var(--color-label-secondary)' }}>Everything you need to know</div>
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} style={{ width: 32, height: 32 }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-separator)' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{
              position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--color-label-tertiary)'
            }} />
            <input
              className="form-input"
              placeholder="Search the guide..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 32, height: 36, fontSize: 13 }}
            />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {filtered.length === 0 && (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--color-label-secondary)', fontSize: 13 }}>
              No results for "{search}"
            </div>
          )}
          {filtered.map((section, i) => {
            const isOpen = expanded === i;
            return (
              <div key={i} style={{ borderBottom: '1px solid var(--color-separator-opaque)' }}>
                <button
                  onClick={() => setExpanded(isOpen ? null : i)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between', padding: '12px 16px',
                    background: isOpen ? 'var(--color-bg-secondary)' : 'transparent',
                    border: 'none', cursor: 'pointer', textAlign: 'left',
                    transition: 'background 0.15s', gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 18, lineHeight: 1 }}>{section.emoji}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: isOpen ? 'var(--color-accent)' : 'var(--color-label)' }}>
                      {section.title}
                    </span>
                  </div>
                  {isOpen ? <ChevronUp size={14} color="var(--color-label-secondary)" /> : <ChevronDown size={14} color="var(--color-label-secondary)" />}
                </button>
                {isOpen && (
                  <div style={{
                    padding: '4px 16px 16px 44px', fontSize: 13,
                    color: 'var(--color-label)', lineHeight: 1.7,
                    whiteSpace: 'pre-wrap', background: 'var(--color-bg-secondary)',
                  }}>
                    {section.content}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{
          padding: '12px 16px', borderTop: '1px solid var(--color-separator)',
          fontSize: 11, color: 'var(--color-label-tertiary)', textAlign: 'center',
        }}>
          📖 DineOS Owner's Guide · Updated August 2026
        </div>
      </div>
      <style>{`@keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>
    </div>,
    document.body
  );
}
