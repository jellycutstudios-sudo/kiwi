import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { X, BookOpen, Search, ChevronDown, ChevronUp, ArrowRight } from 'lucide-react';

const SECTIONS = [
  {
    title: 'First Time Setup',
    emoji: '🚀',
    color: '#8b5cf6',
    route: null,
    routeLabel: null,
    content: [
      { type: 'note', text: 'Do this once — before your first login.' },
      { type: 'heading', text: 'How to Register' },
      { type: 'steps', items: [
        'Open the DineOS homepage in your browser',
        'Click "Get Started Free" — this takes you to the login page',
        'On the login page, click the 🚀 Register tab (third option)',
        'Fill in: Owner Name, Owner Email, Password (min 6 chars), Restaurant Name, and Currency',
        'Click Register Restaurant',
        'You will see a Pending Approval screen — wait for an admin to activate your account',
      ]},
      { type: 'heading', text: 'Logging In (after approval)' },
      { type: 'steps', items: [
        'Go to the DineOS homepage and click Sign In',
        'Click the Admin tab',
        'Enter your email and password — you land on the Dashboard',
      ]},
      { type: 'heading', text: 'Staff Login' },
      { type: 'bullets', items: [
        'Staff use a 4-digit PIN — not email',
        'Click the Staff PIN tab on the login page',
        'Enter the Restaurant ID and PIN',
        'Add staff in Staff Manager after logging in as Admin',
      ]},
    ],
  },
  {
    title: 'Dashboard',
    emoji: '📊',
    color: '#10b981',
    route: '/dashboard',
    routeLabel: 'Open Dashboard',
    content: [
      { type: 'text', text: 'Your live business overview — check this every morning before service.' },
      { type: 'heading', text: "Today's Numbers" },
      { type: 'bullets', items: [
        "Today's Sales — total money collected today",
        'Orders Today — number of completed orders',
        'Avg. Bill Size — typical spend per customer',
        'Orders Cooking — currently being prepared',
        'Waiting Online Orders — unread orders from your order link',
      ]},
      { type: 'heading', text: '7-Day Performance' },
      { type: 'bullets', items: [
        'Best-Selling Items — top 3 by quantity sold',
        'Slow Movers — items with the least sales (consider promotions)',
        'Peak Traffic Hours — chart of your busiest times',
        'Payment Split — Cash / Card / UPI breakdown',
      ]},
      { type: 'heading', text: "Today's Action Items" },
      { type: 'highlight', text: 'This card reads your live data and shows plain-English tips automatically. Check it every morning.' },
    ],
  },
  {
    title: 'Point of Sale (POS)',
    emoji: '🧾',
    color: '#3b82f6',
    route: '/pos',
    routeLabel: 'Open POS',
    content: [
      { type: 'text', text: 'Where staff take orders and bill customers.' },
      { type: 'heading', text: 'Taking an Order' },
      { type: 'steps', items: [
        'Choose Order Type: Dine-In, Takeaway, or Online',
        'If Dine-In, select the table number',
        'Tap items from the menu — they appear in the cart on the right',
        'If an item has customizations, a pop-up appears automatically',
        'To remove an item, tap the minus button',
        'Tap Checkout when done',
      ]},
      { type: 'heading', text: 'Checkout & Payment' },
      { type: 'steps', items: [
        'Tap Checkout',
        'Select payment method: Cash, Card, UPI, or Split',
        'Enter a Gift Card code if the customer has one',
        'Confirm — receipt prints automatically if a printer is connected',
      ]},
      { type: 'bullets', items: [
        'Gold star items are high-margin — staff should suggest these first',
        'If the order is below average, the system suggests an upsell automatically',
      ]},
    ],
  },
  {
    title: 'Table Map',
    emoji: '🗺️',
    color: '#f59e0b',
    route: '/tables',
    routeLabel: 'Open Table Map',
    content: [
      { type: 'text', text: 'A visual layout of your restaurant floor — see table status at a glance.' },
      { type: 'heading', text: 'Table Colours' },
      { type: 'bullets', items: [
        'Grey / Empty — table is free',
        'Green — active order being prepared',
        'Yellow / Orange — billed, waiting for payment',
        'Red — waiting a long time',
      ]},
      { type: 'heading', text: 'What You Can Do' },
      { type: 'bullets', items: [
        'Click an occupied table to view the order, add items, or checkout',
        'Click a free table to open a new order for it',
        'Rearrange tables in Floor Plan Editor to match your real layout',
      ]},
      { type: 'highlight', text: 'Go to Settings to add, name, or delete tables.' },
    ],
  },
  {
    title: 'Kitchen Display (KDS)',
    emoji: '🍳',
    color: '#ef4444',
    route: '/kds',
    routeLabel: 'Open Kitchen Display',
    content: [
      { type: 'text', text: 'Replaces paper tickets — orders appear on a kitchen screen automatically.' },
      { type: 'heading', text: 'How It Works' },
      { type: 'steps', items: [
        'Waiter places an order and taps Send to Kitchen',
        'Order appears on KDS showing table, items, and time elapsed',
        'Cooks tap Start Cooking when they begin',
        'When ready, tap Food is Ready',
        'The waiter is notified',
      ]},
      { type: 'heading', text: 'Item Status Badges' },
      { type: 'bullets', items: [
        'Waiting — not started yet',
        'Cooking — being prepared right now',
        'Done — ready to serve',
      ]},
    ],
  },
  {
    title: 'Online Orders',
    emoji: '📱',
    color: '#06b6d4',
    route: '/online-orders',
    routeLabel: 'Open Online Orders',
    content: [
      { type: 'text', text: 'A public web page where customers order from their phone.' },
      { type: 'heading', text: 'Finding Your Order Link' },
      { type: 'steps', items: [
        'Go to Settings',
        'Copy your Online Order Link',
        'Share it on Instagram, WhatsApp, or your website',
      ]},
      { type: 'heading', text: 'Managing Orders' },
      { type: 'bullets', items: [
        'Accept — confirm a prep time',
        'Reject — if too busy or out of ingredients',
        'Mark as Ready — when food is packaged',
      ]},
    ],
  },
  {
    title: 'Active Orders',
    emoji: '📋',
    color: '#8b5cf6',
    route: '/orders',
    routeLabel: 'Open Active Orders',
    content: [
      { type: 'text', text: 'All orders in progress — dine-in, takeaway, and online — in one place.' },
      { type: 'bullets', items: [
        'Order type (Dine-In, Takeaway, Online)',
        'Table name or customer name',
        'Items ordered',
        'Current status (Pending, Cooking, Ready)',
        'Time elapsed since order was placed',
      ]},
      { type: 'highlight', text: 'Ideal for a manager to monitor all activity at a glance without being at the POS.' },
    ],
  },
  {
    title: 'Menu Editor',
    emoji: '🍽️',
    color: '#10b981',
    route: '/admin/menu',
    routeLabel: 'Open Menu Editor',
    content: [
      { type: 'heading', text: 'Adding a Category' },
      { type: 'steps', items: [
        'Click Add Category in the left panel',
        'Enter a name (e.g. Starters) and an emoji',
        'Click Save',
      ]},
      { type: 'heading', text: 'Adding a Menu Item' },
      { type: 'steps', items: [
        'Select a category from the left panel',
        'Click Add Item',
        'Fill in: Name, Price, Description, Emoji, Station',
        'Click Save',
      ]},
      { type: 'heading', text: 'Modifiers (Customizations)' },
      { type: 'steps', items: [
        'Open an item and go to the Modifiers tab',
        'Click Add Group',
        'Name the group (e.g. Choose Size) and add options with prices',
        'Mark as Required if staff must pick one before adding to cart',
      ]},
      { type: 'highlight', text: 'Toggle the Available switch off to instantly hide an item. Toggle back on when available again.' },
    ],
  },
  {
    title: 'Inventory',
    emoji: '📦',
    color: '#f97316',
    route: '/admin/inventory',
    routeLabel: 'Open Inventory',
    content: [
      { type: 'heading', text: 'Adding an Ingredient' },
      { type: 'steps', items: [
        'Click Add Item',
        'Enter name, unit (kg, litre, pieces), and current stock quantity',
        'Set a Low Stock Alert level',
      ]},
      { type: 'heading', text: 'Manual Adjustment' },
      { type: 'steps', items: [
        'Click an ingredient',
        'Click Adjust Stock',
        'Enter quantity received — it is added to the current total',
      ]},
      { type: 'highlight', text: 'Items running low appear with a red badge. Check every morning before service.' },
    ],
  },
  {
    title: 'Transactions',
    emoji: '💳',
    color: '#64748b',
    route: '/admin/transactions',
    routeLabel: 'Open Transactions',
    content: [
      { type: 'text', text: 'Complete record of every payment ever processed.' },
      { type: 'heading', text: 'Filtering' },
      { type: 'bullets', items: [
        'Date Range — Today, Last 7 days, Last 30 days, All',
        'Payment Method — Cash, Card, UPI, Split',
        'Order Type — Dine-In, Takeaway, Online',
        'Staff Member — orders from a specific person',
      ]},
      { type: 'heading', text: 'Useful Actions' },
      { type: 'bullets', items: [
        'Click any row to see the full item list, payment method, and cook time',
        'Flag for Review — marks suspicious orders with a permanent red flag',
        'Download — export as CSV for Excel or Google Sheets',
      ]},
    ],
  },
  {
    title: 'Reports',
    emoji: '📈',
    color: '#3b82f6',
    route: '/reports',
    routeLabel: 'Open Reports',
    content: [
      { type: 'text', text: 'Understand your performance over time and make better decisions.' },
      { type: 'bullets', items: [
        'Sales Overview — total sales, orders, avg bill, and avg kitchen time',
        'Best Sellers — ranked list of most popular items',
        'Hourly Patterns — chart of your busiest hours',
        'Cash Shift History — expected vs. actual cash and discrepancies',
        'Cancelled Items Log — who removed what and when',
      ]},
    ],
  },
  {
    title: 'Staff Manager',
    emoji: '👥',
    color: '#10b981',
    route: '/admin/staff',
    routeLabel: 'Open Staff Manager',
    content: [
      { type: 'heading', text: 'Adding a Staff Member' },
      { type: 'steps', items: [
        'Click Add Staff',
        'Enter their name, email, and role',
        'They receive an invite email to set their password',
      ]},
      { type: 'heading', text: 'Roles' },
      { type: 'bullets', items: [
        'Admin — full access including settings and reports',
        'Manager — orders, reports, menu, payroll; no sensitive settings',
        'Staff / Waiter — can only take orders in POS',
      ]},
    ],
  },
  {
    title: 'Payroll',
    emoji: '💸',
    color: '#10b981',
    route: '/admin/payroll',
    routeLabel: 'Open Payroll',
    content: [
      { type: 'heading', text: 'Setting Up Pay Rates' },
      { type: 'steps', items: [
        'Go to Staff Manager and click a staff member',
        'Enter their hourly or daily rate',
        'Click Save',
      ]},
      { type: 'heading', text: 'Running Payroll' },
      { type: 'steps', items: [
        'Go to Payroll',
        'Select the date range',
        'See total hours and amount owed for each staff member',
        'Click Mark as Paid once paid',
      ]},
      { type: 'highlight', text: 'Make sure staff are clocking in and out correctly — payroll uses that attendance data.' },
    ],
  },
  {
    title: 'Customers & Loyalty',
    emoji: '🤝',
    color: '#ec4899',
    route: '/admin/customers',
    routeLabel: 'Open Customers',
    content: [
      { type: 'text', text: 'Every online order saves the customer name, phone, and order history automatically.' },
      { type: 'heading', text: 'Gift Cards' },
      { type: 'steps', items: [
        'Go to Customers and open the Gift Cards tab',
        'Click Issue Gift Card',
        'Enter customer name and amount (e.g. 500)',
        'A unique code is generated — give it to the customer',
        'At checkout, staff enters the code and the amount is deducted',
      ]},
      { type: 'highlight', text: 'Loyalty points are earned per rupee/dollar spent and can be redeemed for discounts. Configure the ratio in Settings.' },
    ],
  },
  {
    title: 'Reservations',
    emoji: '📅',
    color: '#8b5cf6',
    route: '/admin/reservations',
    routeLabel: 'Open Reservations',
    content: [
      { type: 'heading', text: 'Adding a Reservation' },
      { type: 'steps', items: [
        'Click New Reservation',
        'Enter customer name, phone, date, time, and number of guests',
        'Select which table(s) to assign',
        'Click Save',
      ]},
      { type: 'highlight', text: 'If all tables are full, use the Waitlist — the system notifies you when a table becomes free.' },
    ],
  },
  {
    title: 'Delivery Hub',
    emoji: '🛵',
    color: '#f97316',
    route: '/admin/delivery-hub',
    routeLabel: 'Open Delivery Hub',
    content: [
      { type: 'steps', items: [
        'Go to Delivery Hub and define your Delivery Zones on the map',
        'Set a delivery fee per zone',
        'Add your riders in the Riders section',
        'When an order arrives, assign it to a rider',
        'Rider marks it as Delivered when done',
      ]},
    ],
  },
  {
    title: 'Poster Manager',
    emoji: '📺',
    color: '#64748b',
    route: '/admin/posters',
    routeLabel: 'Open Poster Manager',
    content: [
      { type: 'text', text: 'Show promotional images and menus on TV screens inside your restaurant.' },
      { type: 'steps', items: [
        'Click New Screen and name it (e.g. Main Dining TV)',
        'Copy the unique link and open it on the TV',
        'Click Upload Poster and choose an image',
        'Set how long each poster shows — TV plays them as a slideshow',
      ]},
    ],
  },
  {
    title: 'Settings',
    emoji: '⚙️',
    color: '#64748b',
    route: '/admin/settings',
    routeLabel: 'Open Settings',
    content: [
      { type: 'heading', text: 'General' },
      { type: 'bullets', items: [
        'Restaurant Name, Logo, Address — shown on receipts and order page',
        'Currency — INR, USD, AED, etc.',
        'Tables — add, name, and configure dining tables',
        'Online Order Link — your customer-facing ordering page URL',
      ]},
      { type: 'heading', text: 'Modes (Features)' },
      { type: 'bullets', items: [
        'Bill Only — basic POS',
        'Table Management — visual floor plan',
        'Token / QSR — token number queue',
        'Online Orders — customer web ordering',
        'Kitchen Display — KDS for the kitchen',
        'Inventory — track ingredients and stock',
        'Staff Payroll — calculate wages',
        'Delivery Hub — manage deliveries',
        'Reservations — advance table bookings',
        'Loyalty & Customers — customer profiles and points',
      ]},
      { type: 'heading', text: 'Taxes & Payments' },
      { type: 'bullets', items: [
        'GST (India), VAT (Middle East), or Flat Rate',
        'Enable or disable Cash, Card, UPI, Split',
      ]},
    ],
  },
  {
    title: 'Smart Tips & Tooltips',
    emoji: '✨',
    color: '#f59e0b',
    route: null,
    routeLabel: null,
    content: [
      { type: 'bullets', items: [
        'Hover over any info icon anywhere in the system for a plain-English explanation',
        'Upsell nudge — when an order is below your average, the system suggests a side or drink',
        'High Margin star — mark items in Menu Editor; a gold star in POS reminds staff to push these',
        'Flag for Review — in Transactions, flag suspicious orders with a permanent red flag',
        'Sound Alerts — enable in Settings so POS or KDS plays a chime on new orders',
        'Keep your Admin login secure — create separate accounts for each team member',
      ]},
    ],
  },
];

