import test from 'node:test';
import assert from 'node:assert/strict';
import { signupNeedsConfirmation, getVerifiedSessionUser, readPendingRegistration, savePendingRegistration, clearPendingRegistration } from '../lib/supabase/registration-state.mjs';
import { getOtpVerificationMessage } from '../lib/supabase/otp-errors.mjs';

test('new and existing unverified users require confirmation; verified and obfuscated duplicates do not', () => {
  assert.equal(signupNeedsConfirmation({user:{id:'new',identities:[{}]},session:null}),true);
  assert.equal(signupNeedsConfirmation({user:{id:'unverified'},session:null}),true);
  assert.equal(signupNeedsConfirmation({user:{id:'duplicate',identities:[]},session:null}),false);
  assert.equal(signupNeedsConfirmation({user:{email_confirmed_at:'2026-01-01'},session:null}),false);
});

test('session restoration validates the current user with Auth rather than trusting cached confirmation', async () => {
  let reads=0;
  const client={auth:{getSession:async()=>({data:{session:{user:{email_confirmed_at:'cached'}}}}),getUser:async()=>{reads++;return {data:{user:{id:'patient',email_confirmed_at:null}}};}}};
  assert.equal(await getVerifiedSessionUser(client),null);
  client.auth.getUser=async()=>{reads++;return {data:{user:{id:'admin',email_confirmed_at:'verified'}}};};
  assert.equal((await getVerifiedSessionUser(client)).id,'admin');
  client.auth.getSession=async()=>({data:{session:null}});
  assert.equal(await getVerifiedSessionUser(client),null);
  assert.equal(reads,2);
});

test('refresh restores only the pending email and cooldown, and confirmation clears them', () => {
  const values=new Map();
  globalThis.sessionStorage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  try {
    const deadline=Date.now()+60000;
    savePendingRegistration('patient@example.com',deadline);
    assert.equal(readPendingRegistration().email,'patient@example.com');
    assert.equal(readPendingRegistration().resendAt,deadline);
    assert.deepEqual(Object.keys(readPendingRegistration()).sort(),['email','expiresAt','resendAt']);
    clearPendingRegistration();
    assert.equal(readPendingRegistration(),null);
  } finally { delete globalThis.sessionStorage; }
});

test('expired, incorrect and consumed OTP responses produce clear messages', () => {
  assert.match(getOtpVerificationMessage({code:'token_expired'}),/expired/);
  assert.match(getOtpVerificationMessage({code:'invalid_otp'}),/does not match/);
  assert.match(getOtpVerificationMessage({code:'otp_already_used'}),/already been used/);
  assert.match(getOtpVerificationMessage({code:'otp_expired'}),/incorrect, expired, or already used/);
});
