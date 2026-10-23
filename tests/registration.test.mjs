import * as registrationState from '../lib/supabase/registration-state.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import * as registration from '../lib/supabase/registration.mjs';
import * as otpErrors from '../lib/supabase/otp-errors.mjs';

const require = createRequire(import.meta.url);
const valid = {
  firstName: ' Test ', middleName: ' Middle ', lastName: ' Patient ', suffix: ' Jr. ',
  gender: 'Female', birthday: '2000-02-29', mobileNumber: '+63 917 123 4567',
  username: 'Test_User', email: 'patient@example.com', password: 'AuthOnlyPass123!',
  confirmPassword: 'AuthOnlyPass123!', acceptedTerms: true,
};

test('signup metadata has exactly the nine trigger keys, no passwords or privileges', () => {
  const metadata = registration.buildSignupMetadata({ ...valid, role: 'ADMIN', owner: true });
  assert.deepEqual(metadata, {
    first_name: 'Test', middle_name: 'Middle', last_name: 'Patient', suffix: 'Jr.',
    gender: 'Female', date_of_birth: '2000-02-29', mobile_number: '+639171234567',
    username: 'Test_User', terms_accepted: true,
  });
  assert.equal(registration.buildSignupMetadata({ ...valid, acceptedTerms: 'true' }).terms_accepted, false);
  const optional = registration.buildSignupMetadata({ ...valid, middleName: ' ', suffix: undefined });
  assert.equal(optional.middle_name, null);
  assert.equal(optional.suffix, null);
});

test('Philippine mobiles normalize consistently and reject landlines or foreign numbers', () => {
  for (const value of ['09171234567', '0917 123 4567', '+63 917 123 4567', '639171234567', '+63 (917) 123-4567']) {
    assert.equal(registration.normalizePhilippineMobile(value), '+639171234567');
    assert.deepEqual(registration.validateRegistration({ ...valid, mobileNumber: value }), {});
  }
  for (const value of ['1234567', '+1 917 123 4567', '0281234567', '0917123456', '091712345678', '+6309171234567', 'abc']) {
    assert.equal(registration.normalizePhilippineMobile(value), null);
    assert(registration.validateRegistration({ ...valid, mobileNumber: value }).mobileNumber);
  }
});

test('required fields, explicit consent, real dates, username and phone are validated', () => {
  assert.deepEqual(registration.validateRegistration(valid), {});
  for (const key of ['firstName', 'lastName', 'gender', 'birthday', 'mobileNumber', 'username', 'email', 'password', 'confirmPassword']) {
    assert(registration.validateRegistration({ ...valid, [key]: '' })[key], key);
  }
  assert(registration.validateRegistration({ ...valid, acceptedTerms: false }).acceptedTerms);
  assert(registration.validateRegistration({ ...valid, acceptedTerms: 'true' }).acceptedTerms);
  assert(registration.validateRegistration({ ...valid, birthday: '2001-02-29' }).birthday);
  assert(registration.validateRegistration({ ...valid, birthday: '2999-01-01' }).birthday);
  assert(registration.validateRegistration({ ...valid, username: 'bad%name' }).username);
  assert(registration.validateRegistration({ ...valid, mobileNumber: 'abc' }).mobileNumber);
});

test('username RPC and compatibility query escape wildcards without reading full profiles', async () => {
  assert.equal(await registration.isUsernameAvailable({ rpc: async () => ({ data: false }) }, valid.username), false);
  const calls = [];
  const query = {
    select(column) { calls.push(column); return this; },
    ilike(column, pattern) { calls.push([column, pattern]); return this; },
    async limit(value) { assert.equal(value, 1); return { data: [] }; },
  };
  const client = { rpc: async () => ({ error: { code: 'PGRST202' } }), from(table) { assert.equal(table, 'profiles'); return query; } };
  assert.equal(await registration.isUsernameAvailable(client, 'Test_User'), true);
  assert.deepEqual(calls, ['username', ['username', 'Test\\_User']]);
  await assert.rejects(registration.isUsernameAvailable({ rpc: async () => ({ error: { code: '42501' } }) }, 'test'));
});

