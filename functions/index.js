const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const crypto = require('node:crypto');

initializeApp();
const auth = getAuth();
const db = getFirestore();
const AUTH_EMAIL_DOMAIN = 'accounts.activeplus.app';
const HANDLE = /^[a-z][a-z0-9._]{3,19}$/;
const PHONE = /^01[3-9]\d{8}$/;
const STAFF_ROLES = new Set(['manager', 'teacher', 'payment', 'student']);

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}
function normalizePhone(value) {
  let v = String(value || '').trim().replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d));
  v = v.replace(/[\s()+-]/g, '');
  if (v.startsWith('+880')) v = `0${v.slice(4)}`;
  else if (v.startsWith('880')) v = `0${v.slice(3)}`;
  return v;
}
function validateProfile(data, { requirePhone = true } = {}) {
  const fullName = String(data.fullName || '').trim().replace(/\s+/g, ' ');
  const mobile = normalizePhone(data.mobile);
  const email = String(data.email || '').trim().toLowerCase();
  const username = normalizeUsername(data.username);
  const password = String(data.password || '');
  if (fullName.length < 2 || fullName.length > 100) throw new HttpsError('invalid-argument', 'পূর্ণ নাম ২–১০০ অক্ষরের হতে হবে।');
  if (requirePhone && !PHONE.test(mobile)) throw new HttpsError('invalid-argument', 'সঠিক বাংলাদেশি মোবাইল নম্বর লিখুন।');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpsError('invalid-argument', 'ইমেইল ঠিকানা সঠিক নয়।');
  if (!HANDLE.test(username) || ['admin', 'administrator', 'root', 'null', 'undefined'].includes(username)) throw new HttpsError('invalid-argument', 'ইউজারনেম গ্রহণযোগ্য নয়।');
  if (password.length < 8 || password.length > 128) throw new HttpsError('invalid-argument', 'পাসওয়ার্ড ৮–১২৮ অক্ষরের হতে হবে।');
  return { fullName, mobile, email, username, password };
}
function requireCaller(request, role) {
  if (!request.auth || request.auth.token.status !== 'active' || request.auth.token.role !== role || request.auth.token.mustChangePassword === true) {
    throw new HttpsError('permission-denied', `সক্রিয় ${role} অনুমতি প্রয়োজন।`);
  }
}
function usernameDoc(username) { return db.doc(`usernameIndex/${username}`); }
function authEmail(username) { return `user.${username}@${AUTH_EMAIL_DOMAIN}`; }

/** One-time global bootstrap. The Firestore lock is claimed before creating Auth,
 * so concurrent first-admin requests cannot create two owners. */
exports.createFirstAdmin = onCall(async request => {
  const profile = validateProfile(request.data || {});
  const claimId = crypto.randomUUID();
  const bootstrapRef = db.doc('system/bootstrap');
  await db.runTransaction(async tx => {
    const lock = await tx.get(bootstrapRef);
    if (lock.exists) throw new HttpsError('already-exists', 'Initial Admin ইতিমধ্যে তৈরি হয়েছে।');
    tx.create(bootstrapRef, { state: 'provisioning', claimId, requestedAt: FieldValue.serverTimestamp() });
  });

  let user;
  const createdUsers = [];
  try {
    user = await auth.createUser({ email: authEmail(profile.username), password: profile.password, displayName: profile.fullName, disabled: false });
    createdUsers.push(user);
    await auth.setCustomUserClaims(user.uid, { role: 'admin', status: 'active', mustChangePassword: false });

    // One bootstrap identity for each operational staff role. The generated
    // passwords are returned once to the first Admin and are never written to Firestore.
    const bootstrapAccounts = [];
    for (const role of ['manager', 'teacher', 'payment']) {
      const username = `${role}.${crypto.randomBytes(4).toString('hex')}`;
      const password = crypto.randomBytes(18).toString('base64url');
      const staff = await auth.createUser({ email: authEmail(username), password, displayName: `প্রাথমিক ${role} অ্যাকাউন্ট`, disabled: false });
      createdUsers.push(staff);
      await auth.setCustomUserClaims(staff.uid, { role, status: 'active', mustChangePassword: true });
      bootstrapAccounts.push({ uid: staff.uid, role, username, password });
    }

    await db.runTransaction(async tx => {
      const lock = await tx.get(bootstrapRef);
      const handles = [profile.username, ...bootstrapAccounts.map(account => account.username)];
      const handleRefs = handles.map(usernameDoc);
      const handleDocs = await Promise.all(handleRefs.map(ref => tx.get(ref)));
      if (!lock.exists || lock.data().claimId !== claimId || handleDocs.some(doc => doc.exists)) {
        throw new HttpsError('already-exists', 'Admin bootstrap অথবা username claim আর উপলভ্য নেই।');
      }
      const now = FieldValue.serverTimestamp();
      tx.create(handleRefs[0], { uid: user.uid, role: 'admin', createdAt: now });
      tx.create(db.doc(`users/${user.uid}`), {
        uid: user.uid, role: 'admin', status: 'active', accountOwner: 'first-admin',
        fullName: profile.fullName, mobile: profile.mobile, email: profile.email,
        username: profile.username, createdAt: now, updatedAt: now
      });
      bootstrapAccounts.forEach((account, index) => {
        tx.create(handleRefs[index + 1], { uid: account.uid, role: account.role, createdAt: now });
        tx.create(db.doc(`users/${account.uid}`), {
          uid: account.uid, role: account.role, status: 'active', accountOwner: user.uid,
          fullName: `প্রাথমিক ${account.role} অ্যাকাউন্ট`, mobile: '', email: '',
          username: account.username, mustChangePassword: true, createdAt: now, updatedAt: now,
          bootstrapAccount: true
        });
      });
      tx.update(bootstrapRef, { state: 'active', uid: user.uid, username: profile.username, createdAt: now, claimId: FieldValue.delete() });
    });
    return {
      ok: true, uid: user.uid, username: profile.username, role: 'admin', status: 'active',
      bootstrapAccounts: bootstrapAccounts.map(({ role, username, password }) => ({ role, username, password }))
    };
  } catch (error) {
    await Promise.all(createdUsers.map(created => auth.deleteUser(created.uid).catch(() => {})));
    await db.runTransaction(async tx => {
      const lock = await tx.get(bootstrapRef);
      if (lock.exists && lock.data().claimId === claimId) tx.delete(bootstrapRef);
    }).catch(() => {});
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', 'Initial Admin তৈরি হয়নি; আবার চেষ্টা করুন।');
  }
});

