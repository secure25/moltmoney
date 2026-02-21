# Card Retrieval Method for Agent Bank Skill

## Overview
This document contains the code to add card retrieval functionality to the agent bank skill, enabling agents to access their virtual card credentials for making online purchases.

---

## 1. Add Interface (Add after existing interfaces)

```typescript
interface VirtualCard {
  id: string;
  cardNumber: string;
  expiryMonth: number;
  expiryYear: number;
  status: string;
  spendLimit?: string;
  accountId: string;
  createdAt: string;
}

interface CardListResponse {
  cards: VirtualCard[];
}
```

---

## 2. Add Method to AgentBankSkill Class (Add before the closing brace of the class)

```typescript
  async getCardDetails(): Promise<string> {
    try {
      const response = await this.makeRequest<CardListResponse>(
        `/cards?accountId=${this.config.accountId}`
      );

      if (response.cards.length === 0) {
        return 'No virtual cards found for this account.';
      }

      // Get the first active card
      const activeCard = response.cards.find(card => card.status === 'ACTIVE');
      
      if (!activeCard) {
        const frozenCard = response.cards.find(card => card.status === 'FROZEN');
        if (frozenCard) {
          return 'Your virtual card is frozen. Please contact your owner to unfreeze it.';
        }
        return 'No active virtual cards available.';
      }

      // Format expiry date
      const expiryMonth = activeCard.expiryMonth.toString().padStart(2, '0');
      const expiryYear = activeCard.expiryYear.toString().slice(-2);

      // Return card details in a structured format
      const cardInfo = [
        'Virtual Card Details:',
        `Card Number: ${activeCard.cardNumber}`,
        `Expiry: ${expiryMonth}/${expiryYear}`,
        `Status: ${activeCard.status}`,
      ];

      if (activeCard.spendLimit) {
        const limit = parseFloat(activeCard.spendLimit).toFixed(2);
        cardInfo.push(`Spend Limit: ${limit}`);
      }

      cardInfo.push('');
      cardInfo.push('⚠️ Keep these credentials secure. Use them only for authorized purchases.');

      return cardInfo.join('\n');
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('401') || error.message.includes('403')) {
          return 'Error: Not authorized to access card details.';
        }
        return `Error retrieving card details: ${error.message}`;
      }
      return 'Error retrieving card details: An unexpected error occurred';
    }
  }
```

---

## 3. Add Exported Function (Add at the bottom with other exported functions)

```typescript
export async function get_card_details(): Promise<string> {
  return getSkillInstance().getCardDetails();
}
```

---

## 4. Update SKILL.md Documentation (Add this section)

Add this to the "Available Functions" section in `skills/agent-bank/SKILL.md`:

```markdown
### get_card_details()

Retrieves the agent's virtual card credentials for making online purchases.

**Returns:** Card number, expiry date, CVV, status, and spend limit (if set)

**Example:**
```typescript
const cardInfo = await get_card_details();
console.log(cardInfo);
// Output:
// Virtual Card Details:
// Card Number: 4532123456789012
// Expiry: 12/25
// Status: ACTIVE
// Spend Limit: 1000.00
```

**Use Cases:**
- Making online purchases
- Filling in payment forms
- Checking card status before transactions
- Verifying spend limits

**Security Note:** Card credentials should be handled securely and only used for authorized purchases.
```

---

## Implementation Instructions

1. Open `skills/agent-bank/index.ts`
2. Add the `VirtualCard` and `CardListResponse` interfaces after the existing interfaces
3. Add the `getCardDetails()` method to the `AgentBankSkill` class
4. Add the `get_card_details()` exported function at the bottom
5. Update `skills/agent-bank/SKILL.md` with the new documentation

---

## Testing

After implementation, test with:

```typescript
import { get_card_details } from './skills/agent-bank';

// Test card retrieval
const result = await get_card_details();
console.log(result);
```

Expected output should show card number, expiry, and status.

---

## Security Considerations

- Card numbers are encrypted in the database
- Only agents can access their own card details (enforced by API)
- CVV is excluded from list operations (API returns it only on card issuance)
- Agents should be instructed to handle card credentials securely
- Consider logging card access for audit purposes

---

## API Endpoint Used

```
GET /cards?accountId={accountId}
Authorization: Bearer {agentApiKey}
```

This endpoint is already implemented and secured with agent authentication middleware.
