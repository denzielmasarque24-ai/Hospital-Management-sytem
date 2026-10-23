import test from 'node:test';
import assert from 'node:assert/strict';
import { getLoginErrorMessage, safeAuthDiagnostic } from '../lib/supabase/login-errors.mjs';

test('login errors distinguish credentials, confirmation, throttling and outages', () => {
  assert.match(getLoginErrorMessage({code:'invalid_credentials',status:400}), /incorrect/);
  assert.match(getLoginErrorMessage({code:'email_not_confirmed',status:400}), /confirm your email/);
  assert.match(getLoginErrorMessage({code:'over_email_send_rate_limit',status:429}, 'send-code'), /hourly limit/);
  assert.match(getLoginErrorMessage({message:'Error sending magic link email',status:500}, 'send-code'), /email service/);
  assert.match(getLoginErrorMessage({message:'Failed to fetch'}), /connection/);
  assert.match(getLoginErrorMessage({status:503}), /temporarily unavailable/);
});

test('diagnostics retain the failing operation and Supabase status without email, codes or JWTs', () => {
  const diagnostic = safeAuthDiagnostic({code:'unexpected_failure',status:500,message:'Delivery failed for test@example.com 123456 https://example.com?token=secret abcdefghijklmnopqrstuvwxyz123456'}, 'send-code');
  assert.equal(diagnostic.operation, 'send-code');
  assert.equal(diagnostic.status, 500);
  assert.equal(diagnostic.code, 'unexpected_failure');
  for (const secret of ['test@example.com','123456','token=secret','abcdefghijklmnopqrstuvwxyz123456']) assert(!diagnostic.message.includes(secret));
});