/** Admin provisions Manager/Teacher/Payment/Student identities. Student accounts
 * start pending; only Manager can approve/reject them. */
exports.adminCreateAccount = onCall(async request => {
  requireCaller(request, 'admin');
  const profile = validateProfile(request.data || {});
  const role = String(request.data.role || '');
  if (!STAFF_ROLES.has(role)) throw new HttpsError('invalid-argument', 'এই role তৈরি করা যাবে না।');
  const ref = usernameDoc(profile.username);
  const lockId = crypto.randomUUID();
  await db.runTransaction(async tx => {
    const doc = await tx.get(ref);
    if (doc.exists) throw new HttpsError('already-exists', 'এই username ইতিমধ্যে ব্যবহৃত।');
    tx.create(ref, { reservation: lockId, role, state: 'provisioning', createdAt: FieldValue.serverTimestamp() });
  });
  let user;
  try {
    user = await auth.createUser({ email: authEmail(profile.username), password: profile.password, displayName: profile.fullName, disabled: false });
    const status = role === 'student' ? 'pending' : 'active';
    await auth.setCustomUserClaims(user.uid, { role, status, mustChangePassword: role !== 'student' });
    await db.runTransaction(async tx => {
      const current = await tx.get(ref);
      if (!current.exists || current.data().reservation !== lockId) throw new HttpsError('aborted', 'Username reservation বদলে গেছে।');
      const now = FieldValue.serverTimestamp();
      tx.set(ref, { uid: user.uid, role, createdAt: now });
      tx.create(db.doc(`users/${user.uid}`), {
        uid: user.uid, role, status, fullName: profile.fullName, mobile: profile.mobile,
        email: profile.email, username: profile.username, accountOwner: request.auth.uid,
        mustChangePassword: role !== 'student', createdAt: now, updatedAt: now
      });
      if (role === 'student') tx.create(db.doc(`students/${user.uid}`), {
        uid: user.uid, fullName: profile.fullName, mobile: profile.mobile, email: profile.email,
        username: profile.username, status: 'pending', createdAt: now
      });
    });
    return { ok: true, uid: user.uid, role, status, username: profile.username };
  } catch (error) {
    if (user) await auth.deleteUser(user.uid).catch(() => {});
    await db.runTransaction(async tx => {
      const current = await tx.get(ref);
      if (current.exists && current.data().reservation === lockId) tx.delete(ref);
    }).catch(() => {});
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', 'Account তৈরি হয়নি; আবার চেষ্টা করুন।');
  }
});

/** Bootstrap staff accounts cannot access app data until Firebase Auth confirms a
 * password change. The client calls this after updatePassword(), then refreshes its ID token. */
