const requiredEnvironment = [
  'MIDTRANS_SERVER_KEY',
  'NEXT_PUBLIC_MIDTRANS_CLIENT_KEY',
]

const optionalEnvironment = [
  'MIDTRANS_IS_PRODUCTION=false',
  'NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION=false',
  'DATABASE_URL for production payment safety; local JSON/Redis storage is demo-only for payment concurrency',
]

const productionNotes = [
  'Before migration 007 in production, run the duplicate PENDING diagnostic query in the migration comments.',
  'PostgreSQL enforces one active PENDING order per access request; JSON/Redis storage cannot enforce that index.',
  'Approve/reject/cancel/admin payout/refund flows use safer update order, but still need future transaction wrappers for full atomicity.',
  'REFUND_REQUIRED means an admin must manually process a refund outside this app.',
  'REFUNDED means an admin manually marked the refund as completed; no Midtrans Refund API is called.',
  'pnpm lint currently runs TypeScript validation with tsc --noEmit, not a full ESLint rule lint.',
  'Future reconciliation job should periodically sync old PENDING orders with Midtrans status.',
  'Future monitoring should alert on payment mismatches, long REFUND_REQUIRED age, webhook repeated failures, duplicate pending orders, and late paid after cancel.',
]

const checklist = [
  'Create a paid access request and complete payment successfully in Midtrans sandbox.',
  'Close the Snap popup before paying, then reopen the same pending payment and pay later.',
  'Double-click the payment button or send two concurrent token requests and confirm only one active PENDING order exists.',
  'Run the migration 007 duplicate PENDING precheck query before applying the Postgres partial unique index to existing production data.',
  'With PostgreSQL, confirm the partial unique index prevents two PENDING orders for the same access request.',
  'With JSON/Redis demo storage, confirm duplicate pending prevention is route-level only and not database-enforced.',
  'Send a duplicate paid webhook for an already paid order and confirm no duplicate order update or audit log is created.',
  'Send a duplicate pending webhook for an already pending order and confirm it is a no-op.',
  'Retry payment after the first attempt expires or fails; confirm a new local order is created without overwriting the old midtransOrderId.',
  'Send an old Midtrans callback after a retry and confirm it updates only its matching order.',
  'Expire a payment attempt and confirm the access request remains pending_payment for retry.',
  'Cancel a pending payment and confirm Midtrans transaction is cancelled or local attempt is CANCELLED.',
  'Send a paid Midtrans callback after local cancellation and confirm the request is not granted and the order is marked REFUND_REQUIRED.',
  'Try to cancel after payment succeeds and confirm the order is moved into manual refund review.',
  'Approve a paid request and confirm access is granted and payout becomes ELIGIBLE.',
  'Simulate approve flow failure after payout eligibility and confirm no access grant is created before payout safety is handled.',
  'Reject a paid request and confirm payout becomes REFUND_REQUIRED.',
  'Simulate reject flow failure and confirm paid orders are not rejected without manual refund tracking.',
  'Confirm REFUND_REQUIRED is displayed as manual refund required, not automatic refund processing.',
  'Confirm REFUNDED is displayed as manually marked completed, not automatic Midtrans refund completion.',
  'As admin, mark payout completed and confirm payout becomes PAID_OUT.',
  'As admin, mark refund completed and confirm payout becomes REFUNDED.',
  'Send a Midtrans response with a mismatched gross_amount and confirm it is rejected.',
  'Send a Midtrans response with a mismatched currency and confirm it is rejected.',
  'Manually review old PENDING orders and note which ones need the future reconciliation job.',
  'Review production monitoring TODOs for mismatch alerts, stale refunds, webhook failures, duplicate pending orders, and late paid after cancel.',
  'Run pnpm lint, pnpm build, and pnpm payment:checklist before release.',
]

console.log('IoTBridge Midtrans sandbox checklist')
console.log('')
console.log('Environment:')
for (const key of requiredEnvironment) {
  console.log(`- Required: ${key}`)
}
for (const key of optionalEnvironment) {
  console.log(`- Check: ${key}`)
}
console.log('')
console.log('Production notes:')
for (const item of productionNotes) {
  console.log(`- ${item}`)
}
console.log('')
console.log('Scenarios:')
for (const [index, item] of checklist.entries()) {
  console.log(`${index + 1}. ${item}`)
}
