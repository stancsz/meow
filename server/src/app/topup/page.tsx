'use client';

import React, { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

import { Suspense } from 'react';

function TopUpContent() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [quantity, setQuantity] = useState(10);
  const searchParams = useSearchParams();

  const canceled = searchParams.get('canceled');

  const handleCheckout = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'test-user', // Hardcoded for Phase 1 as auth isn't fully integrated
          quantity: quantity
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create checkout session');
      }

      // Redirect to Stripe Checkout
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An unexpected error occurred.');
      setLoading(false);
    }
  };

  return (
    <>
        {canceled && (
          <div style={{ padding: '1rem', backgroundColor: 'rgba(255, 68, 68, 0.1)', color: '#ff4444', borderRadius: '4px', marginBottom: '1rem' }}>
            Payment was canceled. You have not been charged.
          </div>
        )}

        {error && (
          <div className="error-message" style={{ marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        <div className="input-group">
          <label htmlFor="quantity">Amount of credits ($1.00 per credit)</label>
          <input
            id="quantity"
            type="number"
            min="1"
            className="input-field"
            value={quantity}
            onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
            disabled={loading}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>
            Total: ${(quantity * 1.00).toFixed(2)}
          </div>
          <button
            onClick={handleCheckout}
            className="btn-primary"
            disabled={loading || quantity < 1}
          >
            {loading ? 'Processing...' : 'Checkout with Stripe'}
          </button>
        </div>
    </>
  );
}

export default function TopUpPage() {
  return (
    <div className="dashboard-container" style={{ maxWidth: '600px', margin: '0 auto' }}>
      <div className="dashboard-header" style={{ marginBottom: '2rem' }}>
        <h1>Gas Tank</h1>
        <Link href="/" style={{ color: '#00E5CC', textDecoration: 'none' }}>
          &larr; Back to Dashboard
        </Link>
      </div>

      <div className="form-container">
        <h2>Top Up Credits</h2>
        <p style={{ color: '#888', marginBottom: '1.5rem', lineHeight: '1.5' }}>
          Purchase Gas credits to run the SimpleClaw swarm.
          Each execution consumes 1 credit.
        </p>

        <Suspense fallback={<div>Loading topup settings...</div>}>
            <TopUpContent />
        </Suspense>
      </div>
    </div>
  );
}