const ROUTE_TO_SECTION = {
  '/dashboard': 1,
  '/pos': 2,
  '/tables': 3,
  '/kds': 4,
  '/online-orders': 5,
  '/orders': 6,
  '/admin/menu': 7,
  '/admin/inventory': 8,
  '/admin/transactions': 9,
  '/reports': 10,
  '/admin/staff': 11,
  '/admin/payroll': 12,
  '/admin/customers': 13,
  '/admin/reservations': 14,
  '/admin/delivery-hub': 15,
  '/admin/posters': 16,
  '/admin/settings': 17,
};

function RenderContent({ blocks }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'heading':
            return (
              <div key={i} style={{
                fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase',
                letterSpacing: '0.6px', color: 'var(--color-label-secondary)',
                marginTop: i === 0 ? 0 : 14, marginBottom: 4,
              }}>
                {block.text}
              </div>
            );
          case 'text':
            return (
              <div key={i} style={{ fontSize: 13, color: 'var(--color-label)', lineHeight: 1.6, marginBottom: 4 }}>
                {block.text}
              </div>
            );
          case 'steps':
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 4 }}>
                {block.items.map((item, j) => (
                  <div key={j} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                    <span style={{
                      minWidth: 20, height: 20, borderRadius: '50%',
                      background: 'var(--color-accent)', color: '#fff',
                      fontSize: 10, fontWeight: 800,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, marginTop: 1,
                    }}>
                      {j + 1}
                    </span>
                    <span style={{ fontSize: 13, color: 'var(--color-label)', lineHeight: 1.55 }}>{item}</span>
                  </div>
                ))}
              </div>
            );
          case 'bullets':
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 4 }}>
                {block.items.map((item, j) => (
                  <div key={j} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ color: 'var(--color-accent)', fontSize: 18, lineHeight: 1.1, flexShrink: 0, marginTop: 0 }}>·</span>
                    <span style={{ fontSize: 13, color: 'var(--color-label)', lineHeight: 1.55 }}>{item}</span>
                  </div>
                ))}
              </div>
            );
          case 'note':
            return (
              <div key={i} style={{
                background: '#fef3c7', border: '1px solid #fcd34d',
                borderRadius: 8, padding: '7px 10px',
                fontSize: 12, color: '#92400e', fontWeight: 600,
                marginBottom: 10,
              }}>
                ⚠️ {block.text}
              </div>
            );
          case 'highlight':
            return (
              <div key={i} style={{
                background: 'var(--color-bg)', border: '1px solid var(--color-separator)',
                borderLeft: '3px solid var(--color-accent)',
                borderRadius: 6, padding: '7px 10px',
                fontSize: 12.5, color: 'var(--color-label)', lineHeight: 1.55,
                marginTop: 6, marginBottom: 4,
              }}>
                💡 {block.text}
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}

