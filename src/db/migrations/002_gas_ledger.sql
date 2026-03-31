CREATE TABLE IF NOT EXISTS gas_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES platform_users(user_id),
    balance_credits BIGINT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gas_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES platform_users(user_id),
    amount BIGINT NOT NULL,
    transaction_type TEXT NOT NULL, -- e.g. 'credit', 'debit'
    created_at TIMESTAMPTZ DEFAULT NOW()
);
