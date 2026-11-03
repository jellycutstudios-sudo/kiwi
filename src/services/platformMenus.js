import { collection, doc, getDocs, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { menuTargets, sameBusiness } from '../utils/platformAdministration';
import { prepareMasterMenuPayload } from '../utils/enterpriseMenuSync';

function assertOnline() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('Connect to the internet before updating branch menus.');
}

export async function pushBranchMenu(sourceId, targetIds, adjustment) {
  assertOnline();
  if (!sourceId || !targetIds.length || new Set(targetIds).size !== targetIds.length) throw new Error('Choose a source and distinct target branches.');
  if (!Number.isFinite(adjustment.value) || adjustment.value < (adjustment.type === 'percent' ? -100 : 0)) throw new Error('Enter a valid price adjustment.');
  const ids = [sourceId, ...targetIds];
  const branchRefs = ids.map(id => doc(db, 'restaurants', id));
  const initialBranches = await Promise.all(branchRefs.map(ref => getDoc(ref)));
  if (initialBranches.some(branch => !branch.exists())) throw new Error('A selected branch no longer exists.');
  const branches = initialBranches.map(branch => ({ ...branch.data(), id: branch.id }));
  const allowed = new Set(menuTargets(branches[0], branches).map(branch => branch.id));
  if (targetIds.some(id => !allowed.has(id))) throw new Error('Menu targets must belong to the source business and use the same currency.');
  const menus = await Promise.all(ids.map(id => getDocs(collection(db, 'restaurants', id, 'menu'))));
  if (!menus[0].docs.length) throw new Error('The source branch has no menu categories.');
  // Keep every target update in a single online transaction; no partial menu pushes.
  const plannedWrites = menus[0].docs.length * targetIds.length;
  if (plannedWrites > 400) throw new Error('This push is too large. Select fewer branches or categories (maximum 400 category updates).');
  await runTransaction(db, async tx => {
    const currentBranches = await Promise.all(branchRefs.map(ref => tx.get(ref)));
    const current = currentBranches.map(branch => ({ ...branch.data(), id: branch.id }));
    const eligible = new Set(menuTargets(current[0], current).map(branch => branch.id));
    if (currentBranches.some(branch => !branch.exists()) || targetIds.some(id => !eligible.has(id))) throw new Error('Branch ownership or billing currency changed. Review the selected branches.');
    const categories = await Promise.all(menus.map(menu =>
      Promise.all(menu.docs.map(item => tx.get(item.ref)))
    ));
    if (categories.flat().some(category => !category.exists())) throw new Error('A menu changed while preparing the push. Refresh and try again.');
    const payload = prepareMasterMenuPayload(categories[0].map(category => category.data()), { adjustment });
    targetIds.forEach((targetId, index) => {
      const byName = new Map(categories[index + 1].map(category => [String(category.data().name || '').trim().toLowerCase(), category.ref]));
      payload.forEach(category => {
        const key = category.name.trim().toLowerCase();
        const ref = byName.get(key) || doc(collection(db, 'restaurants', targetId, 'menu'));
        byName.set(key, ref);
        tx.set(ref, { ...category, updatedAt: serverTimestamp(), pushedFromMaster: sourceId }, { merge: true });
      });
    });
  });
  return targetIds.length;
}

export async function setBusinessDishAvailability(sourceId, branchIds, dishName, available) {
  assertOnline();
  const name = dishName.trim().toLowerCase();
  if (!sourceId || !branchIds.length || !name) throw new Error('Choose a source business and enter the full dish name.');
  const ids = [...new Set([sourceId, ...branchIds])];
  const branchRefs = ids.map(id => doc(db, 'restaurants', id));
  const menus = await Promise.all(branchIds.map(id => getDocs(collection(db, 'restaurants', id, 'menu'))));
  const categoryRefs = menus.flatMap(menu => menu.docs.map(category => category.ref));
  if (categoryRefs.length > 400) throw new Error('This update is too large. Update fewer branches (maximum 400 categories).');
  let count = 0;
  await runTransaction(db, async tx => {
    const branches = await Promise.all(branchRefs.map(ref => tx.get(ref)));
    if (branches.some(branch => !branch.exists())) throw new Error('A selected branch no longer exists.');
    const source = branches[0].data();
    if (branches.some(branch => !sameBusiness(source, branch.data()))) throw new Error('Availability changes must stay within the source business.');
    const categories = await Promise.all(categoryRefs.map(ref => tx.get(ref)));
    if (categories.some(category => !category.exists())) throw new Error('A menu changed. Refresh and try again.');
    const affected = new Set();
    categories.forEach(category => {
      let modified = false;
      const items = (category.data().items || []).map(item => {
        if (String(item.name || '').trim().toLowerCase() !== name) return item;
        modified = true;
        return { ...item, available, eightySixedAt: available ? null : new Date().toISOString() };
      });
      if (modified) {
        affected.add(category.ref.parent.parent.id);
        tx.update(category.ref, { items, updatedAt: serverTimestamp() });
      }
    });
    count = affected.size;
  });
  return count;
}
