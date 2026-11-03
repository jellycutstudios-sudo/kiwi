export function sameBusiness(source, target) {
  if (!source?.ownerUid || source.ownerUid !== target?.ownerUid) return false;
  if (source.businessGroupId || target.businessGroupId) return Boolean(source.businessGroupId && source.businessGroupId === target.businessGroupId);
  if (source.brandId || target.brandId) return Boolean(source.brandId && source.brandId === target.brandId);
  return true;
}

export function menuTargets(source, restaurants) {
  return restaurants.filter(branch => branch.id !== source?.id && sameBusiness(source, branch) &&
    (branch.currency || 'INR') === (source.currency || 'INR'));
}

export function orderDateMillis(value) {
  const date = typeof value?.toDate === 'function' ? value.toDate() : value;
  const result = new Date(date).getTime();
  return value != null && Number.isFinite(result) ? result : NaN;
}

export function summarizeOutlet(branch, snapshots, start, end) {
  const unique = new Map(snapshots.flatMap(snapshot => snapshot.docs.map(item => [item.id, item.data()])));
  const orders = [...unique.values()].filter(order => order.status === 'billed' &&
    orderDateMillis(order.createdAt) >= start.getTime() && orderDateMillis(order.createdAt) <= end.getTime());
  return {
    id: branch.id, name: branch.name, currency: branch.currency || 'INR',
    revenue: orders.reduce((sum, order) => sum + (Number.isFinite(Number(order.total)) ? Number(order.total) : 0), 0),
    ordersCount: orders.length,
  };
}

export function billingLoadMessage(errors) {
  const failures = Object.values(errors).filter(Boolean);
  if (failures.some(error => error.code?.endsWith('permission-denied'))) {
    return 'Business and billing access is not configured for this environment. Super admin access must also be allowed by the Firebase rules. Existing branch consoles and approval controls remain available.';
  }
  if (failures.some(error => error.code?.endsWith('unauthenticated'))) return 'Your session has expired. Sign in again to load businesses and billing.';
  return 'Businesses or billing could not be loaded. Check your connection and try again. Existing branch controls remain available.';
}
