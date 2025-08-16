// Helper: extract roles/tenant/user from your JWT shape
function getRoles(user) {
  const claim = user['http://schemas.microsoft.com/ws/2008/06/identity/claims/role']
  return Array.isArray(claim) ? claim : claim ? [claim] : []
}
function getTenantId(user) {
  // Adjust to your token: CompanyId | tenantId | 'custom:tenant_id'
  return Number(user.CompanyId || user.tenantId || user['custom:tenant_id'] || 0)
}
function getUserId(user) {
  return Number(user.UserID || user.sub || user.userId || 0)
}

module.exports = { getRoles, getTenantId, getUserId }