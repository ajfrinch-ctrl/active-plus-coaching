#!/usr/bin/env node
/* Builds database.rules.v2.draft.json — the PROPOSED per-user/role Realtime
   Database rules described in docs/RTDB-PER-USER-RULES-PLAN.md.

   This is a DRAFT. firebase.json still deploys database.rules.json (deny-all)
   and must keep doing so until every "before enabling" item in the plan is
   done and the emulator suite passes. Do not point firebase.json at this file
   to "make sync work".

   RTDB rule expressions have no functions, so the role predicates are built
   here once and inlined. Run:  node tools/rtdb-rules/build-v2-draft.mjs
   tests/rtdb-v2-draft-rules.test.mjs fails if the committed JSON is stale. */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const V2_ROOT = 'activePlusV2';

// ---- identity predicates --------------------------------------------------
// Claims are set only by Cloud Functions (Admin SDK): role, status,
// mustChangePassword, and the app-record links studentId / teacherId.
// An anonymous identity never carries a role claim; it is also rejected
// explicitly so a future claim mistake cannot silently re-open the bridge.
const signedIn = "auth != null && auth.token.firebase.sign_in_provider !== 'anonymous' && auth.token.mustChangePassword !== true";
const staff = role => `(${signedIn} && auth.token.status === 'active' && auth.token.role === '${role}')`;
const any = (...parts) => parts.length === 1 ? parts[0] : `(${parts.join(' || ')})`;

const ADMIN = staff('admin');
const MANAGER = staff('manager');
const TEACHER = `(${signedIn} && auth.token.status === 'active' && auth.token.role === 'teacher' && auth.token.teacherId != null)`;
const PAYMENT = staff('payment');
const STUDENT = `(${signedIn} && auth.token.status === 'approved' && auth.token.role === 'student' && auth.token.studentId != null)`;
const ANY_STAFF = `(${signedIn} && auth.token.status === 'active' && (auth.token.role === 'admin' || auth.token.role === 'manager' || auth.token.role === 'payment' || (auth.token.role === 'teacher' && auth.token.teacherId != null)))`;
const ANY_ACTIVE = any(ANY_STAFF, STUDENT);
const ownStudent = variable => `(${STUDENT} && ${variable} === auth.token.studentId)`;

// ---- shared record checks -------------------------------------------------
const idMatches = variable => `newData.child('id').val() === ${variable}`;
const deleting = '!newData.exists()';
const creating = '!data.exists()';
const examStatusEditable = "(newData.child('status').val() === 'draft' || newData.child('status').val() === 'pending')";

/** Collection readable by `reader` as a whole (the app listens per collection;
    rules are not filters), records writable one at a time by `writer`. */
function collection({ read, write, validate }) {
  const record = { '.write': write };
  if (validate) record['.validate'] = validate;
  return { '.read': read, $recordId: record };
}

