/*
  Mirror of the backend role model (app/models/user.py). The server is the authority — this only
  decides what to show, so a viewer sees a disabled button with a reason instead of a 403 toast.
*/
export const ROLES = ['viewer', 'engineer', 'approver', 'admin']
export const ROLE_RANK = { viewer: 0, engineer: 1, approver: 2, admin: 3 }

export const ROLE_INFO = {
  viewer: 'Read everything',
  engineer: 'Run scans, triage findings, request fixes',
  approver: 'Approve or reject fixes, which applies them to AWS',
  admin: 'Everything, plus managing people and roles',
}

// action -> minimum role
export const ACTIONS = {
  'scan:run': 'engineer',
  'finding:triage': 'engineer',
  'remediation:preview': 'engineer',
  'remediation:request': 'engineer',
  'remediation:approve': 'approver',
  'iac:scan': 'engineer',
  'users:manage': 'admin',
}

export function can(user, action) {
  const need = ACTIONS[action]
  if (!user || !need) return false
  return ROLE_RANK[user.role] >= ROLE_RANK[need]
}

export function reasonFor(user, action) {
  if (can(user, action)) return null
  const need = ACTIONS[action]
  return `Needs the ${need} role — you are ${user?.role || 'signed out'}.`
}
