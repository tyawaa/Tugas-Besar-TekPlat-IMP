const requiredEnvironment = [
  'MIDTRANS_SERVER_KEY',
  'NEXT_PUBLIC_MIDTRANS_CLIENT_KEY',
]

const optionalEnvironment = [
  'MIDTRANS_IS_PRODUCTION=false',
  'NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION=false',
  'DATABASE_URL or local JSON data store',
]

const checklist = [
  'Create a paid access request and complete payment successfully in Midtrans sandbox.',
  'Close the Snap popup before paying, then reopen the same pending payment and pay later.',
  'Send a duplicate paid webhook for an already paid order and confirm no duplicate order update or audit log is created.',
  'Send a duplicate pending webhook for an already pending order and confirm it is a no-op.',
  'Retry payment after the first attempt expires or fails; confirm a new local order is created without overwriting the old midtransOrderId.',
  'Send an old Midtrans callback after a retry and confirm it updates only its matching order.',
  'Expire a payment attempt and confirm the access request remains pending_payment for retry.',
  'Cancel a pending payment and confirm Midtrans transaction is cancelled or local attempt is CANCELLED.',
  'Send a paid Midtrans callback after local cancellation and confirm the request is not granted and the order is marked REFUND_REQUIRED.',
  'Try to cancel after payment succeeds and confirm the order is moved into manual refund review.',
  'Approve a paid request and confirm access is granted and payout becomes ELIGIBLE.',
  'Reject a paid request and confirm payout becomes REFUND_REQUIRED.',
  'As admin, mark payout completed and confirm payout becomes PAID_OUT.',
  'As admin, mark refund completed and confirm payout becomes REFUNDED.',
  'Send a Midtrans response with a mismatched gross_amount and confirm it is rejected.',
  'Send a Midtrans response with a mismatched currency and confirm it is rejected.',
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
console.log('Scenarios:')
for (const [index, item] of checklist.entries()) {
  console.log(`${index + 1}. ${item}`)
}
