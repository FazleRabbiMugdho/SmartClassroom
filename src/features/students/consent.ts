import { sha256 } from "@/lib/crypto";

// Biometric consent notice shown to the Admin before face enrolment. The hash of the exact
// text shown is stored with the consent record (version + time + actor).
export const CONSENT_VERSION = "v1";
export const CONSENT_NOTICE =
  "This student's face will be converted to a numeric template (embedding) used only to verify " +
  "classroom check-in with their card. The original photos are deleted immediately after processing. " +
  "Only Admins can enrol or delete this data, and it is deleted when the student is removed. " +
  "Confirm that the student (or their guardian) has agreed.";
export const CONSENT_NOTICE_SHA256 = sha256(CONSENT_NOTICE);