export default function HelpGuide({ onClose }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState('');

  const defaultExpanded = useMemo(() => {
    const idx = ROUTE_TO_SECTION[location.pathname];
    return idx !== undefined ? idx : null;
  }, [location.pathname]);

  const [expanded, setExpanded] = useState(defaultExpanded);

  const filtered = useMemo(() => {
    if (!search.trim()) return SECTIONS.map((s, i) => ({ ...s, idx: i }));
    const q = search.toLowerCase();
    return SECTIONS
      .map((s, i) => ({ ...s, idx: i }))
      .filter(s =>
        s.title.toLowerCase().includes(q) ||
        s.content.some(b =>
          (b.text && b.text.toLowerCase().includes(q)) ||
          (b.items && b.items.some(it => it.toLowerCase().includes(q)))
        )
      );
  }, [search]);

  const handleNavigate = (route) => {
    onClose();
    navigate(route);
  };

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 999999 }}>
      <div
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
      />
      <div style={{
        position: 'absolute', top: 0, right: 0, bottom: 0,
        width: '440px', maxWidth: '100vw',
        background: 'var(--color-bg-elevated)',
        borderLeft: '1px solid var(--color-separator)',
        display: 'flex', flexDirection: 'column',
        boxShadow: '-8px 0 40px rgba(0,0,0,0.15)',
        animation: 'slideInRight 0.2s ease',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 20px 14px',
          borderBottom: '1px solid var(--color-separator)',
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
              <div style={{ fontSize: 11.5, color: 'var(--color-label-secondary)' }}>Tap any section to expand · click to navigate</div>
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} style={{ width: 32, height: 32 }}>
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--color-separator)' }}>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{
              position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--color-label-tertiary)',
            }} />
            <input
              className="form-input"
              placeholder="Search the guide..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 30, height: 34, fontSize: 13 }}
            />
          </div>
        </div>

        {/* Sections */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.length === 0 && (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--color-label-secondary)', fontSize: 13 }}>
              No results for "{search}"
            </div>
          )}
          {filtered.map((section) => {
            const isOpen = expanded === section.idx;
            const isCurrent = ROUTE_TO_SECTION[location.pathname] === section.idx;
            return (
              <div key={section.idx} style={{ borderBottom: '1px solid var(--color-separator-opaque)' }}>
                <button
                  onClick={() => setExpanded(isOpen ? null : section.idx)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '11px 16px',
                    background: isOpen ? 'var(--color-bg-secondary)' : 'transparent',
                    border: 'none', cursor: 'pointer', textAlign: 'left',
                    transition: 'background 0.15s', gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: section.color, flexShrink: 0,
                      opacity: isOpen ? 1 : 0.45,
                    }} />
                    <span style={{ fontSize: 16, lineHeight: 1 }}>{section.emoji}</span>
                    <span style={{
                      fontSize: 13.5, fontWeight: 600,
                      color: isOpen ? 'var(--color-accent)' : 'var(--color-label)',
                    }}>
                      {section.title}
                    </span>
                    {isCurrent && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, background: 'var(--color-accent)',
                        color: '#fff', padding: '1px 6px', borderRadius: 10,
                      }}>
                        Current
                      </span>
                    )}
                  </div>
                  {isOpen
                    ? <ChevronUp size={14} color="var(--color-label-secondary)" />
                    : <ChevronDown size={14} color="var(--color-label-secondary)" />
                  }
                </button>

                {isOpen && (
                  <div style={{ padding: '2px 16px 16px 16px', background: 'var(--color-bg-secondary)' }}>
                    <RenderContent blocks={section.content} />
                    {section.route && (
                      <button
                        onClick={() => handleNavigate(section.route)}
                        style={{
                          marginTop: 14, width: '100%',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          padding: '9px 14px', borderRadius: 8,
                          background: section.color, color: '#fff',
                          border: 'none', cursor: 'pointer',
                          fontSize: 13, fontWeight: 700,
                          transition: 'opacity 0.15s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                      >
                        {section.routeLabel}
                        <ArrowRight size={14} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 16px',
          borderTop: '1px solid var(--color-separator)',
          fontSize: 11, color: 'var(--color-label-tertiary)', textAlign: 'center',
        }}>
          📖 DineOS Owner's Guide · Updated September 2026
        </div>
      </div>
      <style>{`@keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>
    </div>,
    document.body
  );
}
