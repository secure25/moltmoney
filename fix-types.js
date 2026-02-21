const fs = require('fs');
const path = require('path');

// Fix account.routes.ts
let accountRoutes = fs.readFileSync('apps/api/src/routes/account.routes.ts', 'utf8');
accountRoutes = accountRoutes.replace(/include: \{\s*account: true,/g, 'include: {\n          Account: true,');
accountRoutes = accountRoutes.replace(/agent\.Account/g, 'agent.Account');
fs.writeFileSync('apps/api/src/routes/account.routes.ts', accountRoutes);

// Fix card.routes.ts
let cardRoutes = fs.readFileSync('apps/api/src/routes/card.routes.ts', 'utf8');
cardRoutes = cardRoutes.replace(/include: \{ agent: true \}/g, 'include: { Agent: true }');
cardRoutes = cardRoutes.replace(/include: \{\s*account:/g, 'include: {\n          Account:');
cardRoutes = cardRoutes.replace(/account\.agent/g, 'account.Agent');
cardRoutes = cardRoutes.replace(/card\.account/g, 'card.Account');
cardRoutes = cardRoutes.replace(/card\.AccountId/g, 'card.accountId');
cardRoutes = cardRoutes.replace(/account\.AgentId/g, 'account.agentId');
fs.writeFileSync('apps/api/src/routes/card.routes.ts', cardRoutes);

// Fix webhook.routes.ts
let webhookRoutes = fs.readFileSync('apps/api/src/routes/webhook.routes.ts', 'utf8');
webhookRoutes = webhookRoutes.replace(/include: \{ agent: true \}/g, 'include: { Agent: true }');
webhookRoutes = webhookRoutes.replace(/include: \{\s*account:/g, 'include: {\n          Account:');
webhookRoutes = webhookRoutes.replace(/account\.agent/g, 'account.Agent');
webhookRoutes = webhookRoutes.replace(/webhook\.account/g, 'webhook.Account');
webhookRoutes = webhookRoutes.replace(/webhook\.AccountId/g, 'webhook.accountId');
webhookRoutes = webhookRoutes.replace(/account\.AgentId/g, 'account.agentId');
fs.writeFileSync('apps/api/src/routes/webhook.routes.ts', webhookRoutes);

// Fix transaction.routes.ts
let transactionRoutes = fs.readFileSync('apps/api/src/routes/transaction.routes.ts', 'utf8');
transactionRoutes = transactionRoutes.replace(/include: \{ account: true \}/g, 'include: { Account: true }');
transactionRoutes = transactionRoutes.replace(/include: \{ agent: true \}/g, 'include: { Agent: true }');
transactionRoutes = transactionRoutes.replace(/agent\.account/g, 'agent.Account');
transactionRoutes = transactionRoutes.replace(/account\.agent/g, 'account.Agent');
transactionRoutes = transactionRoutes.replace(/account\.AgentId/g, 'account.agentId');
transactionRoutes = transactionRoutes.replace(/fromaccount/g, 'fromAccount');
transactionRoutes = transactionRoutes.replace(/toaccount/g, 'toAccount');
// Fix the include statements that got mangled
transactionRoutes = transactionRoutes.replace(/Account_Transaction_fromAccountIdAccount_Transaction_toAccountIdToAccount: \{ include: \{ Agent: true \} \}/g, 
  'Account_Transaction_fromAccountIdToAccount: { include: { Agent: true } }');
// Fix property accesses
transactionRoutes = transactionRoutes.replace(/tx\.Account_Transaction_fromAccountIdToAccountId/g, 'tx.fromAccountId');
transactionRoutes = transactionRoutes.replace(/tx\.Account_Transaction_toAccountIdToAccountId/g, 'tx.toAccountId');
transactionRoutes = transactionRoutes.replace(/Account_Transaction_fromAccountIdAccount_Transaction_toAccountIdToAccount: tx\.Account_Transaction_fromAccountIdToAccount/g,
  'fromAccount: tx.Account_Transaction_fromAccountIdToAccount');
transactionRoutes = transactionRoutes.replace(/Account_Transaction_toAccountIdToAccount: tx\.Account_Transaction_toAccountIdToAccount/g,
  'toAccount: tx.Account_Transaction_toAccountIdToAccount');
fs.writeFileSync('apps/api/src/routes/transaction.routes.ts', transactionRoutes);

// Fix payment.routes.ts
let paymentRoutes = fs.readFileSync('apps/api/src/routes/payment.routes.ts', 'utf8');
paymentRoutes = paymentRoutes.replace(/include: \{ agent: true \}/g, 'include: { Agent: true }');
paymentRoutes = paymentRoutes.replace(/transaction\.Account_Transaction_fromAccountIdToAccount\.agent/g, 
  'transaction.Account_Transaction_fromAccountIdToAccount.Agent');
fs.writeFileSync('apps/api/src/routes/payment.routes.ts', paymentRoutes);

// Fix payment-request.routes.ts
let paymentRequestRoutes = fs.readFileSync('apps/api/src/routes/payment-request.routes.ts', 'utf8');
paymentRequestRoutes = paymentRequestRoutes.replace(/include: \{ agent: true \}/g, 'include: { Agent: true }');
paymentRequestRoutes = paymentRequestRoutes.replace(/include: \{ account: true \}/g, 'include: { Account: true }');
paymentRequestRoutes = paymentRequestRoutes.replace(/payerAccount\.agent/g, 'payerAccount.Agent');
paymentRequestRoutes = paymentRequestRoutes.replace(/payerAccount\.AgentId/g, 'payerAccount.agentId');
paymentRequestRoutes = paymentRequestRoutes.replace(/a\.account/g, 'a.Account');
// Fix the mangled include statements
paymentRequestRoutes = paymentRequestRoutes.replace(/Account_PaymentRequest_fromAccountIdAccount_PaymentRequest_toAccountIdToAccount:/g,
  'Account_PaymentRequest_fromAccountIdToAccount:');
// Fix property accesses
paymentRequestRoutes = paymentRequestRoutes.replace(/paymentRequest\.Account_PaymentRequest_fromAccountIdToAccountId/g, 
  'paymentRequest.fromAccountId');
paymentRequestRoutes = paymentRequestRoutes.replace(/paymentRequest\.Account_PaymentRequest_toAccountIdToAccountId/g,
  'paymentRequest.toAccountId');
paymentRequestRoutes = paymentRequestRoutes.replace(/paymentRequest\.Account_PaymentRequest_fromAccountIdToAccount\.agent/g,
  'paymentRequest.Account_PaymentRequest_fromAccountIdToAccount.Agent');
paymentRequestRoutes = paymentRequestRoutes.replace(/paymentRequest\.Account_PaymentRequest_toAccountIdToAccount\?\.agent/g,
  'paymentRequest.Account_PaymentRequest_toAccountIdToAccount?.Agent');
paymentRequestRoutes = paymentRequestRoutes.replace(/req\.Account_PaymentRequest_fromAccountIdToAccountId/g,
  'req.fromAccountId');
paymentRequestRoutes = paymentRequestRoutes.replace(/Account_PaymentRequest_fromAccountIdAccount_PaymentRequest_toAccountIdToAccount: req\.Account_PaymentRequest_fromAccountIdToAccount/g,
  'fromAccount: req.Account_PaymentRequest_fromAccountIdToAccount');
fs.writeFileSync('apps/api/src/routes/payment-request.routes.ts', paymentRequestRoutes);

// Fix payment-request.service.ts
let paymentRequestService = fs.readFileSync('apps/api/src/services/payment-request/payment-request.service.ts', 'utf8');
paymentRequestService = paymentRequestService.replace(/fromAccountWithAgent\?\.agent/g, 'fromAccountWithAgent?.Agent');
fs.writeFileSync('apps/api/src/services/payment-request/payment-request.service.ts', paymentRequestService);

// Fix payment.service.ts - remove unused variable
let paymentService = fs.readFileSync('apps/api/src/services/payment/payment.service.ts', 'utf8');
paymentService = paymentService.replace(/let updatedToAccount: Account \| null = null;\s*/g, '');
paymentService = paymentService.replace(/\s*updatedToAccount = await tx\.account\.update/g, '\n        await tx.account.update');
fs.writeFileSync('apps/api/src/services/payment/payment.service.ts', paymentService);

console.log('All files fixed!');
