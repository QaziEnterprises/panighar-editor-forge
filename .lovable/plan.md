
## Plan: Implement 4 New Features

### 1. Customer Credit/Debit Statement PDF
- Add a "Download Statement" button on the Contacts/Ledger page
- Generate a PDF with customer details, all transactions (sales, payments, returns), and running balance
- Use a script-based approach to generate PDFs in-browser using canvas/blob

### 2. Return/Refund Management
- Create a `returns` database table (sale_id, items, reason, refund_amount, date, etc.)
- Add "Return" button on Bills page for each sale
- Return dialog: select items to return, enter reason, choose refund method
- On return: adjust product inventory (add back stock), create ledger entry, update sale balance

### 3. Dashboard Notifications Center
- Create a `notifications` table for persistent alerts
- Add bell icon in the app header with badge count
- Auto-generate notifications for: low stock, overdue payments (7+ days), large returns
- Mark as read/dismiss functionality

### 4. Offline Mode with Sync
- Cache products and customers in localStorage/IndexedDB on load
- When offline, allow POS to work from cached data and queue sales locally
- On reconnect, sync queued sales to the database
- Show online/offline status indicator in the header

### Database Changes (Migration)
- `returns` table with RLS
- `return_items` table with RLS
- `notifications` table with RLS

### Files to Create/Modify
- New: `src/components/CustomerStatementPDF.tsx`
- New: `src/components/ReturnDialog.tsx`
- New: `src/components/NotificationsCenter.tsx`
- New: `src/hooks/useOfflineSync.ts`
- New: `src/hooks/useNotifications.ts`
- Modify: `src/components/AppLayout.tsx` (add notifications bell, offline indicator)
- Modify: `src/pages/BillsPage.tsx` (add return button)
- Modify: `src/pages/ContactsPage.tsx` (add statement button)
- Modify: `src/pages/DashboardPage.tsx` (integrate notifications)
