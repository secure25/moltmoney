# Add Card Retrieval to MoltMoney Skill

Please add the card retrieval functionality to the existing MoltMoney skill by following these steps:

## Step 1: Add these interfaces to the skill file

Add these two new interfaces after the existing interfaces (after `TransactionListResponse`):

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

## Step 2: Add this method to the MoltMoneySkill class

Add this new method inside the class (after the `requestFunds` method):

```typescript
async getCardDetails(): Promise<string> {
  try {
    const response = await this.makeRequest<CardListResponse>(
      `/cards?accountId=${this.config.accountId}`
    );

    if (response.cards.length === 0) {
      return 'No virtual cards found for this account.';
    }

    const activeCard = response.cards.find(card => card.status === 'ACTIVE');
    
    if (!activeCard) {
      const frozenCard = response.cards.find(card => card.status === 'FROZEN');
      if (frozenCard) {
        return 'Your virtual card is frozen. Please contact your owner to unfreeze it.';
      }
      return 'No active virtual cards available.';
    }

    const expiryMonth = activeCard.expiryMonth.toString().padStart(2, '0');
    const expiryYear = activeCard.expiryYear.toString().slice(-2);

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

## Step 3: Add this exported function

Add this at the bottom of the file with the other exported functions:

```typescript
export async function get_card_details(): Promise<string> {
  return getSkillInstance().getCardDetails();
}
```

## Done!

After adding these three pieces, you'll be able to call `get_card_details()` to retrieve your virtual card information for making online purchases.
