# Business groups and manual branch billing

Super admin manages this from **Businesses & Branches → Branches & Payments**.

1. Create a business and choose an existing registered owner account. Optionally connect their ungrouped branches in the same operation.
2. Use **Connect existing** to link other ungrouped branches belonging to that owner. Linking preserves the restaurant ID and all operational data. It does not transfer ownership.
3. Use **Add branch** to create another branch. Enter its individual fee, currency and billing cycle. New branches start pending approval.
4. After collecting money, use **Record payment** on a branch or business. A business payment can cover up to 50 branches belonging to the same owner, in one currency. Enter the amount allocated and paid-through date for each selected branch. Review activation checkboxes before saving.
5. **Payment history** shows the latest 50 receipts affecting that branch, displaying only its share of each combined payment.

Paid-through dates include the whole stated calendar day. A branch is “Due soon” during its final 7 days and on its paid-through date, then “Overdue” the next day. Expiry never automatically suspends a branch. Super admin suspends or reactivates branches manually. Editing a fee does not change renewal dates. A payment must extend the current paid-through date; this version records subscription renewals, rather than partial payments or refunds.

Owners sign in once and can switch to their own approved branches. Staff do not receive branch-switching access through business grouping. If an owner’s primary branch is suspended, sign-in selects another approved owned branch. Menus, staff and table caches are isolated when switching branches. Existing approved branches remain usable while their billing is configured.

## Data and permissions

- `businessGroups/{id}`: business name and owner UID. Platform administrators create groups; ownership is fixed. Branches reference them with `businessGroupId` and retain `ownerUid`.
- `branchSubscriptions/{restaurantId}`: fee in integer minor units, billing currency, cycle, paid-through date and last receipt ID. Only super admin can write; the owner may read their own branch subscription.
- `branchPayments/{id}`: immutable receipt with owner UID, currency, total, allocations, collection date/method, reference, note, recording administrator and server timestamp. Super admin only.

Payment receipts and renewal changes commit in one online Firestore transaction. A stable receipt ID prevents duplicate writes when the same submission is retried. Each branch can have a different renewal date. Combined payments cannot mix owners or billing currencies. Billing currencies support the existing currency list, including three decimal places for BHD, KWD and OMR.

Fees and receipts are kept out of publicly readable restaurant documents. Updated rules reserve ownership, grouping and account approval for super admin; they also block operations on manually suspended branches.

## Enable against the live Firebase project

Deploy the rules and the payment-history query index before using these controls against live data:

```sh
npx firebase-tools deploy --only firestore:rules,firestore:indexes --project posrest-5a97f
```

The index can take time to build. Until rules are deployed, the console reports that businesses/billing cannot be loaded and disables those mutations. A hosting or functions deployment is not needed to use the updated Vite app locally.

## Validation

```sh
npm test
npm run build
```

Rules tests require Firebase CLI and Java 21. Start an isolated **demo** project emulator (never import live data):

```sh
npx firebase-tools emulators:start --only firestore,auth --project demo-kiwi-branches --config firebase.emulators.json
FIRESTORE_EMULATOR_HOST=127.0.0.1:8088 npm run test:branch-rules
```

The rules tests clear only the local demo Firestore database and cover billing privacy, ownership, grouping, normal registration, receipt immutability and branch suspension.

For isolated browser testing, start another Vite server with demo configuration:

```sh
VITE_FIREBASE_EMULATORS=true \
VITE_FIREBASE_API_KEY=demo-key \
VITE_FIREBASE_PROJECT_ID=demo-kiwi-branches \
VITE_FIREBASE_AUTH_DOMAIN=demo-kiwi-branches.firebaseapp.com \
VITE_FIREBASE_APP_ID=demo-app \
npm run dev -- --host 127.0.0.1 --port 5174
```

Emulator mode is opt-in, development-only, and requires a `demo-` project ID. Default configuration continues to use the configured Firebase project.
