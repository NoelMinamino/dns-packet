export type RCode = "NOERROR"
  | "FORMERR"
  | "SERVFAIL"
  | "NXDOMAIN"
  | "NOTIMP"
  | "REFUSED"
  | "YXDOMAIN"
  | "YXRRSET"
  | "NXRRSET"
  | "NOTAUTH"
  | "NOTZONE"
  | "DSOTYPENI"
  | "BADVERS"
  | "BADKEY"
  | "BADTIME"
  | "BADMODE"
  | "BADNAME"
  | "BADALG"
  | "BADTRUNC"
  | "BADCOOKIE"
  | string;

/** @deprecated kept for compatibility; use Classes from classes.js */
export type RecordClass = "IN" | "CS" | "CH" | "HS" | "NONE" | "ANY" | string;

export function toString (rcode: number): RCode;
export function toRcode (name: RCode): number;
