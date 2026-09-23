// Single source of truth for the signed-in operator until real auth
// is wired up. Header chip and dashboard greeting both read from here.
export const currentUser = {
  firstName: 'Anshumaan',
  handle: 'secops-lead',
  role: 'Cloud Admin',
  initials: 'AS',
}
