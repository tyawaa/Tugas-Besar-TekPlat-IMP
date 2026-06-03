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
  'Retry payment after the first attempt expires or fails; confirm a new local order is created.',
  'Send an old Midtrans callback after a retry and confirm it updates only its matching order.',
  'Send the same webhook twice and confirm order, payout, and refund states do not move backward.',
  'Expire a payment attempt and confirm the access request remains pending_payment for retry.',
  'Cancel a pending payment and confirm Midtrans transaction is cancelled or local attempt is CANCELLED.',
  'Try to cancel after payment succeeds and confirm the order is marked REFUND_REQUIRED.',
  'Approve a paid request and confirm access is granted and payout becomes ELIGIBLE.',
  'Reject a paid request and confirm payout becomes REFUND_REQUIRED.',
  'As admin, mark refund completed and confirm payout becomes REFUNDED.',
  'As admin, mark payout completed and confirm payout becomes PAID_OUT.',
  'Send a Midtrans response with a mismatched gross_amount and confirm it is rejected.',
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