function renderRegistration(client, form = valid) {
  const state = [form, false, false, {}, '', '', false, '', '', false, false, false, 0];
  const routes = [];
  let cursor = 0;
  const exports = {};
  const source = require('typescript').transpileModule(readFileSync(new URL('../components/auth/RegisterForm.js', import.meta.url), 'utf8'), {
    compilerOptions: { module: require('typescript').ModuleKind.CommonJS, jsx: require('typescript').JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(source, { exports, require(name) {
    if (name === 'react') return {
      useState(initial) { const i = cursor++; return [i in state ? state[i] : initial, v => { state[i] = typeof v === 'function' ? v(state[i]) : v; }]; },
      useRef: value => ({ current: value }),
      useEffect() {},
    };
    if (name === 'next/navigation') return { useRouter: () => ({ replace: p => routes.push(p), refresh() {} }) };
    if (name.includes('registration-state.mjs')) return registrationState;
    if (name.includes('registration.mjs')) return registration;
    if (name.includes('otp-errors')) return otpErrors;
    if (name.includes('supabase/client')) return { supabase: client };
    if (name.includes('supabase/auth')) return { getRoleHomePath: async () => '/patient/profile' };
    return require(name);
  } });
  const flatten = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(flatten) : [node, ...flatten(node.props?.children)];
  return { state, routes, nodes() { cursor = 0; return flatten(exports.RegisterForm({})); } };
}

test('signup and email OTP use Auth only, with no client profile insert/update', async () => {
  const calls = [];
  const client = {
    rpc: async () => ({ data: true }),
    from() { throw new Error('Registration must not write profiles'); },
    auth: {
      getSession: async () => ({data:{session:null}}),
      async signUp(payload) { calls.push(payload); return { data: { user: { id: 'trigger-created-user' }, session: null } }; },
      async verifyOtp(payload) { assert.equal(payload.type, 'email'); return { data: { user: { id: 'trigger-created-user' } } }; },
    },
  };
  const ui = renderRegistration(client);
  await ui.nodes().find(n => n.props?.className === 'registration-form').props.onSubmit({ preventDefault() {} });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].password, valid.password);
  assert.deepEqual(calls[0].options.data, registration.buildSignupMetadata(valid));
  assert.equal(ui.state[7], valid.email);
  assert.equal(ui.routes.length, 0);
  ui.state[8] = '12345678';
  await ui.nodes().find(n => n.props?.className === 'registration-verify').props.onClick({ preventDefault() {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(ui.routes, ['/login']);
});

test('duplicate usernames and missing consent stop signup; race errors are clear', async () => {
  let signups = 0;
  const client = { rpc: async () => ({ data: false }), auth: { getSession: async () => ({data:{session:null}}), signUp: async () => { signups++; } } };
  const duplicate = renderRegistration(client);
  await duplicate.nodes().find(n => n.props?.className === 'registration-form').props.onSubmit({ preventDefault() {} });
  assert.match(duplicate.state[3].username, /already in use/);
  const noConsent = renderRegistration(client, { ...valid, acceptedTerms: false });
  await noConsent.nodes().find(n => n.props?.className === 'registration-form').props.onSubmit({ preventDefault() {} });
  assert(noConsent.state[3].acceptedTerms);
  assert.equal(signups, 0);
  assert.match(registration.getRegistrationError({ code: '23505', message: 'duplicate username' }), /username is already in use/);
  assert.match(registration.getRegistrationError({ code: 'unexpected_failure', message: 'Database error saving new user' }), /could not create your patient profile/);
  assert.match(registration.getRegistrationError({ code: 'validation_failed', message: 'Invalid metadata' }), /details were rejected/);
});

test('patient profile displays trigger-stored registration details using existing columns', async () => {
  const stored = { ...registration.buildSignupMetadata(valid), birthday: null, terms_accepted_at: '2026-01-01T00:00:00Z' };
  delete stored.terms_accepted;
  const ProfileForm = () => null;
  const api = {
    auth: { getUser: async () => ({ data: { user: { id: 'patient-id', email: valid.email } } }) },
    from(table) {
      return {
        select(projection) {
          if (table === 'profiles') assert(!projection.includes('full_name'));
          return this;
        },
        eq(column, value) { assert.equal(value, 'patient-id'); return this; },
        async maybeSingle() { return { data: table === 'profiles' ? stored : null, error: null }; },
      };
    },
  };
  const exports = {};
  const source = require('typescript').transpileModule(readFileSync(new URL('../app/(patient)/patient/profile/page.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: require('typescript').ModuleKind.CommonJS, jsx: require('typescript').JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(source, { exports, require(name) {
    if (name.includes('PatientProfileForm')) return { PatientProfileForm: ProfileForm };
    if (name.includes('supabase/server')) return { createSupabaseServerClient: async () => api };
    if (name === 'next/navigation') return { redirect() { throw new Error('Unexpected redirect'); } };
    return require(name);
  } });
  const flatten = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(flatten) : [node, ...flatten(node.props?.children)];
  const nodes = flatten(await exports.default());
  const contact = nodes.find(n => n.type === ProfileForm).props;
  assert.equal(contact.email, valid.email);
  for (const key of ['first_name', 'middle_name', 'last_name', 'suffix', 'gender', 'date_of_birth', 'mobile_number', 'username']) assert.equal(contact.initialProfile[key], stored[key], key);
});

test('verified and obfuscated duplicate signups never display confirmation', async () => {
  for (const user of [{id:'duplicate',identities:[]},{id:'verified',email_confirmed_at:'verified'}]) {
    const client={rpc:async()=>({data:true}),auth:{getSession:async()=>({data:{session:null}}),signUp:async()=>({data:{user,session:null}})}};
    const ui=renderRegistration(client);
    await ui.nodes().find(n=>n.props?.className==='registration-form').props.onSubmit({preventDefault(){}});
    assert.equal(ui.state[7],'');
    assert(!ui.nodes().some(n=>n.props?.className==='registration-otp'));
    if(user.email_confirmed_at) assert.deepEqual(ui.routes,['/login']);
    else assert.match(ui.state[4],/Forgot password/);
  }
});

test('already logged-in verified patient is routed before any signup', async () => {
  const client={auth:{getSession:async()=>({data:{session:{}}}),getUser:async()=>({data:{user:{id:'patient',email_confirmed_at:'verified'}}}),signUp:async()=>{throw Error('must not sign up');}}};
  const ui=renderRegistration(client);
  await ui.nodes().find(n=>n.props?.className==='registration-form').props.onSubmit({preventDefault(){}});
  assert.deepEqual(ui.routes,['/patient/profile']);
});