export function buildRules() {
  return {
    rules: {
      // Everything not listed below — including the root — is denied.
      '.read': false,
      '.write': false,

      // Legacy anonymous bridge: credential mirrors (staffAccounts,
      // studentAccounts, usernames, staffDirectory, pushTokens). Never
      // re-opened; export with the Admin SDK and delete after migration.
      activePlusSync: { '.read': false, '.write': false },

      [V2_ROOT]: {
        // A single document (includes the urgent broadcast → pushBroadcast).
        settings: { '.read': ANY_ACTIVE, '.write': ADMIN },

        notices: collection({
          read: ANY_ACTIVE,
          write: ADMIN,
          validate: idMatches('$recordId')
        }),
        // Routine day markers ("day-sat") carry no `id`, so no id check here.
        routine: collection({ read: ANY_ACTIVE, write: any(ADMIN, TEACHER) }),
        teaching: collection({
          read: ANY_ACTIVE,
          write: any(ADMIN, TEACHER),
          validate: idMatches('$recordId')
        }),
        teacherAssignments: collection({
          read: any(ADMIN, MANAGER, TEACHER),
          write: any(ADMIN, MANAGER),
          validate: idMatches('$recordId')
        }),

        // Roster (PII: mobile numbers, guardians, fees). A student reads only
        // their own record; the device must listen to students/<studentId>.
        students: {
          '.read': any(ADMIN, MANAGER, PAYMENT, TEACHER),
          $studentId: {
            '.read': ownStudent('$studentId'),
            '.write': any(ADMIN, MANAGER),
            '.validate': idMatches('$studentId')
          }
        },

        // Money. Payment may only CREATE; corrections/deletions are Admin's.
        transactions: collection({
          read: any(ADMIN, PAYMENT),
          write: any(ADMIN, `(${PAYMENT} && ${creating} && newData.exists())`),
          validate: `${idMatches('$recordId')} && newData.child('studentId').isString() && newData.child('studentId').val().length > 0`
        }),
        // Per-student copy maintained by a Cloud Function trigger.
        studentLedger: {
          '.read': any(ADMIN, PAYMENT),
          $studentId: { '.read': ownStudent('$studentId') }
        },

        // Full papers incl. answer keys: staff only. Manager publish/reject
        // goes through the managerReviewExam callable (Admin SDK), never a
        // direct client write.
        exams: {
          '.read': any(ADMIN, MANAGER, TEACHER),
          $examId: {
            '.write': any(
              `(${TEACHER} && (${creating} || (data.child('teacherId').val() === auth.token.teacherId && data.child('status').val() !== 'published')) && newData.child('teacherId').val() === auth.token.teacherId && ${examStatusEditable})`,
              `(${ADMIN} && (${deleting} || ((${creating} || data.child('status').val() !== 'published') && ${examStatusEditable})))`
            ),
            '.validate': `${idMatches('$examId')} && newData.child('teacherId').isString()`
          }
        },
        // Published paper WITHOUT answers, fanned out per participant by a
        // Cloud Function. Also the push-targeting source.
        studentExams: {
          '.read': any(ADMIN, MANAGER, TEACHER),
          $studentId: { '.read': ownStudent('$studentId') }
        },

        // One subtree per student so rules can bind attempts to the claim.
        attempts: {
          '.read': any(ADMIN, MANAGER, TEACHER),
          $studentId: {
            '.read': ownStudent('$studentId'),
            $attemptId: {
              '.write': any(
                `(${ownStudent('$studentId')} && newData.exists() && (${creating} || data.child('status').val() !== 'submitted') && root.child('${V2_ROOT}/studentExams').child($studentId).child(newData.child('examId').val()).exists())`,
                `(${ADMIN} && ${deleting})`
              ),
              '.validate': `${idMatches('$attemptId')} && newData.child('studentId').val() === $studentId && newData.child('examId').isString() && (newData.child('status').val() === 'active' || newData.child('status').val() === 'queued' || newData.child('status').val() === 'submitted') && newData.child('startedAt').isNumber() && newData.child('startedAt').val() <= now`
            }
          }
        },
        // Scores computed server-side from the answer key.
        results: {
          '.read': any(ADMIN, MANAGER, TEACHER),
          $studentId: { '.read': ownStudent('$studentId') }
        },

        // Write-only for the owner; read only by Cloud Functions.
        pushTokens: {
          $uid: {
            $deviceId: {
              '.write': `${ANY_ACTIVE} && auth.uid === $uid`,
              '.validate': "newData.child('token').isString() && newData.child('token').val().length > 20 && newData.child('token').val().length <= 4096 && newData.child('role').val() === auth.token.role && ((auth.token.role === 'student' && newData.child('studentId').val() === auth.token.studentId) || (auth.token.role !== 'student' && (newData.child('studentId').val() === null || newData.child('studentId').val() === '')))"
            }
          }
        }
      }
    }
  };
}

export const DRAFT_PATH = new URL('../../database.rules.v2.draft.json', import.meta.url);
export const render = () => JSON.stringify(buildRules(), null, 2) + '\n';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(DRAFT_PATH, render());
  console.log('wrote', fileURLToPath(DRAFT_PATH));
}