exports.completeTemporaryPasswordChange = onCall(async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'প্রবেশ করুন।');
  if (request.auth.token.mustChangePassword !== true) return { ok: true, alreadyComplete: true };
  const user = await auth.getUser(request.auth.uid);
  const createdAt = Date.parse(user.metadata.creationTime || '');
  const passwordUpdatedAt = Date.parse(user.metadata.passwordUpdatedAt || '');
  if (!Number.isFinite(passwordUpdatedAt) || passwordUpdatedAt <= createdAt) {
    throw new HttpsError('failed-precondition', 'প্রথমে নতুন পাসওয়ার্ড সেট করুন।');
  }
  const profileRef = db.doc(`users/${user.uid}`);
  await db.runTransaction(async tx => {
    const profile = await tx.get(profileRef);
    if (!profile.exists || profile.data().status !== 'active') throw new HttpsError('permission-denied', 'সক্রিয় Account প্রয়োজন।');
    tx.update(profileRef, { mustChangePassword: false, updatedAt: FieldValue.serverTimestamp() });
  });
  await auth.setCustomUserClaims(user.uid, { ...user.customClaims, mustChangePassword: false });
  return { ok: true, refreshIdToken: true };
});

/** Only Manager may decide a pending student approval. Admin is intentionally
 * not accepted by this callable; Firestore rules enforce the same boundary. */
exports.managerReviewStudent = onCall(async request => {
  requireCaller(request, 'manager');
  const uid = String(request.data.uid || '');
  const decision = String(request.data.decision || '');
  const note = String(request.data.note || '').trim().slice(0, 500);
  if (!uid || !['approved', 'rejected'].includes(decision)) throw new HttpsError('invalid-argument', 'শিক্ষার্থী ও সিদ্ধান্ত নির্বাচন করুন।');
  const studentRef = db.doc(`students/${uid}`);
  const userRef = db.doc(`users/${uid}`);
  await db.runTransaction(async tx => {
    const student = await tx.get(studentRef);
    const user = await tx.get(userRef);
    if (!student.exists || !user.exists || student.data().status !== 'pending' || user.data().role !== 'student') {
      throw new HttpsError('failed-precondition', 'এই শিক্ষার্থী আর অপেক্ষমাণ নেই।');
    }
    const status = decision;
    tx.update(studentRef, { status, reviewedBy: request.auth.uid, reviewedAt: FieldValue.serverTimestamp(), reviewNote: note });
    tx.update(userRef, { status, reviewedBy: request.auth.uid, reviewedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  });
  const user = await auth.getUser(uid);
  await auth.setCustomUserClaims(uid, { ...user.customClaims, role: 'student', status: decision });
  return { ok: true, uid, status: decision };
});

/** Manager is the only role allowed to publish/reject pending exam records. */
exports.managerReviewExam = onCall(async request => {
  requireCaller(request, 'manager');
  const examId = String(request.data.examId || '');
  const decision = String(request.data.decision || '');
  const note = String(request.data.note || '').trim().slice(0, 500);
  if (!examId || !['publish', 'reject'].includes(decision)) throw new HttpsError('invalid-argument', 'পরীক্ষা ও সিদ্ধান্ত নির্বাচন করুন।');
  if (decision === 'reject' && !note) throw new HttpsError('invalid-argument', 'সংশোধনের কারণ লিখুন।');
  const ref = db.doc(`exams/${examId}`);
  await db.runTransaction(async tx => {
    const exam = await tx.get(ref);
    if (!exam.exists || exam.data().status !== 'pending') throw new HttpsError('failed-precondition', 'শুধু অপেক্ষমাণ পরীক্ষা পর্যালোচনা করা যাবে।');
    tx.update(ref, {
      status: decision === 'publish' ? 'published' : 'rejected',
      reviewedBy: request.auth.uid,
      reviewedAt: FieldValue.serverTimestamp(),
      reviewNote: decision === 'reject' ? note : '',
      ...(decision === 'publish' ? { publishedAt: FieldValue.serverTimestamp() } : {})
    });
  });
  return { ok: true, examId, status: decision === 'publish' ? 'published' : 'rejected' };
});

/** Admin can suspend/re-activate staff accounts, never approve a student. */
exports.adminSetAccountStatus = onCall(async request => {
  requireCaller(request, 'admin');
  const uid = String(request.data.uid || '');
  const status = String(request.data.status || '');
  if (!uid || !['active', 'suspended'].includes(status)) throw new HttpsError('invalid-argument', 'Account status সঠিক নয়।');
  const ref = db.doc(`users/${uid}`);
  await db.runTransaction(async tx => {
    const doc = await tx.get(ref);
    if (!doc.exists || doc.data().role === 'admin' || doc.data().role === 'student') {
      throw new HttpsError('failed-precondition', 'এই Account status Admin-এর মাধ্যমে বদলানো যাবে না।');
    }
    tx.update(ref, { status, updatedAt: FieldValue.serverTimestamp() });
  });
  const user = await auth.getUser(uid);
  await auth.setCustomUserClaims(uid, { ...user.customClaims, status });
  await auth.updateUser(uid, { disabled: status !== 'active' });
  return { ok: true, uid, status };
});
