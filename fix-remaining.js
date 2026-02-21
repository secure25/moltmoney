const fs = require('fs');

// Fix payment-request.routes.ts - server.prisma.Account should be server.prisma.account
let paymentRequestRoutes = fs.readFileSync('apps/api/src/routes/payment-request.routes.ts', 'utf8');
paymentRequestRoutes = paymentRequestRoutes.replace(/server\.prisma\.Account\./g, 'server.prisma.account.');
fs.writeFileSync('apps/api/src/routes/payment-request.routes.ts', paymentRequestRoutes);

// Fix payment.routes.ts - change agent to Agent in include
let paymentRoutes = fs.readFileSync('apps/api/src/routes/payment.routes.ts', 'utf8');
paymentRoutes = paymentRoutes.replace(/include: \{\s*agent: true,/g, 'include: { Agent: true,');
fs.writeFileSync('apps/api/src/routes/payment.routes.ts', paymentRoutes);

// Fix webhook.routes.ts - AgentId should be agentId
let webhookRoutes = fs.readFileSync('apps/api/src/routes/webhook.routes.ts', 'utf8');
webhookRoutes = webhookRoutes.replace(/webhook\.Account\.AgentId/g, 'webhook.Account.agentId');
fs.writeFileSync('apps/api/src/routes/webhook.routes.ts', webhookRoutes);

// Fix payment-request.service.ts - .agent should be .Agent
let paymentRequestService = fs.readFileSync('apps/api/src/services/payment-request/payment-request.service.ts', 'utf8');
paymentRequestService = paymentRequestService.replace(/fromAccountWithAgent\.agent\.ownerId/g, 'fromAccountWithAgent.Agent.ownerId');
fs.writeFileSync('apps/api/src/services/payment-request/payment-request.service.ts', paymentRequestService);

console.log('Remaining errors fixed!');
